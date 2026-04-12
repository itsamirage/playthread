import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const getNowPlayingKey = (userId) => `playthread_now_playing_${userId}`;

export function useNowPlaying(userId) {
  const [nowPlayingIds, setNowPlayingIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadNowPlaying = async () => {
      if (!userId) {
        setNowPlayingIds([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const rawValue = await AsyncStorage.getItem(getNowPlayingKey(userId));
        const parsedValue = rawValue ? JSON.parse(rawValue) : [];

        if (isMounted) {
          setNowPlayingIds(Array.isArray(parsedValue) ? parsedValue : []);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadNowPlaying();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const toggleNowPlaying = async (gameId) => {
    const numericGameId = Number(gameId);

    if (!userId || !numericGameId || Number.isNaN(numericGameId)) {
      return;
    }

    const nextIds = nowPlayingIds.includes(numericGameId)
      ? nowPlayingIds.filter((id) => id !== numericGameId)
      : [numericGameId, ...nowPlayingIds];

    setNowPlayingIds(nextIds);
    await AsyncStorage.setItem(getNowPlayingKey(userId), JSON.stringify(nextIds));
  };

  return {
    nowPlayingIds,
    isLoading,
    isNowPlaying: (gameId) => nowPlayingIds.includes(Number(gameId)),
    toggleNowPlaying,
  };
}
