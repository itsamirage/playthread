import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import { useAuth } from "./auth";
import {
  buildRouteFromNotification,
  getNotificationKindLabel,
  groupNotificationsByDay,
} from "./notificationRouting";
import { supabase } from "./supabase";

const notificationRefreshListeners = new Set();

function broadcastNotificationRefresh() {
  for (const listener of notificationRefreshListeners) {
    listener();
  }
}

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
    kindLabel: getNotificationKindLabel(row.kind),
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    readAt: row.read_at ?? null,
  };
}

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  pushEnabled: true,
  postCommentEnabled: true,
  coinGiftReceivedEnabled: true,
  moderationWarningEnabled: true,
  followedGamePostEnabled: true,
  newFollowerEnabled: true,
  activityNoiseControlEnabled: true,
  activityPushCooldownMinutes: 30,
};

function normalizeNotificationPreferences(row) {
  if (!row) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  return {
    pushEnabled: row.push_enabled ?? true,
    postCommentEnabled: row.post_comment_enabled ?? true,
    coinGiftReceivedEnabled: row.coin_gift_received_enabled ?? true,
    moderationWarningEnabled: row.moderation_warning_enabled ?? true,
    followedGamePostEnabled: row.followed_game_post_enabled ?? true,
    newFollowerEnabled: row.new_follower_enabled ?? true,
    activityNoiseControlEnabled: row.activity_noise_control_enabled ?? true,
    activityPushCooldownMinutes: Math.max(
      0,
      Math.min(240, Number(row.activity_push_cooldown_minutes ?? 30) || 0),
    ),
  };
}

export function groupNotifications(notifications) {
  return groupNotificationsByDay(notifications);
}

export { buildRouteFromNotification, getNotificationKindLabel };

export function useNotifications(limit = 40) {
  const { session } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const channelIdRef = useRef(`notifications:${Math.random().toString(36).slice(2)}`);

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

  useEffect(() => {
    notificationRefreshListeners.add(loadNotifications);

    return () => {
      notificationRefreshListeners.delete(loadNotifications);
    };
  }, [loadNotifications]);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    const channel = supabase
      .channel(`${channelIdRef.current}:${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${session.user.id}`,
        },
        () => {
          loadNotifications();
        },
      )
      .subscribe();

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        loadNotifications();
      }
    });

    return () => {
      appStateSubscription.remove();
      supabase.removeChannel(channel);
    };
  }, [loadNotifications, session?.user?.id]);

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

export function useNotificationPreferences() {
  const { session } = useAuth();
  const [preferences, setPreferences] = useState({ ...DEFAULT_NOTIFICATION_PREFERENCES });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadPreferences = useCallback(async () => {
    if (!session?.user?.id) {
      setPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES });
      setError(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error: nextError } = await supabase
        .from("notification_preferences")
        .select(
          "push_enabled, post_comment_enabled, coin_gift_received_enabled, moderation_warning_enabled, followed_game_post_enabled, new_follower_enabled, activity_noise_control_enabled, activity_push_cooldown_minutes",
        )
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (nextError) {
        throw nextError;
      }

      setPreferences(normalizeNotificationPreferences(data));
      setError(null);
    } catch (nextError) {
      setPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES });
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  return {
    preferences,
    isLoading,
    error,
    reload: loadPreferences,
  };
}

export async function saveNotificationPreferences(userId, preferences) {
  const result = await supabase.from("notification_preferences").upsert(
    {
      user_id: userId,
      push_enabled: Boolean(preferences.pushEnabled),
      post_comment_enabled: Boolean(preferences.postCommentEnabled),
      coin_gift_received_enabled: Boolean(preferences.coinGiftReceivedEnabled),
      moderation_warning_enabled: Boolean(preferences.moderationWarningEnabled),
      followed_game_post_enabled: Boolean(preferences.followedGamePostEnabled),
      new_follower_enabled: Boolean(preferences.newFollowerEnabled),
      activity_noise_control_enabled: Boolean(preferences.activityNoiseControlEnabled),
      activity_push_cooldown_minutes: Math.max(
        0,
        Math.min(240, Number(preferences.activityPushCooldownMinutes ?? 30) || 0),
      ),
    },
    { onConflict: "user_id" },
  );

  if (!result.error) {
    broadcastNotificationRefresh();
  }

  return result;
}

export async function markNotificationRead(notificationId) {
  const result = await supabase
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("id", notificationId);

  if (!result.error) {
    broadcastNotificationRefresh();
  }

  return result;
}

export async function markAllNotificationsRead(userId) {
  const result = await supabase
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (!result.error) {
    broadcastNotificationRefresh();
  }

  return result;
}
