import { createClient, type SupabaseClient, type User } from "jsr:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HATE_PATTERNS = [
  /\bwhite power\b/i,
  /\bheil hitler\b/i,
  /\bgo back to (your|the) country\b/i,
  /\bsubhuman\b/i,
];

const ABUSE_PATTERNS = [
  /\bkill yourself\b/i,
  /\bgo die\b/i,
  /\byou should die\b/i,
  /\bworthless trash\b/i,
  /\bstupid (idiot|moron)\b/i,
];

const NUDITY_PATTERNS = [
  /\bexplicit nude\b/i,
  /\bgraphic sexual\b/i,
  /\bsex tape\b/i,
  /\bporn\b/i,
  /\bnudes?\b/i,
];

export type ProfileRow = {
  id: string;
  username: string | null;
  account_role: string | null;
  moderation_scope?: string | null;
  moderation_game_ids?: number[] | null;
  developer_game_ids?: number[] | null;
  is_banned: boolean | null;
  banned_reason?: string | null;
  integrity_exempt: boolean | null;
  coins_from_posts?: number | null;
  coins_from_comments?: number | null;
  coins_from_gifts?: number | null;
  coins_from_adjustments?: number | null;
  coins_spent?: number | null;
};

type IntegrityConfigRow = {
  lookback_days: number | null;
  max_distinct_accounts_per_ip: number | null;
  max_distinct_positive_accounts_per_post: number | null;
  max_distinct_positive_accounts_per_comment: number | null;
  max_distinct_positive_accounts_per_target: number | null;
};

type ModerationResult = {
  moderationState: "clean" | "warning";
  labels: string[];
  category: "hate" | "abuse" | "nudity" | null;
  reason: string | null;
};

type IntegrityEventType =
  | "post_create"
  | "comment_create"
  | "post_reaction"
  | "comment_reaction"
  | "coin_gift"
  | "coin_adjustment"
  | "store_spend";

type IntegrityEventInsert = {
  user_id: string;
  event_type: IntegrityEventType;
  target_user_id?: string | null;
  post_id?: string | null;
  comment_id?: string | null;
  request_ip_hash: string;
  is_positive: boolean;
  metadata_json?: Record<string, unknown>;
};

type IntegrityCheckInput = {
  request: Request;
  adminClient: SupabaseClient;
  profile: ProfileRow;
  eventType: IntegrityEventType;
  targetUserId?: string | null;
  postId?: string | null;
  commentId?: string | null;
  isPositive?: boolean;
  metadata?: Record<string, unknown>;
};

type NotificationPreferencesRow = {
  push_enabled?: boolean | null;
  post_comment_enabled?: boolean | null;
  coin_gift_received_enabled?: boolean | null;
  moderation_warning_enabled?: boolean | null;
  followed_game_post_enabled?: boolean | null;
  new_follower_enabled?: boolean | null;
  activity_noise_control_enabled?: boolean | null;
  activity_push_cooldown_minutes?: number | null;
};

const DEFAULT_INTEGRITY_LOOKBACK_DAYS = 7;
const DEFAULT_MAX_DISTINCT_ACCOUNTS_PER_IP = 5;
const DEFAULT_MAX_DISTINCT_POSITIVE_ACCOUNTS_PER_POST = 3;
const DEFAULT_MAX_DISTINCT_POSITIVE_ACCOUNTS_PER_COMMENT = 3;
const DEFAULT_MAX_DISTINCT_POSITIVE_ACCOUNTS_PER_TARGET = 4;

function readEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }

  return value;
}

export function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export function getAdminClient() {
  return createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getAuthenticatedUser(request: Request): Promise<User> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    throw new Error("Missing authorization header.");
  }

  const userClient = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_ANON_KEY"), {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    throw new Error("You must be signed in.");
  }

  return user;
}

