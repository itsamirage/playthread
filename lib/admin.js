import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "./auth";
import { invokeEdgeFunction } from "./functions";
import { supabase } from "./supabase";

export const MODERATION_PERIOD_OPTIONS = [
  { key: "day", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "all", label: "All" },
];

export const PROFILE_STORE_ITEMS = [
  { id: "name:gold", type: "name_color", value: "gold", label: "Gold name", cost: 600 },
  { id: "name:mint", type: "name_color", value: "mint", label: "Mint name", cost: 600 },
  { id: "banner:obsidian", type: "banner_style", value: "obsidian", label: "Obsidian banner", cost: 900 },
  { id: "banner:sunset", type: "banner_style", value: "sunset", label: "Sunset banner", cost: 900 },
];

const PROFILE_SELECT =
  "id, username, display_name, created_at, account_role, moderation_scope, moderation_game_ids, is_banned, banned_reason, integrity_exempt, coins_from_posts, coins_from_comments, coins_from_gifts, coins_from_adjustments, coins_spent, selected_name_color, selected_banner_style, selected_title_key";

export function isStaffRole(role) {
  return role === "moderator" || role === "admin" || role === "owner";
}

export function isAdminRole(role) {
  return role === "admin" || role === "owner";
}

export function formatCoinCount(value) {
  return new Intl.NumberFormat("en-US").format(Number(value ?? 0));
}

export function getAvailableCoins(profile) {
  return (
    (profile?.coinsFromPosts ?? 0) +
    (profile?.coinsFromComments ?? 0) +
    (profile?.coinsFromGifts ?? 0) +
    (profile?.coinsFromAdjustments ?? 0) -
    (profile?.coinsSpent ?? 0)
  );
}

export function getLifetimeCoins(profile) {
  return (
    (profile?.coinsFromPosts ?? 0) +
    (profile?.coinsFromComments ?? 0) +
    (profile?.coinsFromGifts ?? 0) +
    Math.max(0, profile?.coinsFromAdjustments ?? 0)
  );
}

