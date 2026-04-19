import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "playthread:recent-game-visits";
const MAX_RECENT_GAMES = 12;

function normalizeRecentGameEntry(game) {
  const numericId = Number(game?.id);

  if (!numericId || Number.isNaN(numericId)) {
    return null;
  }

  return {
    id: numericId,
    title: String(game?.title ?? "").trim() || "Unknown game",
    coverUrl: game?.coverUrl ?? null,
    visitedAt: game?.visitedAt ?? new Date().toISOString(),
  };
}

async function readRecentGames() {
  try {
    const rawValue = await AsyncStorage.getItem(STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map(normalizeRecentGameEntry)
      .filter(Boolean)
      .sort((left, right) => new Date(right.visitedAt).getTime() - new Date(left.visitedAt).getTime());
  } catch {
    return [];
  }
}

async function writeRecentGames(games) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  } catch {
    // Ignore local persistence failures.
  }
}

export async function recordRecentGameVisit(game) {
  const normalizedGame = normalizeRecentGameEntry(game);

  if (!normalizedGame) {
    return;
  }

  const currentGames = await readRecentGames();
  const nextGames = [
    normalizedGame,
    ...currentGames.filter((entry) => entry.id !== normalizedGame.id),
  ].slice(0, MAX_RECENT_GAMES);

  await writeRecentGames(nextGames);
}

export function useRecentGames(limit = 3) {
  const [recentGames, setRecentGames] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setIsLoading(true);
      const games = await readRecentGames();
      setRecentGames(games.slice(0, Math.max(1, limit)));
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    reload();
  }, [reload]);

  return {
    recentGames,
    isLoading,
    reload,
  };
}
