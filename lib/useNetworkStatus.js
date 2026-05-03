import { useCallback, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";

const CONNECTIVITY_CHECK_URL = "https://www.google.com/generate_204";
const CHECK_TIMEOUT_MS = 5000;

async function checkConnectivity() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    const response = await fetch(CONNECTIVITY_CHECK_URL, {
      method: "HEAD",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    return response.status === 204 || response.ok;
  } catch {
    return false;
  }
}

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  const refresh = useCallback(async () => {
    if (Platform.OS === "web") {
      setIsOnline(typeof navigator === "undefined" ? true : navigator.onLine !== false);
      return;
    }

    const online = await checkConnectivity();
    setIsOnline(online);
  }, []);

  useEffect(() => {
    refresh();

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refresh();
      }
    });

    return () => subscription.remove();
  }, [refresh]);

  return { isOnline };
}
