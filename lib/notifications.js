import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "./auth";
import { supabase } from "./supabase";

function normalizeNotification(row) {
  return {
    id: row.id,
    userId: row.user_id,
    actorUserId: row.actor_user_id ?? null,
    actor:
      row.actor_profile?.display_name ||
      row.actor_profile?.username ||
      "player",
    kind: row.kind,
    title: row.title,
    body: row.body ?? "",
    entityType: row.entity_type ?? null,
    entityId: row.entity_id ?? null,
    metadata: row.metadata_json ?? {},
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    readAt: row.read_at ?? null,
  };
}

export function groupNotifications(notifications) {
  const groups = [];
  const map = new Map();

  for (const notification of notifications) {
    const dayLabel = new Date(notification.createdAt).toLocaleDateString();

    if (!map.has(dayLabel)) {
      const group = { dayLabel, items: [] };
      map.set(dayLabel, group);
      groups.push(group);
    }

    map.get(dayLabel).items.push(notification);
  }

  return groups;
}

export function useNotifications(limit = 40) {
  const { session } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadNotifications = useCallback(async () => {
    if (!session?.user?.id) {
      setNotifications([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error: nextError } = await supabase
        .from("notifications")
        .select(
          "id, user_id, actor_user_id, kind, title, body, entity_type, entity_id, metadata_json, is_read, created_at, read_at, actor_profile:profiles!notifications_actor_user_id_fkey(username, display_name)"
        )
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (nextError) {
        throw nextError;
      }

      setNotifications((data ?? []).map(normalizeNotification));
      setError(null);
    } catch (nextError) {
      setNotifications([]);
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, [limit, session?.user?.id]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications],
  );

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    reload: loadNotifications,
  };
}

export async function markNotificationRead(notificationId) {
  return supabase
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("id", notificationId);
}

export async function markAllNotificationsRead(userId) {
  return supabase
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("is_read", false);
}
