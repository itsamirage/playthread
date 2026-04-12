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
      "id, username, account_role, moderation_scope, moderation_game_ids, is_banned, banned_reason, integrity_exempt, coins_from_posts, coins_from_comments, coins_from_gifts, coins_from_adjustments, coins_spent",
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
