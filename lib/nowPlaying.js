import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import { supabase } from "./supabase";

const getLocalKey = (userId) => `playthread_now_playing_${userId}`;

async function readLocalIds(userId) {
  try {
    const raw = await AsyncStorage.getItem(getLocalKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalIds(userId, ids) {
  try {
    await AsyncStorage.setItem(getLocalKey(userId), JSON.stringify(ids));
  } catch {
    // Ignore local write failures.
  }
}

export function useNowPlaying(userId) {
  const [nowPlayingIds, setNowPlayingIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!userId) {
        setNowPlayingIds([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);

        // Try Supabase first (authoritative), fall back to local cache.
        const { data } = await supabase
          .from("profiles")
          .select("now_playing_game_ids")
          .eq("id", userId)
          .single();

        const ids = Array.isArray(data?.now_playing_game_ids)
          ? data.now_playing_game_ids
          : await readLocalIds(userId);

        if (isMounted) {
          setNowPlayingIds(ids);
          await writeLocalIds(userId, ids);
        }
      } catch {
        const localIds = await readLocalIds(userId);
        if (isMounted) setNowPlayingIds(localIds);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    load();
    return () => { isMounted = false; };
  }, [userId]);

  const toggleNowPlaying = useCallback(async (gameId) => {
    const numericId = Number(gameId);
    if (!userId || !numericId || Number.isNaN(numericId)) return;

    const nextIds = nowPlayingIds.includes(numericId)
      ? nowPlayingIds.filter((id) => id !== numericId)
      : [numericId, ...nowPlayingIds];

    // Optimistic local update
    setNowPlayingIds(nextIds);
    await writeLocalIds(userId, nextIds);

    // Sync to Supabase (non-blocking, best-effort)
    supabase
      .from("profiles")
      .update({ now_playing_game_ids: nextIds })
      .eq("id", userId)
      .then(({ error }) => {
        if (error) {
          console.warn("now_playing sync failed", error.message);
        }
      });
  }, [userId, nowPlayingIds]);

  return {
    nowPlayingIds,
    isLoading,
    isNowPlaying: (gameId) => nowPlayingIds.includes(Number(gameId)),
    toggleNowPlaying,
  };
}

export function useOtherUserNowPlaying(userId) {
  const [nowPlayingIds, setNowPlayingIds] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (!userId) {
      setNowPlayingIds([]);
      return;
    }

    setIsLoading(true);
    supabase
      .from("profiles")
      .select("now_playing_game_ids")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (isMounted) {
          setNowPlayingIds(Array.isArray(data?.now_playing_game_ids) ? data.now_playing_game_ids : []);
          setIsLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [userId]);

  return { nowPlayingIds, isLoading };
}
