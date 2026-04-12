import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

import { useAuth } from "./auth";
import { supabase } from "./supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync("default", {
    name: "default",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function getExpoPushToken() {
  if (Platform.OS === "web") {
    return null;
  }

  const permissions = await Notifications.getPermissionsAsync();
  let finalStatus = permissions.status;

  if (finalStatus !== "granted") {
    const nextPermissions = await Notifications.requestPermissionsAsync();
    finalStatus = nextPermissions.status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  await ensureAndroidChannel();

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
    null;

  if (!projectId) {
    console.warn("Push notifications are not fully configured yet. Missing EAS project id.");
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token?.data ?? null;
}

async function syncPushToken(userId) {
  const expoPushToken = await getExpoPushToken();

  if (!expoPushToken) {
    return;
  }

  const platform =
    Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "unknown";
  const deviceLabel =
    Constants.deviceName ??
    Constants.expoConfig?.name ??
    "device";

  const { error } = await supabase
    .from("user_push_tokens")
    .upsert(
      {
        user_id: userId,
        expo_push_token: expoPushToken,
        platform,
        device_label: deviceLabel,
        is_active: true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "expo_push_token" },
    );

  if (error) {
    console.warn("Could not sync push token", error);
  }
}

export function usePushNotifications() {
  const { session } = useAuth();

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    syncPushToken(session.user.id);

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        syncPushToken(session.user.id);
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [session?.user?.id]);
}
