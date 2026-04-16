import { useEffect, useMemo, useState } from "react";

import {
  buildSearchFallbackQueries,
  isReleasedGame,
  matchesQueryFuzzily,
  normalizeSearchValue,
  rankGamesByQuery,
} from "./gameSearch.js";
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

async function searchGamesWithFallback(query, { limit = 20 } = {}) {
  const primaryGames = await searchGames(query, { limit });
  const fallbackQueries = buildSearchFallbackQueries(query).slice(0, 4);
  const mergedGames = [];
  const seenGameIds = new Set();

  const appendGames = (games) => {
    for (const game of games) {
      if (seenGameIds.has(game.id)) {
        continue;
      }

      seenGameIds.add(game.id);
      mergedGames.push(game);
    }
  };

  appendGames(primaryGames);
  const fallbackResults = await Promise.all(
    fallbackQueries.map((fallbackQuery) => searchGames(fallbackQuery, { limit })),
  );

  for (const fallbackGames of fallbackResults) {
    if (mergedGames.length >= limit * 2) {
      break;
    }

    appendGames(fallbackGames);
  }

  const ranked = rankGamesByQuery(
    mergedGames.filter((game) => matchesQueryFuzzily(game, query)),
    query
  );

  // Deduplicate by normalized title — collect all entries per title, then keep
  // the one with the best metacritic score (falls back to first/highest-ranked).
  const titleGroups = new Map();

  for (const game of ranked) {
    const normalizedTitle = normalizeSearchValue(game.title);
    const existing = titleGroups.get(normalizedTitle);

    if (!existing) {
      titleGroups.set(normalizedTitle, game);
    } else if ((game.metacritic ?? 0) > (existing.metacritic ?? 0)) {
      titleGroups.set(normalizedTitle, game);
    }
  }

  // Preserve the ranking order of the winner for each title group.
  const winnerIds = new Set(Array.from(titleGroups.values()).map((g) => g.id));

  return ranked.filter((game) => winnerIds.has(game.id)).slice(0, limit);
}

function getDiscoverySortScore(game) {
  const members = Number(game?.members ?? 0) || 0;
  const metacritic = Number(game?.metacritic ?? 0) || 0;
  const releaseDate = Number(game?.releaseDate ?? 0) || 0;
  let score = Math.min(80, Math.log10(members + 1) * 20) + metacritic;

  if (isReleasedGame(game)) {
    score += 10;
  } else if (!members && metacritic <= 0) {
    score -= 20;
  }

  if (releaseDate > 0) {
    score += Math.min(12, releaseDate / 10_000_000_000);
  }

  return score;
}

function sortGamesForBrowse(games) {
  return [...games].sort(
    (firstGame, secondGame) => getDiscoverySortScore(secondGame) - getDiscoverySortScore(firstGame)
  );
}

function filterGames(games, query, selectedGenre) {
  const cleanQuery = query.trim();

  const filteredGames = games.filter((game) => {
    const genrePool = [game.genre, ...(game.genres ?? [])].join(" ").toLowerCase();
    const matchesQuery =
      cleanQuery.length === 0 ||
      matchesQueryFuzzily(game, cleanQuery) ||
      normalizeSearchValue(game.title).includes(normalizeSearchValue(cleanQuery)) ||
      normalizeSearchValue(game.studio).includes(normalizeSearchValue(cleanQuery)) ||
      genrePool.includes(cleanQuery.toLowerCase());

    const matchesGenre =
      selectedGenre === "All" ||
      game.genre === selectedGenre ||
      (game.genres ?? []).includes(selectedGenre);

    return matchesQuery && matchesGenre;
  });

  if (!cleanQuery.length) {
    return filteredGames;
  }

  return rankGamesByQuery(filteredGames, cleanQuery);
}

function applyMatureFilter(games, hideMatureGames = false) {
  if (!hideMatureGames) {
    return games;
  }

  return games.filter((game) => !game?.isMature);
}

export function useBrowseGames({ query, selectedGenre, hideMatureGames = false }) {
  const cleanQuery = query.trim();
  const [debouncedQuery, setDebouncedQuery] = useState(cleanQuery);
  const [games, setGames] = useState(discoverCache ?? sortGamesForBrowse(mockGames));
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
            setGames(filterGames(mockGames, debouncedQuery, "All"));
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
            setGames(filterGames(mockGames, debouncedQuery, "All"));
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
        if (discoverCache) {
          if (isMounted) {
            setGames(discoverCache);
            setSource("igdb");
          }
        } else {
          if (isMounted) {
            setGames(sortGamesForBrowse(mockGames));
            setSource("mock");
          }
        }

        return;
      }

      try {
        setIsLoading(true);
        const nextGames = sortGamesForBrowse(await fetchDiscoverGames());

        discoverCache = nextGames;

        if (isMounted) {
          setGames(nextGames);
          setSource("igdb");
          setError(null);
        }
      } catch (nextError) {
        if (isMounted) {
          setGames(sortGamesForBrowse(mockGames));
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
    () => applyMatureFilter(filterGames(games, query, selectedGenre), hideMatureGames),
    [games, hideMatureGames, query, selectedGenre]
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
    games: applyMatureFilter(games, hideMatureGames),
    filteredGames,
    genres,
    isLoading,
    error,
    isDebouncing: cleanQuery !== debouncedQuery,
    source,
  };
}

export function useStarterGames({ hideMatureGames = false } = {}) {
  const [games, setGames] = useState(starterCache ?? sortGamesForBrowse(mockGames).slice(0, 10));
  const [isLoading, setIsLoading] = useState(!starterCache && isIgdbConfigured());
  const [source, setSource] = useState(starterCache ? "igdb" : "mock");
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadGames = async () => {
      if (starterCache || !isIgdbConfigured()) {
        if (!starterCache) {
          setGames(sortGamesForBrowse(mockGames).slice(0, 10));
          setSource("mock");
        }

        return;
      }

      try {
        setIsLoading(true);
        const nextGames = sortGamesForBrowse(await fetchStarterGames());

        starterCache = nextGames;

        if (isMounted) {
          setGames(nextGames);
          setSource("igdb");
          setError(null);
        }
      } catch (nextError) {
        if (isMounted) {
          setGames(sortGamesForBrowse(mockGames).slice(0, 10));
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
    games: applyMatureFilter(games, hideMatureGames),
    isLoading,
    error,
    source,
  };
}

export function useGameDetail(gameId, { hideMatureGames = false } = {}) {
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
    game: hideMatureGames && game?.isMature ? null : game,
    isLoading,
    error,
    source,
  };
}

export function useCatalogGames({ facet, value, sortBy, hideMatureGames = false }) {
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
    games: applyMatureFilter(games, hideMatureGames),
    isLoading,
    error,
  };
}
