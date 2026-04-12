import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const getOnboardingKey = (userId) => `playthread_onboarding_seen_${userId}`;

export function useOnboardingStatus(userId) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  useEffect(() => {
    const loadStatus = async () => {
      if (!userId) {
        setHasSeenOnboarding(false);
        setIsLoading(false);
        return;
      }

      try {
        const value = await AsyncStorage.getItem(getOnboardingKey(userId));
        setHasSeenOnboarding(value === "true");
      } finally {
        setIsLoading(false);
      }
    };

    setIsLoading(true);
    loadStatus();
  }, [userId]);

  const markOnboardingSeen = async () => {
    if (!userId) {
      return;
    }

    await AsyncStorage.setItem(getOnboardingKey(userId), "true");
    setHasSeenOnboarding(true);
  };

  return {
    isLoading,
    hasSeenOnboarding,
    markOnboardingSeen,
  };
}
