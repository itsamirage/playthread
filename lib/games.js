import { useEffect, useMemo, useState } from "react";

import {
  fetchCatalogGames,
  fetchDiscoverGames,
  fetchGameById,
  fetchStarterGames,
  isIgdbConfigured,
  searchGames,
} from "./igdb";
import { getMockGameById, mockGames } from "./mockGames";

let discoverCache = null;
let starterCache = null;
const detailCache = new Map();
const searchCache = new Map();

function normalizeSearchValue(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isSubsequenceMatch(query, candidate) {
  let queryIndex = 0;

  for (let index = 0; index < candidate.length && queryIndex < query.length; index += 1) {
    if (candidate[index] === query[queryIndex]) {
      queryIndex += 1;
    }
  }

  return queryIndex === query.length;
}

function getEditDistance(left, right) {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    let diagonalValue = previousRow[0];
    previousRow[0] = leftIndex + 1;

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const currentValue = previousRow[rightIndex + 1];
      const cost = left[leftIndex] === right[rightIndex] ? 0 : 1;

      previousRow[rightIndex + 1] = Math.min(
        previousRow[rightIndex + 1] + 1,
        previousRow[rightIndex] + 1,
        diagonalValue + cost
      );
      diagonalValue = currentValue;
    }
  }

  return previousRow[right.length];
}

function isFuzzyWordMatch(query, candidateWords) {
  if (!query) {
    return true;
  }

  return candidateWords.some((candidateWord) => {
    if (candidateWord.includes(query) || isSubsequenceMatch(query, candidateWord)) {
      return true;
    }

    if (query.length < 4 || Math.abs(candidateWord.length - query.length) > 2) {
      return false;
    }

    const maxDistance = query.length >= 5 ? 2 : 1;
    return getEditDistance(query, candidateWord) <= maxDistance;
  });
}

function getGameSearchText(game) {
  return normalizeSearchValue([game.title, game.studio, game.genre, ...(game.genres ?? [])].join(" "));
}

function matchesQueryFuzzily(game, query) {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return true;
  }

  const searchText = getGameSearchText(game);
  const candidateWords = Array.from(new Set(searchText.split(" ").filter(Boolean)));
  const queryTerms = normalizedQuery.split(" ").filter(Boolean);

  return queryTerms.every(
    (queryTerm) => searchText.includes(queryTerm) || isFuzzyWordMatch(queryTerm, candidateWords)
  );
}

function scoreGameSearchMatch(game, query) {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return 0;
  }

  const title = normalizeSearchValue(game.title);
  const studio = normalizeSearchValue(game.studio);
  const genreText = normalizeSearchValue([game.genre, ...(game.genres ?? [])].join(" "));
  const candidateWords = Array.from(
    new Set([title, studio, genreText].join(" ").split(" ").filter(Boolean))
  );
  const queryTerms = normalizedQuery.split(" ").filter(Boolean);
  let score = 0;

  if (title === normalizedQuery) {
    score += 200;
  } else if (title.includes(normalizedQuery)) {
    score += 120;
  }

  for (const queryTerm of queryTerms) {
    if (title.includes(queryTerm)) {
      score += 30;
      continue;
    }

    if (studio.includes(queryTerm) || genreText.includes(queryTerm)) {
      score += 12;
      continue;
    }

    if (isFuzzyWordMatch(queryTerm, candidateWords)) {
      score += 18;
    }
  }

  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  const compactTitle = title.replace(/\s+/g, "");
  const titleDistance = getEditDistance(compactQuery, compactTitle.slice(0, compactQuery.length));

  score -= Math.min(titleDistance, 20);
  return score;
}

function rankGamesByQuery(games, query) {
  return [...games].sort((firstGame, secondGame) => {
    const secondScore = scoreGameSearchMatch(secondGame, query);
    const firstScore = scoreGameSearchMatch(firstGame, query);

    if (secondScore !== firstScore) {
      return secondScore - firstScore;
    }

    return secondGame.metacritic - firstGame.metacritic;
  });
}

