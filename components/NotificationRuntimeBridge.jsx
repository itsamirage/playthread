import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";

import { buildRouteFromNotification } from "../lib/notificationRouting";
import { usePushNotifications } from "../lib/pushNotifications";
import { supabase } from "../lib/supabase";

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

      // Ensure the session is fresh before navigating to authenticated content
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60000) {
        await supabase.auth.refreshSession();
      }

      const data = response?.notification?.request?.content?.data;
      const route = buildRouteFromNotification({
        metadata: data,
        entityType: data?.entityType,
        entityId: data?.entityId,
      });

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

      const data = response?.notification?.request?.content?.data;
      const route = buildRouteFromNotification({
        metadata: data,
        entityType: data?.entityType,
        entityId: data?.entityId,
      });

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
