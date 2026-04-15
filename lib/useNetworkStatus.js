import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

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
    const online = await checkConnectivity();
    setIsOnline(online);
  }, []);

  useEffect(() => {
    refresh();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refresh();
      }
    });

    return () => subscription.remove();
  }, [refresh]);

  return { isOnline };
}
