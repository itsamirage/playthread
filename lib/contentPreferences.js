import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "playthread:content-preferences";

const DEFAULT_PREFERENCES = {
  hideMatureGames: true,
};

export function useContentPreferences() {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);

  const loadPreferences = useCallback(async () => {
    try {
      setIsLoading(true);
      const rawValue = await AsyncStorage.getItem(STORAGE_KEY);
      const parsedValue = rawValue ? JSON.parse(rawValue) : {};
      setPreferences({
        ...DEFAULT_PREFERENCES,
        ...parsedValue,
      });
    } catch {
      setPreferences(DEFAULT_PREFERENCES);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const savePreferences = useCallback(async (nextPreferences) => {
    const mergedPreferences = {
      ...DEFAULT_PREFERENCES,
      ...nextPreferences,
    };
    setPreferences(mergedPreferences);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mergedPreferences));
  }, []);

  return {
    preferences,
    isLoading,
    reload: loadPreferences,
    savePreferences,
  };
}