export function formatAccountAge(createdAt) {
  if (!createdAt) {
    return "New account";
  }

  const diffInDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24))
  );

  if (diffInDays < 1) {
    return "Joined today";
  }

  if (diffInDays === 1) {
    return "1 day old";
  }

  if (diffInDays < 30) {
    return `${diffInDays} days old`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);

  if (diffInMonths < 12) {
    return `${diffInMonths} ${diffInMonths === 1 ? "month" : "months"} old`;
  }

  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears} ${diffInYears === 1 ? "year" : "years"} old`;
}

function normalizeProfile(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name ?? row.username ?? "player",
    createdAt: row.created_at,
    accountRole: row.account_role ?? "member",
    moderationScope: row.moderation_scope ?? "all",
    moderationGameIds: row.moderation_game_ids ?? [],
    isBanned: Boolean(row.is_banned),
    bannedReason: row.banned_reason ?? null,
    integrityExempt: Boolean(row.integrity_exempt),
    coinsFromPosts: row.coins_from_posts ?? 0,
    coinsFromComments: row.coins_from_comments ?? 0,
    coinsFromGifts: row.coins_from_gifts ?? 0,
    coinsFromAdjustments: row.coins_from_adjustments ?? 0,
    coinsSpent: row.coins_spent ?? 0,
    selectedNameColor: row.selected_name_color ?? "default",
    selectedBannerStyle: row.selected_banner_style ?? "ember",
    selectedTitleKey: row.selected_title_key ?? "none",
  };
}

function normalizeProfileFromFunction(row) {
  return row ? normalizeProfile(row) : null;
}

function normalizeFlag(row) {
  const evidence = row.evidence_json ?? {};
  const mediaKind =
    evidence.media_kind ??
    (evidence.post_type === "clip"
      ? "clip"
      : evidence.image_url || ["image", "screenshot"].includes(evidence.post_type)
        ? "image"
        : "text");

  return {
    id: row.id,
    contentType: row.content_type,
    contentId: row.content_id,
    gameId: row.igdb_game_id,
    gameTitle: row.game_title,
    userId: row.user_id,
    author: row.profiles?.display_name ?? row.profiles?.username ?? "player",
    authorNameColor: row.profiles?.selected_name_color ?? "default",
    category: row.category,
    labels: row.labels ?? [],
    reason: row.reason,
    excerpt: row.content_excerpt ?? "",
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    origin: row.origin,
    evidence,
    mediaKind,
    mediaStatus: evidence.video_status ?? null,
    mediaUrl: evidence.image_url ?? evidence.video_thumbnail_url ?? null,
  };
}

function normalizeIntegrityEvent(row) {
  return {
    id: row.id,
    eventType: row.event_type,
    userId: row.user_id,
    targetUserId: row.target_user_id,
    postId: row.post_id,
    commentId: row.comment_id,
    requestIpHash: row.request_ip_hash,
    isPositive: Boolean(row.is_positive),
    createdAt: row.created_at,
    metadata: row.metadata_json ?? {},
    actor: row.profiles?.display_name ?? row.profiles?.username ?? "player",
    actorNameColor: row.profiles?.selected_name_color ?? "default",
    target: row.target_profiles?.display_name ?? row.target_profiles?.username ?? null,
  };
}

function normalizeIntegritySettings(row) {
  return row
    ? {
        lookbackDays: row.lookback_days ?? 7,
        maxDistinctAccountsPerIp: row.max_distinct_accounts_per_ip ?? 5,
        maxDistinctPositiveAccountsPerPost: row.max_distinct_positive_accounts_per_post ?? 3,
        maxDistinctPositiveAccountsPerComment: row.max_distinct_positive_accounts_per_comment ?? 3,
        maxDistinctPositiveAccountsPerTarget: row.max_distinct_positive_accounts_per_target ?? 4,
        updatedAt: row.updated_at ?? null,
      }
    : null;
}

function normalizeModerationAction(row) {
  return {
    id: row.id,
    targetUserId: row.target_user_id,
    actorUserId: row.actor_user_id,
    actionType: row.action_type,
    reason: row.reason ?? null,
    metadata: row.metadata_json ?? {},
    createdAt: row.created_at,
    actor: row.actor_profiles?.display_name ?? row.actor_profiles?.username ?? "player",
    actorNameColor: row.actor_profiles?.selected_name_color ?? "default",
    target: row.target_profiles?.display_name ?? row.target_profiles?.username ?? "player",
    targetNameColor: row.target_profiles?.selected_name_color ?? "default",
  };
}

function normalizeIntegrityDailySummary(row) {
  return {
    summaryDay: row.summary_day,
    eventType: row.event_type,
    eventCount: row.event_count ?? 0,
    positiveCount: row.positive_count ?? 0,
    distinctActorCount: row.distinct_actor_count ?? 0,
    distinctTargetCount: row.distinct_target_count ?? 0,
    distinctNetworkCount: row.distinct_network_count ?? 0,
  };
}

function normalizeIntegrityBlockedSummary(row) {
  return {
    summaryDay: row.summary_day,
    blockedEventType: row.blocked_event_type,
    blockedCount: row.blocked_count ?? 0,
    distinctActorCount: row.distinct_actor_count ?? 0,
    distinctNetworkCount: row.distinct_network_count ?? 0,
  };
}

export function useAdminProfiles() {
  const [profiles, setProfiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadProfiles = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error: profilesError } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .order("created_at", { ascending: true });

      if (profilesError) {
        throw profilesError;
      }

      setProfiles((data ?? []).map(normalizeProfile));
      setError(null);
    } catch (nextError) {
      setProfiles([]);
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  return {
    profiles,
    isLoading,
    error,
    reload: loadProfiles,
  };
}

export function useModerationFlags(currentProfile) {
  const [flags, setFlags] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadFlags = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error: flagsError } = await supabase
        .from("moderation_flags")
        .select(
          "id, content_type, content_id, igdb_game_id, game_title, user_id, origin, category, labels, reason, content_excerpt, status, reviewed_at, created_at, evidence_json, profiles(username, display_name, selected_name_color)"
        )
        .order("created_at", { ascending: false })
        .limit(100);

      if (flagsError) {
        throw flagsError;
      }

      const normalizedFlags = (data ?? []).map(normalizeFlag);

      if (currentProfile?.accountRole === "moderator" && currentProfile.moderationScope === "games") {
        const allowedGames = new Set(currentProfile.moderationGameIds ?? []);
        setFlags(normalizedFlags.filter((flag) => flag.gameId && allowedGames.has(flag.gameId)));
      } else {
        setFlags(normalizedFlags);
      }

      setError(null);
    } catch (nextError) {
      setFlags([]);
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, [currentProfile?.accountRole, currentProfile?.moderationGameIds, currentProfile?.moderationScope]);

  useEffect(() => {
    if (!isStaffRole(currentProfile?.accountRole)) {
      setFlags([]);
      setIsLoading(false);
      return;
    }

    loadFlags();
  }, [currentProfile?.accountRole, loadFlags]);

  return {
    flags,
    isLoading,
    error,
    reload: loadFlags,
  };
}

export function useIntegrityEvents(currentProfile) {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadEvents = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error: eventsError } = await supabase
        .from("integrity_events")
        .select(
          "id, event_type, user_id, target_user_id, post_id, comment_id, request_ip_hash, is_positive, metadata_json, created_at, profiles:profiles!integrity_events_user_id_fkey(username, display_name, selected_name_color), target_profiles:profiles!integrity_events_target_user_id_fkey(username, display_name)"
        )
        .order("created_at", { ascending: false })
        .limit(100);

      if (eventsError) {
        throw eventsError;
      }

      setEvents((data ?? []).map(normalizeIntegrityEvent));
      setError(null);
    } catch (nextError) {
      setEvents([]);
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isStaffRole(currentProfile?.accountRole)) {
      setEvents([]);
      setIsLoading(false);
      return;
    }

    loadEvents();
  }, [currentProfile?.accountRole, loadEvents]);

  return {
    events,
    isLoading,
    error,
    reload: loadEvents,
  };
}

export function useIntegritySettings(currentProfile) {
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error: settingsError } = await supabase
        .from("integrity_settings")
        .select(
          "lookback_days, max_distinct_accounts_per_ip, max_distinct_positive_accounts_per_post, max_distinct_positive_accounts_per_comment, max_distinct_positive_accounts_per_target, updated_at"
        )
        .eq("id", true)
        .maybeSingle();

      if (settingsError) {
        throw settingsError;
      }

      setSettings(normalizeIntegritySettings(data));
      setError(null);
    } catch (nextError) {
      setSettings(null);
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isStaffRole(currentProfile?.accountRole)) {
      setSettings(null);
      setIsLoading(false);
      return;
    }

    loadSettings();
  }, [currentProfile?.accountRole, loadSettings]);

  return {
    settings,
    isLoading,
    error,
    reload: loadSettings,
  };
}

export function useModerationActions(currentProfile) {
  const [actions, setActions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadActions = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error: actionsError } = await supabase
        .from("moderation_actions")
        .select(
          "id, target_user_id, actor_user_id, action_type, reason, metadata_json, created_at, actor_profiles:profiles!moderation_actions_actor_user_id_fkey(username, display_name, selected_name_color), target_profiles:profiles!moderation_actions_target_user_id_fkey(username, display_name, selected_name_color)"
        )
        .order("created_at", { ascending: false })
        .limit(100);

      if (actionsError) {
        throw actionsError;
      }

      setActions((data ?? []).map(normalizeModerationAction));
      setError(null);
    } catch (nextError) {
      setActions([]);
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isStaffRole(currentProfile?.accountRole)) {
      setActions([]);
      setIsLoading(false);
      return;
    }

    loadActions();
  }, [currentProfile?.accountRole, loadActions]);

  return {
    actions,
    isLoading,
    error,
    reload: loadActions,
  };
}

export function useIntegrityReport(currentProfile, days = 14) {
  const [report, setReport] = useState({
    days,
    dailySummary: [],
    blockedSummary: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadReport = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await invokeEdgeFunction("trusted-admin", {
        action: "get_integrity_report",
        days,
      });

      setReport({
        days: data?.report?.days ?? days,
        dailySummary: (data?.report?.dailySummary ?? []).map(normalizeIntegrityDailySummary),
        blockedSummary: (data?.report?.blockedSummary ?? []).map(normalizeIntegrityBlockedSummary),
      });
      setError(null);
    } catch (nextError) {
      setReport({
        days,
        dailySummary: [],
        blockedSummary: [],
      });
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (!isStaffRole(currentProfile?.accountRole)) {
      setReport({
        days,
        dailySummary: [],
        blockedSummary: [],
      });
      setIsLoading(false);
      return;
    }

    loadReport();
  }, [currentProfile?.accountRole, days, loadReport]);

  return {
    report,
    isLoading,
    error,
    reload: loadReport,
  };
}

export async function setFlagStatus({ flagId, status, reviewerId }) {
  void reviewerId;

  await invokeEdgeFunction("trusted-admin", {
    action: "set_flag_status",
    flagId,
    status,
  });

  return { error: null };
}

export async function updateMemberRole({
  actorUserId,
  targetUserId,
  accountRole,
  moderationScope,
  moderationGameIds,
}) {
  void actorUserId;

  const data = await invokeEdgeFunction("trusted-admin", {
    action: "update_member_role",
    targetUserId,
    accountRole,
    moderationScope,
    moderationGameIds,
  });

  return normalizeProfileFromFunction(data?.profile ?? null);
}

export async function setBanState({
  actorUserId,
  targetUserId,
  isBanned,
  bannedReason,
}) {
  void actorUserId;

  const data = await invokeEdgeFunction("trusted-admin", {
    action: "set_ban_state",
    targetUserId,
    isBanned,
    bannedReason,
  });

  return normalizeProfileFromFunction(data?.profile ?? null);
}

export async function redeemProfileStoreItem({
  userId,
  profile,
  item,
}) {
  if (getAvailableCoins(profile) < item.cost) {
    throw new Error("Not enough coins.");
  }

  const data = await invokeEdgeFunction("trusted-coin", {
    action: "redeem_store_item",
    userId,
    itemId: item.id,
    itemType: item.type,
    itemValue: item.value,
    itemCost: item.cost,
    note: item.label,
  });

  return normalizeProfileFromFunction(data?.profile ?? null);
}

export async function sendCoinGift({
  fromUserId,
  toUserId,
  amount,
  isAnonymous,
  note,
}) {
  await invokeEdgeFunction("trusted-coin", {
    action: "gift",
    fromUserId,
    toUserId,
    amount,
    isAnonymous,
    note,
  });
}

export async function adjustCoins({
  actorUserId,
  targetUserId,
  amount,
  note,
}) {
  await invokeEdgeFunction("trusted-coin", {
    action: "adjust",
    actorUserId,
    targetUserId,
    amount,
    note,
  });
}

export async function updateIntegritySettings(settings) {
  const data = await invokeEdgeFunction("trusted-admin", {
    action: "update_integrity_settings",
    lookbackDays: settings.lookbackDays,
    maxDistinctAccountsPerIp: settings.maxDistinctAccountsPerIp,
    maxDistinctPositiveAccountsPerPost: settings.maxDistinctPositiveAccountsPerPost,
    maxDistinctPositiveAccountsPerComment: settings.maxDistinctPositiveAccountsPerComment,
    maxDistinctPositiveAccountsPerTarget: settings.maxDistinctPositiveAccountsPerTarget,
  });

  return normalizeIntegritySettings(data?.settings ?? null);
}

export async function setContentVisibility({
  flagId,
  visibility,
}) {
  const data = await invokeEdgeFunction("trusted-admin", {
    action: "set_content_visibility",
    flagId,
    visibility,
  });

  return {
    visibility: data?.visibility ?? visibility,
    flagStatus: data?.flagStatus ?? null,
  };
}

export async function pruneIntegrityData({
  integrityRetentionDays,
  moderationActionRetentionDays,
}) {
  const data = await invokeEdgeFunction("trusted-admin", {
    action: "prune_integrity_data",
    integrityRetentionDays,
    moderationActionRetentionDays,
  });

  return {
    retention: data?.retention ?? null,
    result: data?.result ?? null,
  };
}

export function useMyAdminProfile() {
  const { session } = useAuth();
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    if (!session?.user?.id) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      setProfile(data ? normalizeProfile(data) : null);
    } catch {
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  return useMemo(
    () => ({
      profile,
      isLoading,
      reload: loadProfile,
    }),
    [isLoading, loadProfile, profile]
  );
}
