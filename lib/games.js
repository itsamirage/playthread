import { useCallback, useEffect, useMemo, useState } from "react";

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
const DISCOVER_PAGE_SIZE = 40;
const SEARCH_PAGE_SIZE = 24;

function normalizeFacetValue(value) {
  return normalizeSearchValue(String(value ?? ""));
}

function isAdultOnlyGame(game) {
  const ageRatingLabel = String(game?.ageRatingLabel ?? "").toUpperCase();
  const title = normalizeFacetValue(game?.title);
  const summary = normalizeFacetValue(game?.summary);
  const genres = normalizeFacetValue([game?.genre, ...(game?.genres ?? [])].filter(Boolean).join(" "));
  const eroticSignals = ["erotic", "adult", "sexual", "hentai", "porn"];
  const hasEroticSignal = eroticSignals.some(
    (signal) => title.includes(signal) || summary.includes(signal) || genres.includes(signal),
  );

  if (hasEroticSignal) {
    return true;
  }

  return (
    ageRatingLabel.includes("AO") ||
    ageRatingLabel.includes("PEGI 18") ||
    ageRatingLabel.includes("ACB R18")
  );
}

function mergeGamesById(currentGames, nextGames) {
  const mergedGames = [...currentGames];
  const seenIds = new Set(currentGames.map((game) => game.id));

  for (const game of nextGames) {
    if (seenIds.has(game.id)) {
      continue;
    }

    seenIds.add(game.id);
    mergedGames.push(game);
  }

  return mergedGames;
}

async function searchGamesWithFallback(query, { limit = 20, offset = 0 } = {}) {
  const primaryGames = await searchGames(query, { limit, offset });
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
    fallbackQueries.map((fallbackQuery) => searchGames(fallbackQuery, { limit, offset })),
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

  return games.filter((game) => !isAdultOnlyGame(game));
}

function sortCatalogGamesForFallback(games, sortBy) {
  return [...games].sort((leftGame, rightGame) => {
    if (sortBy === "date_desc") {
      return (rightGame.releaseDate ?? 0) - (leftGame.releaseDate ?? 0);
    }

    if (sortBy === "date_asc") {
      return (leftGame.releaseDate ?? 0) - (rightGame.releaseDate ?? 0);
    }

    if (sortBy === "score_asc") {
      return (leftGame.metacritic ?? 0) - (rightGame.metacritic ?? 0);
    }

    return (rightGame.metacritic ?? 0) - (leftGame.metacritic ?? 0);
  });
}

function filterCatalogGamesByFacet(games, facet, value) {
  const normalizedValue = normalizeFacetValue(value);

  if (!normalizedValue) {
    return [];
  }

  return games.filter((game) => {
    if (facet === "studio") {
      return normalizeFacetValue(game.studio).includes(normalizedValue);
    }

    if (facet === "genre") {
      return [game.genre, ...(game.genres ?? [])]
        .filter(Boolean)
        .some((genre) => normalizeFacetValue(genre).includes(normalizedValue));
    }

    if (facet === "year") {
      return String(game.releaseYear ?? "") === String(value ?? "");
    }

    return false;
  });
}

async function loadCatalogFallbackGames({ facet, value, sortBy, limit }) {
  const baseGames = isIgdbConfigured()
    ? await searchGames(String(value ?? ""), { limit: Math.max(limit, 40), offset: 0 })
    : mockGames;

  return sortCatalogGamesForFallback(
    filterCatalogGamesByFacet(baseGames, facet, value),
    sortBy,
  ).slice(0, limit);
}

export function useBrowseGames({ query, selectedGenre, hideMatureGames = false }) {
  const cleanQuery = query.trim();
  const [debouncedQuery, setDebouncedQuery] = useState(cleanQuery);
  const [games, setGames] = useState(discoverCache ?? sortGamesForBrowse(mockGames));
  const [isLoading, setIsLoading] = useState(
    !cleanQuery && !discoverCache && isIgdbConfigured()
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(isIgdbConfigured());
  const [source, setSource] = useState(discoverCache ? "igdb" : "mock");
  const [error, setError] = useState(null);

  const loadGamesPage = useCallback(async ({
    nextQuery,
    offset = 0,
    append = false,
  }) => {
    const normalizedQuery = String(nextQuery ?? "").trim();
    const isSearch = normalizedQuery.length >= 2;
    const pageSize = isSearch ? SEARCH_PAGE_SIZE : DISCOVER_PAGE_SIZE;

    if (normalizedQuery.length > 0 && normalizedQuery.length < 2) {
      if (!append) {
        setGames([]);
        setHasMore(false);
        setError(null);
        setIsLoading(false);
      }
      return;
    }

    if (!isIgdbConfigured()) {
      if (!append) {
        const fallbackGames = normalizedQuery
          ? filterGames(mockGames, normalizedQuery, "All")
          : sortGamesForBrowse(mockGames);
        setGames(fallbackGames);
        setSource("mock");
        setHasMore(false);
        setError(null);
        setIsLoading(false);
      }
      return;
    }

    const cacheKey = isSearch ? normalizedQuery.toLowerCase() : "__discover__";
    const cacheStore = isSearch ? searchCache : null;

    try {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      let nextGamesPage = null;

      if (!append && cacheStore?.has(cacheKey)) {
        nextGamesPage = cacheStore.get(cacheKey);
      } else {
        nextGamesPage = isSearch
          ? await searchGamesWithFallback(normalizedQuery, { limit: pageSize, offset })
          : sortGamesForBrowse(await fetchDiscoverGames({ limit: pageSize, offset }));

        if (!append && cacheStore) {
          cacheStore.set(cacheKey, nextGamesPage);
        }
      }

      if (!append && !isSearch) {
        discoverCache = nextGamesPage;
      }

      setGames((currentGames) =>
        append ? mergeGamesById(currentGames, nextGamesPage) : nextGamesPage
      );
      setHasMore((nextGamesPage?.length ?? 0) >= pageSize);
      setSource("igdb");
      setError(null);
    } catch (nextError) {
      if (!append) {
        const fallbackGames = normalizedQuery
          ? filterGames(mockGames, normalizedQuery, "All")
          : sortGamesForBrowse(mockGames);
        setGames(fallbackGames);
        setSource("mock");
        setHasMore(false);
      }
      setError(nextError);
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  }, []);

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
      if (!isMounted) {
        return;
      }

      await loadGamesPage({ nextQuery: debouncedQuery, offset: 0, append: false });
    };

    loadGames();

    return () => {
      isMounted = false;
    };
  }, [debouncedQuery, loadGamesPage]);

  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore || source !== "igdb") {
      return;
    }

    await loadGamesPage({
      nextQuery: debouncedQuery,
      offset: games.length,
      append: true,
    });
  }, [debouncedQuery, games.length, hasMore, isLoading, isLoadingMore, loadGamesPage, source]);

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
    isLoadingMore,
    hasMore,
    loadMore,
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
        let nextGames = await fetchCatalogGames({ facet, value, sortBy, limit: 100 });

        if ((nextGames?.length ?? 0) === 0) {
          nextGames = await loadCatalogFallbackGames({ facet, value, sortBy, limit: 100 });
        }

        if (isMounted) {
          setGames(nextGames);
          setError(null);
        }
      } catch (nextError) {
        const fallbackGames = await loadCatalogFallbackGames({ facet, value, sortBy, limit: 100 }).catch(
          () => [],
        );

        if (isMounted) {
          setGames(fallbackGames);
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
