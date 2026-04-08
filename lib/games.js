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

          const nextGames = sortByMetacritic(await searchGames(debouncedQuery, { limit: 20 }));
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