function buildSearchFallbackQueries(query) {
  const normalizedQuery = normalizeSearchValue(query);
  const queryTerms = normalizedQuery.split(" ").filter(Boolean);
  const fallbackQueries = [];

  for (let length = queryTerms.length - 1; length >= 1; length -= 1) {
    fallbackQueries.push(queryTerms.slice(0, length).join(" "));
  }

  for (let startIndex = 1; startIndex < queryTerms.length; startIndex += 1) {
    fallbackQueries.push(queryTerms.slice(startIndex).join(" "));
  }

  for (const queryTerm of queryTerms) {
    fallbackQueries.push(queryTerm);
  }

  return [...new Set(fallbackQueries.filter(Boolean))];
}

async function searchGamesWithFallback(query, { limit = 20 } = {}) {
  const primaryGames = await searchGames(query, { limit });

  if (primaryGames.length > 0) {
    return rankGamesByQuery(primaryGames, query);
  }

  const fallbackQueries = buildSearchFallbackQueries(query);

  if (fallbackQueries.length === 0) {
    return [];
  }

  const mergedGames = [];
  const seenGameIds = new Set();

  for (const fallbackQuery of fallbackQueries) {
    const fallbackGames = await searchGames(fallbackQuery, { limit });

    for (const game of fallbackGames) {
      if (seenGameIds.has(game.id)) {
        continue;
      }

      seenGameIds.add(game.id);
      mergedGames.push(game);
    }

    if (mergedGames.length >= limit * 2) {
      break;
    }
  }

  return rankGamesByQuery(
    mergedGames.filter((game) => matchesQueryFuzzily(game, query)).slice(0, limit),
    query
  );
}

function sortByMetacritic(games) {
  return [...games].sort(
    (firstGame, secondGame) => secondGame.metacritic - firstGame.metacritic
  );
}

function filterGames(games, query, selectedGenre) {
  const cleanQuery = query.trim().toLowerCase();

  return games.filter((game) => {
    const genrePool = [game.genre, ...(game.genres ?? [])].join(" ").toLowerCase();
    const matchesQuery =
      cleanQuery.length === 0 ||
      game.title.toLowerCase().includes(cleanQuery) ||
      game.studio.toLowerCase().includes(cleanQuery) ||
      genrePool.includes(cleanQuery);

    const matchesGenre =
      selectedGenre === "All" ||
      game.genre === selectedGenre ||
      (game.genres ?? []).includes(selectedGenre);

    return matchesQuery && matchesGenre;
  });
}

