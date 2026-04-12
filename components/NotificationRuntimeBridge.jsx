import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";

import { usePushNotifications } from "../lib/pushNotifications";

function buildRouteFromNotificationData(data) {
  if (!data || typeof data !== "object") {
    return null;
  }

  if (data.entityType === "post" && data.entityId) {
    return `/post/${data.entityId}`;
  }

  if (data.entityType === "profile" && data.entityId) {
    return `/user/${data.entityId}`;
  }

  if (data.gameId) {
    return `/game/${data.gameId}`;
  }

  return null;
}

export default function NotificationRuntimeBridge() {
  usePushNotifications();
  const router = useRouter();
  const lastHandledIdentifierRef = useRef(null);

  useEffect(() => {
    async function openInitialNotification() {
      const response = await Notifications.getLastNotificationResponseAsync();
      const identifier = response?.notification?.request?.identifier ?? null;

      if (!identifier || lastHandledIdentifierRef.current === identifier) {
        return;
      }

      const route = buildRouteFromNotificationData(
        response?.notification?.request?.content?.data,
      );

      if (route) {
        lastHandledIdentifierRef.current = identifier;
        router.push(route);
      }
    }

    openInitialNotification();

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const identifier = response?.notification?.request?.identifier ?? null;

      if (!identifier || lastHandledIdentifierRef.current === identifier) {
        return;
      }

      const route = buildRouteFromNotificationData(
        response?.notification?.request?.content?.data,
      );

      if (route) {
        lastHandledIdentifierRef.current = identifier;
        router.push(route);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  return null;
}