export async function requireProfile(
  adminClient: SupabaseClient,
  userId: string,
): Promise<ProfileRow> {
  const { data, error } = await adminClient
    .from("profiles")
    .select(
      "id, username, account_role, moderation_scope, moderation_game_ids, developer_game_ids, is_banned, banned_reason, integrity_exempt, coins_from_posts, coins_from_comments, coins_from_gifts, coins_from_adjustments, coins_spent",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load profile: ${error.message}`);
  }

  if (!data) {
    throw new Error("Your profile is missing. Sign out and back in, then try again.");
  }

  return data;
}

export function assertActiveProfile(profile: ProfileRow) {
  if (profile.is_banned) {
    throw new Error("This account is banned. Posting and reactions are disabled.");
  }
}

export function assertAdmin(profile: ProfileRow) {
  if (!["admin", "owner"].includes(profile.account_role ?? "")) {
    throw new Error("Only admins and owners can perform that action.");
  }
}

export function assertStaff(profile: ProfileRow) {
  if (!["moderator", "admin", "owner"].includes(profile.account_role ?? "")) {
    throw new Error("Only moderators, admins, and owners can perform that action.");
  }
}

export function assertOwner(profile: ProfileRow) {
  if (profile.account_role !== "owner") {
    throw new Error("Only the owner can perform that action.");
  }
}

export function canAdministerTarget(actorProfile: ProfileRow, targetProfile: ProfileRow) {
  const actorRole = actorProfile.account_role ?? "member";
  const targetRole = targetProfile.account_role ?? "member";

  if (actorRole === "owner") {
    return true;
  }

  if (actorRole !== "admin") {
    return false;
  }

  return !["admin", "owner"].includes(targetRole);
}

export function getAvailableCoins(profile: ProfileRow) {
  return (
    (profile.coins_from_posts ?? 0) +
    (profile.coins_from_comments ?? 0) +
    (profile.coins_from_gifts ?? 0) +
    (profile.coins_from_adjustments ?? 0) -
    (profile.coins_spent ?? 0)
  );
}

function addLabel(labels: string[], value: string) {
  if (!labels.includes(value)) {
    labels.push(value);
  }
}

export function evaluateModerationText(text: unknown): ModerationResult {
  const normalizedText = String(text ?? "").trim();
  const labels: string[] = [];

  if (!normalizedText) {
    return {
      moderationState: "clean",
      labels,
      category: null,
      reason: null,
    };
  }

  if (HATE_PATTERNS.some((pattern) => pattern.test(normalizedText))) {
    addLabel(labels, "hateful speech");
  }

  if (ABUSE_PATTERNS.some((pattern) => pattern.test(normalizedText))) {
    addLabel(labels, "abusive language");
  }

  if (NUDITY_PATTERNS.some((pattern) => pattern.test(normalizedText))) {
    addLabel(labels, "sexual content");
  }

  if (labels.length === 0) {
    return {
      moderationState: "clean",
      labels,
      category: null,
      reason: null,
    };
  }

  const category = labels.includes("hateful speech")
    ? "hate"
    : labels.includes("sexual content")
      ? "nudity"
      : "abuse";

  return {
    moderationState: "warning",
    labels,
    category,
    reason: `Auto-flagged for ${labels.join(", ")}.`,
  };
}

export async function createModerationFlag(
  adminClient: SupabaseClient,
  {
    contentType,
    contentId,
    userId,
    category,
    labels,
    reason,
    contentExcerpt,
    igdbGameId = null,
    gameTitle = null,
    origin = "automatic",
    evidence = {},
  }: {
    contentType: "post" | "comment" | "profile";
    contentId: string | null;
    userId: string;
    category: "hate" | "abuse" | "nudity" | "integrity";
    labels: string[];
    reason: string;
    contentExcerpt?: string | null;
    igdbGameId?: number | null;
    gameTitle?: string | null;
    origin?: "automatic" | "manual" | "integrity";
    evidence?: Record<string, unknown>;
  },
) {
  const { error } = await adminClient.from("moderation_flags").insert({
    content_type: contentType,
    content_id: contentId,
    igdb_game_id: igdbGameId,
    game_title: gameTitle,
    user_id: userId,
    flagged_by: userId,
    origin,
    category,
    labels,
    reason,
    content_excerpt: contentExcerpt?.slice(0, 280) ?? null,
    evidence_json: evidence,
  });

  if (error) {
    console.warn("Could not create moderation flag", error);
  }
}

export async function insertNotification(
  adminClient: SupabaseClient,
  {
    userId,
    actorUserId = null,
    kind,
    title,
    body = null,
    entityType = null,
    entityId = null,
    metadata = {},
  }: {
    userId: string;
    actorUserId?: string | null;
    kind:
      | "post_comment"
      | "coin_gift_received"
      | "moderation_warning"
      | "followed_game_post"
      | "new_follower"
      | "friend_request"
      | "friend_accept";
    title: string;
    body?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const { data: preferencesRow, error: preferencesError } = await adminClient
    .from("notification_preferences")
    .select(
      "push_enabled, post_comment_enabled, coin_gift_received_enabled, moderation_warning_enabled, followed_game_post_enabled, new_follower_enabled, activity_noise_control_enabled, activity_push_cooldown_minutes",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (preferencesError) {
    console.warn("Could not load notification preferences", preferencesError);
  }

  if (!shouldStoreNotification(preferencesRow, kind)) {
    return;
  }

  const pushCooldownMinutes = getNotificationPushCooldownMinutes(preferencesRow, kind);
  const pushCooldownCutoff =
    pushCooldownMinutes > 0
      ? new Date(Date.now() - pushCooldownMinutes * 60 * 1000).toISOString()
      : null;
  const aggregateWindowMinutes =
    ["followed_game_post", "new_follower", "friend_request", "friend_accept"].includes(kind) ? 360 : 0;
  const aggregateCutoff =
    aggregateWindowMinutes > 0
      ? new Date(Date.now() - aggregateWindowMinutes * 60 * 1000).toISOString()
      : null;
  const duplicateCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  let finalTitle = title;
  let finalBody = body;
  let finalEntityType = entityType;
  let finalEntityId = entityId;
  let finalMetadata = metadata;

  let shouldSendPush = shouldSendPushNotification(preferencesRow, kind);

  if (pushCooldownCutoff) {
    const { data: recentPushRows, error: recentPushError } = await adminClient
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", kind)
      .gte("created_at", pushCooldownCutoff)
      .limit(1);

    if (recentPushError) {
      console.warn("Could not load recent notifications for push cooldown", recentPushError);
    } else if ((recentPushRows ?? []).length > 0) {
      shouldSendPush = false;
    }
  }

  let duplicateQuery = adminClient
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("title", title)
    .gte("created_at", duplicateCutoff)
    .limit(1);

  duplicateQuery =
    actorUserId == null ? duplicateQuery.is("actor_user_id", null) : duplicateQuery.eq("actor_user_id", actorUserId);
  duplicateQuery =
    entityType == null ? duplicateQuery.is("entity_type", null) : duplicateQuery.eq("entity_type", entityType);
  duplicateQuery =
    entityId == null ? duplicateQuery.is("entity_id", null) : duplicateQuery.eq("entity_id", entityId);
  duplicateQuery = body == null ? duplicateQuery.is("body", null) : duplicateQuery.eq("body", body);

  const { data: duplicateRows, error: duplicateError } = await duplicateQuery;

  if (duplicateError) {
    console.warn("Could not check duplicate notifications", duplicateError);
  } else if ((duplicateRows ?? []).length > 0) {
    return;
  }

  let notificationRow:
    | {
        id: string;
        created_at?: string | null;
      }
    | null = null;

  if (aggregateCutoff) {
    let aggregateQuery = adminClient
      .from("notifications")
      .select("id, entity_id, metadata_json")
      .eq("user_id", userId)
      .eq("kind", kind)
      .eq("is_read", false)
      .gte("created_at", aggregateCutoff)
      .order("created_at", { ascending: false })
      .limit(1);

    if (kind === "followed_game_post" && metadata?.gameId != null) {
      aggregateQuery = aggregateQuery.contains("metadata_json", { gameId: metadata.gameId });
    }

    const { data: aggregateRows, error: aggregateError } = await aggregateQuery;

    if (aggregateError) {
      console.warn("Could not check aggregated notifications", aggregateError);
    } else if ((aggregateRows ?? []).length > 0) {
      const aggregatePlan = buildAggregatedNotificationUpdate(aggregateRows[0], {
        kind,
        title,
        body,
        entityType,
        entityId,
        metadata,
      });

      if (aggregatePlan) {
        finalTitle = aggregatePlan.title;
        finalBody = aggregatePlan.body;
        finalEntityType = aggregatePlan.entityType;
        finalEntityId = aggregatePlan.entityId;
        finalMetadata = aggregatePlan.metadata;

        const { data: updatedRow, error: updateError } = await adminClient
          .from("notifications")
          .update({
            title: finalTitle,
            body: finalBody,
            entity_type: finalEntityType,
            entity_id: finalEntityId,
            metadata_json: finalMetadata,
            is_read: false,
            read_at: null,
            created_at: new Date().toISOString(),
          })
          .eq("id", aggregateRows[0].id)
          .select("id, created_at")
          .maybeSingle();

        if (updateError) {
          console.warn("Could not aggregate notification", updateError);
        } else {
          notificationRow = updatedRow;
        }
      }
    }
  }

  if (!notificationRow) {
    const { data, error } = await adminClient
      .from("notifications")
      .insert({
        user_id: userId,
        actor_user_id: actorUserId,
        kind,
        title: finalTitle,
        body: finalBody,
        entity_type: finalEntityType,
        entity_id: finalEntityId,
        metadata_json: finalMetadata,
      })
      .select("id, created_at")
      .maybeSingle();

    if (error) {
      console.warn("Could not create notification", error);
      return;
    }

    notificationRow = data;
  }

  const { data: tokenRows, error: tokenError } = await adminClient
    .from("user_push_tokens")
    .select("id, expo_push_token")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (tokenError) {
    console.warn("Could not load push tokens", tokenError);
    return;
  }

  const expoPushTokens = (tokenRows ?? [])
    .map((row) => String(row.expo_push_token ?? "").trim())
    .filter(Boolean);

  if (expoPushTokens.length === 0) {
    return;
  }

  if (!shouldSendPushNotification(preferencesRow, kind)) {
    return;
  }

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(
      expoPushTokens.map((token) => ({
        to: token,
        sound: "default",
        title: finalTitle,
        body: finalBody ?? undefined,
        data: {
          notificationId: notificationRow?.id ?? null,
          entityType: finalEntityType,
          entityId: finalEntityId,
          kind,
          ...finalMetadata,
        },
      })),
    ),
  });

  if (!response.ok) {
    console.warn("Could not send Expo push notifications", await response.text());
    return;
  }

  const payload = await response.json().catch(() => null);
  const pushResults = Array.isArray(payload?.data) ? payload.data : [];

  for (let index = 0; index < pushResults.length; index += 1) {
    const result = pushResults[index];
    const tokenRow = tokenRows?.[index];

    if (!tokenRow) {
      continue;
    }

    if (result?.status === "error" && result?.details?.error === "DeviceNotRegistered") {
      await adminClient
        .from("user_push_tokens")
        .update({
          is_active: false,
        })
        .eq("id", tokenRow.id);
    }
  }
}

export function shouldStoreNotification(
  preferencesRow: NotificationPreferencesRow | null | undefined,
  kind:
    | "post_comment"
    | "coin_gift_received"
    | "moderation_warning"
    | "followed_game_post"
    | "new_follower"
    | "friend_request"
    | "friend_accept",
) {
  const kindPreferenceMap: Record<string, boolean> = {
    post_comment: preferencesRow?.post_comment_enabled ?? true,
    coin_gift_received: preferencesRow?.coin_gift_received_enabled ?? true,
    moderation_warning: preferencesRow?.moderation_warning_enabled ?? true,
    followed_game_post: preferencesRow?.followed_game_post_enabled ?? true,
    new_follower: preferencesRow?.new_follower_enabled ?? true,
    friend_request: preferencesRow?.new_follower_enabled ?? true,
    friend_accept: preferencesRow?.new_follower_enabled ?? true,
  };

  return kindPreferenceMap[kind] !== false;
}

export function shouldSendPushNotification(
  preferencesRow: NotificationPreferencesRow | null | undefined,
  kind:
    | "post_comment"
    | "coin_gift_received"
    | "moderation_warning"
    | "followed_game_post"
    | "new_follower"
    | "friend_request"
    | "friend_accept",
) {
  return (preferencesRow?.push_enabled ?? true) && shouldStoreNotification(preferencesRow, kind);
}

export function getNotificationPushCooldownMinutes(
  preferencesRow: NotificationPreferencesRow | null | undefined,
  kind:
    | "post_comment"
    | "coin_gift_received"
    | "moderation_warning"
    | "followed_game_post"
    | "new_follower"
    | "friend_request"
    | "friend_accept",
) {
  const noiseControlEnabled = preferencesRow?.activity_noise_control_enabled ?? true;
  const cooldownMinutes = Math.max(
    0,
    Math.min(240, Number(preferencesRow?.activity_push_cooldown_minutes ?? 30) || 0),
  );

  if (!noiseControlEnabled) {
    return 0;
  }

  return ["followed_game_post", "new_follower", "friend_request", "friend_accept"].includes(kind)
    ? cooldownMinutes
    : 0;
}

export function buildAggregatedNotificationUpdate(
  existingRow: { entity_id?: string | null; metadata_json?: Record<string, unknown> | null } | null | undefined,
  notification: {
    kind:
      | "post_comment"
      | "coin_gift_received"
      | "moderation_warning"
      | "followed_game_post"
      | "new_follower"
      | "friend_request"
      | "friend_accept";
    title: string;
    body?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  if (!existingRow) {
    return null;
  }

  const existingMetadata = existingRow.metadata_json ?? {};

  if (notification.kind === "followed_game_post") {
    const aggregatedCount = Math.max(1, Number(existingMetadata.aggregatedCount ?? 1)) + 1;
    const gameTitle = String(notification.metadata?.gameTitle ?? existingMetadata.gameTitle ?? "A followed game");
    const actorName = String(notification.metadata?.actorName ?? "A player");

    return {
      title: `${gameTitle} has ${aggregatedCount} new posts`,
      body:
        aggregatedCount > 2
          ? `${actorName} and ${aggregatedCount - 1} others posted in a game you follow.`
          : `${actorName} posted in a game you follow.`,
      entityType: "game",
      entityId: String(notification.metadata?.gameId ?? existingMetadata.gameId ?? notification.entityId ?? ""),
      metadata: {
        ...existingMetadata,
        ...notification.metadata,
        aggregatedCount,
        latestPostId: notification.entityId ?? existingMetadata.latestPostId ?? null,
      },
    };
  }

  if (notification.kind === "new_follower") {
    const priorNames = Array.isArray(existingMetadata.recentFollowerNames)
      ? existingMetadata.recentFollowerNames.filter(Boolean).map((value) => String(value))
      : [];
    const nextName = String(notification.metadata?.followerName ?? "A player");
    const recentFollowerNames = [...new Set([nextName, ...priorNames])].slice(0, 3);
    const aggregatedCount = Math.max(1, Number(existingMetadata.aggregatedCount ?? 1)) + 1;
    const trailingCount = Math.max(0, aggregatedCount - recentFollowerNames.length);
    const namePreview = recentFollowerNames.join(", ");

    return {
      title: aggregatedCount > 1 ? "You have new followers" : notification.title,
      body:
        trailingCount > 0
          ? `${namePreview} and ${trailingCount} others followed your profile.`
          : `${namePreview} followed your profile.`,
      entityType: "profile",
      entityId: notification.entityId ?? existingRow.entity_id ?? null,
      metadata: {
        ...existingMetadata,
        ...notification.metadata,
        aggregatedCount,
        recentFollowerNames,
      },
    };
  }

  if (notification.kind === "friend_request") {
    const priorNames = Array.isArray(existingMetadata.recentRequesterNames)
      ? existingMetadata.recentRequesterNames.filter(Boolean).map((value) => String(value))
      : [];
    const nextName = String(notification.metadata?.requesterName ?? "A player");
    const recentRequesterNames = [...new Set([nextName, ...priorNames])].slice(0, 3);
    const aggregatedCount = Math.max(1, Number(existingMetadata.aggregatedCount ?? 1)) + 1;
    const trailingCount = Math.max(0, aggregatedCount - recentRequesterNames.length);
    const namePreview = recentRequesterNames.join(", ");

    return {
      title: aggregatedCount > 1 ? "You have new friend requests" : notification.title,
      body:
        trailingCount > 0
          ? `${namePreview} and ${trailingCount} others sent friend requests.`
          : `${namePreview} sent you a friend request.`,
      entityType: "profile",
      entityId: notification.entityId ?? existingRow.entity_id ?? null,
      metadata: {
        ...existingMetadata,
        ...notification.metadata,
        aggregatedCount,
        recentRequesterNames,
      },
    };
  }

  return null;
}

function getDistinctUserCount(rows: Array<{ user_id: string | null }>, currentUserId: string) {
  const uniqueUserIds = new Set(
    rows
      .map((row) => row.user_id)
      .filter((value): value is string => Boolean(value)),
  );
  uniqueUserIds.add(currentUserId);
  return uniqueUserIds.size;
}

async function createIntegrityFlag(
  adminClient: SupabaseClient,
  profile: ProfileRow,
  {
    reason,
    requestIpHash,
    eventType,
    targetUserId,
    postId,
    commentId,
    metadata = {},
  }: {
    reason: string;
    requestIpHash: string;
    eventType: IntegrityEventType;
    targetUserId?: string | null;
    postId?: string | null;
    commentId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await createModerationFlag(adminClient, {
    contentType: "profile",
    contentId: null,
    userId: profile.id,
    category: "integrity",
    labels: ["network integrity"],
    reason,
    contentExcerpt: `Integrity check blocked ${eventType} for @${profile.username ?? "player"}.`,
    origin: "integrity",
    evidence: {
      request_ip_hash: requestIpHash,
      event_type: eventType,
      target_user_id: targetUserId ?? null,
      post_id: postId ?? null,
      comment_id: commentId ?? null,
      ...metadata,
    },
  });
}

async function getIntegrityConfig(adminClient: SupabaseClient) {
  const { data, error } = await adminClient
    .from("integrity_settings")
    .select(
      "lookback_days, max_distinct_accounts_per_ip, max_distinct_positive_accounts_per_post, max_distinct_positive_accounts_per_comment, max_distinct_positive_accounts_per_target",
    )
    .eq("id", true)
    .maybeSingle<IntegrityConfigRow>();

  if (error) {
    console.warn("Could not load integrity settings", error);
    return {
      lookbackDays: DEFAULT_INTEGRITY_LOOKBACK_DAYS,
      maxDistinctAccountsPerIp: DEFAULT_MAX_DISTINCT_ACCOUNTS_PER_IP,
      maxDistinctPositiveAccountsPerPost: DEFAULT_MAX_DISTINCT_POSITIVE_ACCOUNTS_PER_POST,
      maxDistinctPositiveAccountsPerComment: DEFAULT_MAX_DISTINCT_POSITIVE_ACCOUNTS_PER_COMMENT,
      maxDistinctPositiveAccountsPerTarget: DEFAULT_MAX_DISTINCT_POSITIVE_ACCOUNTS_PER_TARGET,
    };
  }

  return {
    lookbackDays: data?.lookback_days ?? DEFAULT_INTEGRITY_LOOKBACK_DAYS,
    maxDistinctAccountsPerIp:
      data?.max_distinct_accounts_per_ip ?? DEFAULT_MAX_DISTINCT_ACCOUNTS_PER_IP,
    maxDistinctPositiveAccountsPerPost:
      data?.max_distinct_positive_accounts_per_post ??
      DEFAULT_MAX_DISTINCT_POSITIVE_ACCOUNTS_PER_POST,
    maxDistinctPositiveAccountsPerComment:
      data?.max_distinct_positive_accounts_per_comment ??
      DEFAULT_MAX_DISTINCT_POSITIVE_ACCOUNTS_PER_COMMENT,
    maxDistinctPositiveAccountsPerTarget:
      data?.max_distinct_positive_accounts_per_target ??
      DEFAULT_MAX_DISTINCT_POSITIVE_ACCOUNTS_PER_TARGET,
  };
}

export async function enforceIntegrityCheck({
  request,
  adminClient,
  profile,
  eventType,
  targetUserId = null,
  postId = null,
  commentId = null,
  isPositive = false,
  metadata = {},
}: IntegrityCheckInput) {
  if (profile.integrity_exempt) {
    return { requestIpHash: null };
  }

  const requestIpHash = await getRequestIpHash(request);

  if (!requestIpHash) {
    return { requestIpHash: null };
  }

  const config = await getIntegrityConfig(adminClient);
  const windowStart = new Date(
    Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: recentRows, error } = await adminClient
    .from("integrity_events")
    .select("user_id, target_user_id, post_id, comment_id, is_positive")
    .eq("request_ip_hash", requestIpHash)
    .gte("created_at", windowStart);

  if (error) {
    throw new Error(`Could not verify network integrity: ${error.message}`);
  }

  const otherAccountRows = (recentRows ?? []).filter((row) => row.user_id && row.user_id !== profile.id);
  const distinctAccountsOnNetwork = getDistinctUserCount(otherAccountRows, profile.id);

  if (distinctAccountsOnNetwork >= config.maxDistinctAccountsPerIp) {
    const reason =
      "Too many accounts from this network are creating activity right now. Try again later or contact support.";

    await createIntegrityFlag(adminClient, profile, {
      reason,
      requestIpHash,
      eventType,
      targetUserId,
      postId,
      commentId,
      metadata: {
        distinct_accounts_on_network: distinctAccountsOnNetwork,
        limit: config.maxDistinctAccountsPerIp,
        ...metadata,
      },
    });

    throw new Error(reason);
  }

  if (isPositive && postId) {
    const samePostRows = otherAccountRows.filter(
      (row) => row.is_positive && row.post_id === postId,
    );
    const distinctAccountsOnPost = getDistinctUserCount(samePostRows, profile.id);

    if (distinctAccountsOnPost >= config.maxDistinctPositiveAccountsPerPost) {
      const reason =
        "Too many accounts from this network are boosting the same post. That reaction was blocked.";

      await createIntegrityFlag(adminClient, profile, {
        reason,
        requestIpHash,
        eventType,
        targetUserId,
        postId,
        commentId,
        metadata: {
          distinct_accounts_on_post: distinctAccountsOnPost,
          limit: config.maxDistinctPositiveAccountsPerPost,
          ...metadata,
        },
      });

      throw new Error(reason);
    }
  }

  if (isPositive && commentId) {
    const sameCommentRows = otherAccountRows.filter(
      (row) => row.is_positive && row.comment_id === commentId,
    );
    const distinctAccountsOnComment = getDistinctUserCount(sameCommentRows, profile.id);

    if (distinctAccountsOnComment >= config.maxDistinctPositiveAccountsPerComment) {
      const reason =
        "Too many accounts from this network are boosting the same comment. That reaction was blocked.";

      await createIntegrityFlag(adminClient, profile, {
        reason,
        requestIpHash,
        eventType,
        targetUserId,
        postId,
        commentId,
        metadata: {
          distinct_accounts_on_comment: distinctAccountsOnComment,
          limit: config.maxDistinctPositiveAccountsPerComment,
          ...metadata,
        },
      });

      throw new Error(reason);
    }
  }

  if (isPositive && targetUserId) {
    const sameTargetRows = otherAccountRows.filter(
      (row) => row.is_positive && row.target_user_id === targetUserId,
    );
    const distinctAccountsOnTarget = getDistinctUserCount(sameTargetRows, profile.id);

    if (distinctAccountsOnTarget >= config.maxDistinctPositiveAccountsPerTarget) {
      const reason =
        "Too many accounts from this network are boosting the same author. That action was blocked.";

      await createIntegrityFlag(adminClient, profile, {
        reason,
        requestIpHash,
        eventType,
        targetUserId,
        postId,
        commentId,
        metadata: {
          distinct_accounts_on_target: distinctAccountsOnTarget,
          limit: config.maxDistinctPositiveAccountsPerTarget,
          ...metadata,
        },
      });

      throw new Error(reason);
    }
  }

  return { requestIpHash };
}

export async function recordIntegrityEvent(
  adminClient: SupabaseClient,
  event: IntegrityEventInsert,
) {
  const { error } = await adminClient.from("integrity_events").insert({
    user_id: event.user_id,
    event_type: event.event_type,
    target_user_id: event.target_user_id ?? null,
    post_id: event.post_id ?? null,
    comment_id: event.comment_id ?? null,
    request_ip_hash: event.request_ip_hash,
    is_positive: event.is_positive,
    metadata_json: event.metadata_json ?? {},
  });

  if (error) {
    console.warn("Could not record integrity event", error);
  }
}

export function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }

  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("fly-client-ip") ??
    request.headers.get("x-real-ip") ??
    null
  );
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashValue(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function getRequestIpHash(request: Request) {
  const ip = getRequestIp(request);

  if (!ip) {
    return null;
  }

  return hashValue(`${readEnv("SUPABASE_SERVICE_ROLE_KEY")}:${ip}`);
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}