export function useBrowseGames({ query, selectedGenre }) {
  const cleanQuery = query.trim();
  const [debouncedQuery, setDebouncedQuery] = useState(cleanQuery);
  const [games, setGames] = useState(discoverCache ?? sortByMetacritic(mockGames));
  const [isLoading, setIsLoading] = useState(
    !cleanQuery && !discoverCache && isIgdbConfigured()
  );
  const [source, setSource] = useState(discoverCache ? "igdb" : "mock");
  const [error, setError] = useState(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(cleanQuery);
    }, 250);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [cleanQuery]);

  useEffect(() => {
    let isMounted = true;

    const loadGames = async () => {
      if (debouncedQuery.length > 0 && debouncedQuery.length < 2) {
        if (isMounted) {
          setError(null);
          setIsLoading(false);
        }

        return;
      }

      if (debouncedQuery) {
        if (!isIgdbConfigured()) {
          if (isMounted) {
            setGames(sortByMetacritic(filterGames(mockGames, debouncedQuery, "All")));
            setSource("mock");
            setIsLoading(false);
          }

          return;
        }

        const cacheKey = debouncedQuery.toLowerCase();

        if (searchCache.has(cacheKey)) {
          if (isMounted) {
            setGames(searchCache.get(cacheKey));
            setSource("igdb");
            setError(null);
            setIsLoading(false);
          }

          return;
        }

        try {
          if (isMounted) {
            setIsLoading(true);
          }

          const nextGames = await searchGamesWithFallback(debouncedQuery, { limit: 20 });
          searchCache.set(cacheKey, nextGames);

          if (isMounted) {
            setGames(nextGames);
            setSource("igdb");
            setError(null);
          }
        } catch (nextError) {
          if (isMounted) {
            setGames(sortByMetacritic(filterGames(mockGames, debouncedQuery, "All")));
            setSource("mock");
            setError(nextError);
          }
        } finally {
          if (isMounted) {
            setIsLoading(false);
          }
        }

        return;
      }

      if (discoverCache || !isIgdbConfigured()) {
        if (!discoverCache) {
          setGames(sortByMetacritic(mockGames));
          setSource("mock");
        }

        return;
      }

      try {
        setIsLoading(true);
        const nextGames = sortByMetacritic(await fetchDiscoverGames());

        discoverCache = nextGames;

        if (isMounted) {
          setGames(nextGames);
          setSource("igdb");
          setError(null);
        }
      } catch (nextError) {
        if (isMounted) {
          setGames(sortByMetacritic(mockGames));
          setSource("mock");
          setError(nextError);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadGames();

    return () => {
      isMounted = false;
    };
  }, [debouncedQuery]);

  const filteredGames = useMemo(
    () => sortByMetacritic(filterGames(games, query, selectedGenre)),
    [games, query, selectedGenre]
  );

  const genres = useMemo(() => {
    const nextGenres = new Set(["All"]);

    for (const game of games) {
      if (game.genre) {
        nextGenres.add(game.genre);
      }

      for (const genre of game.genres ?? []) {
        if (genre) {
          nextGenres.add(genre);
        }
      }
    }

    return [...nextGenres];
  }, [games]);

  return {
    filteredGames,
    genres,
    isLoading,
    error,
    isDebouncing: cleanQuery !== debouncedQuery,
    source,
  };
}

export function useStarterGames() {
  const [games, setGames] = useState(starterCache ?? sortByMetacritic(mockGames).slice(0, 10));
  const [isLoading, setIsLoading] = useState(!starterCache && isIgdbConfigured());
  const [source, setSource] = useState(starterCache ? "igdb" : "mock");
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadGames = async () => {
      if (starterCache || !isIgdbConfigured()) {
        if (!starterCache) {
          setGames(sortByMetacritic(mockGames).slice(0, 10));
          setSource("mock");
        }

        return;
      }

      try {
        setIsLoading(true);
        const nextGames = await fetchStarterGames();

        starterCache = nextGames;

        if (isMounted) {
          setGames(nextGames);
          setSource("igdb");
          setError(null);
        }
      } catch (nextError) {
        if (isMounted) {
          setGames(sortByMetacritic(mockGames).slice(0, 10));
          setSource("mock");
          setError(nextError);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadGames();

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    games,
    isLoading,
    error,
    source,
  };
}

export function useGameDetail(gameId) {
  const numericGameId = Number(gameId);
  const cachedGame = detailCache.get(numericGameId) ?? getMockGameById(numericGameId);
  const [game, setGame] = useState(cachedGame);
  const [isLoading, setIsLoading] = useState(!detailCache.has(numericGameId) && isIgdbConfigured());
  const [source, setSource] = useState(detailCache.has(numericGameId) ? "igdb" : "mock");
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadGame = async () => {
      if (!numericGameId || Number.isNaN(numericGameId)) {
        setGame(null);
        setIsLoading(false);
        return;
      }

      if (detailCache.has(numericGameId) || !isIgdbConfigured()) {
        if (!detailCache.has(numericGameId)) {
          setGame(getMockGameById(numericGameId));
          setSource("mock");
        }

        return;
      }

      try {
        setIsLoading(true);
        const nextGame = await fetchGameById(numericGameId);

        if (nextGame) {
          detailCache.set(numericGameId, nextGame);
        }

        if (isMounted) {
          setGame(nextGame);
          setSource(nextGame ? "igdb" : "mock");
          setError(null);
        }
      } catch (nextError) {
        if (isMounted) {
          setGame(getMockGameById(numericGameId));
          setSource("mock");
          setError(nextError);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadGame();

    return () => {
      isMounted = false;
    };
  }, [numericGameId]);

  return {
    game,
    isLoading,
    error,
    source,
  };
}

export function useCatalogGames({ facet, value, sortBy }) {
  const [games, setGames] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadGames = async () => {
      if (!facet || !value) {
        setGames([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const nextGames = await fetchCatalogGames({ facet, value, sortBy, limit: 100 });

        if (isMounted) {
          setGames(nextGames);
          setError(null);
        }
      } catch (nextError) {
        if (isMounted) {
          setGames([]);
          setError(nextError);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadGames();

    return () => {
      isMounted = false;
    };
  }, [facet, value, sortBy]);

  return {
    games,
    isLoading,
    error,
  };
}
