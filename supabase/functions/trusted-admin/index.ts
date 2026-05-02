import {
  assertAdmin,
  assertOwner,
  assertStaff,
  canAdministerTarget,
  corsHeaders,
  getAdminClient,
  getAuthenticatedUser,
  hashValue,
  jsonResponse,
  readJsonBody,
  requireProfile,
} from "../_shared/trusted.ts";
import {
  assertCanModerateGameScope,
  clampIntegrityReportDays,
  sanitizeGameIds,
} from "../../../lib/adminModerationLogic.js";
import {
  processContentRemoval,
  processContentVisibilityUpdate,
  processRetentionPrune,
} from "../../../lib/trustedAdminService.js";

type RequestBody =
  | {
      action?: "get_moderation_flags";
    }
  | {
      action?: "set_flag_status";
      flagId?: string;
      status?: "open" | "reviewed" | "dismissed" | "actioned";
    }
  | {
      action?: "delete_flagged_content";
      flagId?: string;
    }
  | {
      action?: "update_member_role";
      targetUserId?: string;
      accountRole?: "member" | "moderator" | "admin" | "owner";
      moderationScope?: "all" | "games";
      moderationGameIds?: number[];
    }
  | {
      action?: "set_ban_state";
      targetUserId?: string;
      isBanned?: boolean;
      bannedReason?: string | null;
    }
  | {
      action?: "update_integrity_settings";
      lookbackDays?: number;
      maxDistinctAccountsPerIp?: number;
      maxDistinctPositiveAccountsPerPost?: number;
      maxDistinctPositiveAccountsPerComment?: number;
      maxDistinctPositiveAccountsPerTarget?: number;
    }
  | {
      action?: "get_integrity_report";
      days?: number;
    }
  | {
      action?: "prune_integrity_data";
      integrityRetentionDays?: number;
      moderationActionRetentionDays?: number;
    }
  | {
      action?: "set_content_visibility";
      flagId?: string;
      visibility?: "clean" | "hidden";
    }
  | {
      action?: "update_post_metadata";
      postId?: string;
      type?: "discussion" | "review" | "screenshot" | "guide" | "tip" | "clip";
      pinnedHours?: number | null;
    }
  | {
      action?: "set_developer_games";
      targetUserId?: string;
      developerGameIds?: number[];
    }
  | {
      action?: "get_game_youtube_sources";
    }
  | {
      action?: "upsert_game_youtube_source";
      gameId?: number;
      gameTitle?: string;
      gameCoverUrl?: string | null;
      channelUrl?: string;
      channelId?: string;
      uploadsPlaylistId?: string | null;
      channelTitle?: string | null;
      enabled?: boolean;
    }
  | {
      action?: "disable_game_youtube_source";
      sourceId?: string;
    }
  | {
      action?: "resolve_youtube_channel";
      channelUrl?: string;
    }
  | {
      action?: "ensure_youtube_bot";
    };

const PROFILE_SELECT =
  "id, username, display_name, created_at, account_role, moderation_scope, moderation_game_ids, developer_game_ids, is_banned, banned_reason, integrity_exempt, coins_from_posts, coins_from_comments, coins_from_gifts, coins_from_adjustments, coins_spent, selected_name_color, selected_banner_style, selected_title_key";
const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
const YOUTUBE_BOT_EMAIL = "youtube-bot@playthread.system";
const YOUTUBE_BOT_USERNAME = "youtube_bot";

function normalizeYouTubeChannelId(value: unknown) {
  const channelId = String(value ?? "").trim();
  return YOUTUBE_CHANNEL_ID_PATTERN.test(channelId) ? channelId : null;
}

function normalizeYouTubeChannelUrl(value: unknown) {
  const rawUrl = String(value ?? "").trim();

  if (!rawUrl) {
    return null;
  }

  const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  try {
    const url = new URL(normalizedUrl);
    const host = url.hostname.toLowerCase();

    if (host !== "youtube.com" && !host.endsWith(".youtube.com")) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function buildUploadsPlaylistId(channelId: string) {
  return `UU${channelId.slice(2)}`;
}

function extractQuotedValue(source: string, key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`"${escapedKey}"\\s*:\\s*"([^"]+)"`),
    new RegExp(`<meta\\s+itemprop="${escapedKey}"\\s+content="([^"]+)"`, "i"),
    new RegExp(`<meta\\s+property="og:${escapedKey}"\\s+content="([^"]+)"`, "i"),
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/\\u0026/g, "&");
    }
  }

  return null;
}

async function resolveYouTubeChannel(channelUrlValue: unknown) {
  const channelUrl = normalizeYouTubeChannelUrl(channelUrlValue);

  if (!channelUrl) {
    throw new Error("A valid YouTube channel URL is required.");
  }

  const url = new URL(channelUrl);
  const segments = url.pathname.split("/").filter(Boolean);
  const channelSegmentIndex = segments.findIndex((segment) => segment === "channel");
  const channelIdFromPath = channelSegmentIndex >= 0 ? normalizeYouTubeChannelId(segments[channelSegmentIndex + 1]) : null;

  if (channelIdFromPath) {
    return {
      channelUrl,
      channelId: channelIdFromPath,
      uploadsPlaylistId: buildUploadsPlaylistId(channelIdFromPath),
      channelTitle: null,
    };
  }

  const response = await fetch(channelUrl, {
    headers: {
      "User-Agent": "PlayThreadBot/1.0 (+https://playthread.app)",
    },
  });

  if (!response.ok) {
    throw new Error(`Could not load that YouTube channel page (${response.status}).`);
  }

  const html = await response.text();
  const channelId =
    normalizeYouTubeChannelId(extractQuotedValue(html, "channelId")) ??
    normalizeYouTubeChannelId(extractQuotedValue(html, "externalId")) ??
    normalizeYouTubeChannelId(extractQuotedValue(html, "identifier"));

  if (!channelId) {
    throw new Error("Could not resolve a canonical YouTube channel id from that URL.");
  }

  return {
    channelUrl,
    channelId,
    uploadsPlaylistId: buildUploadsPlaylistId(channelId),
    channelTitle: extractQuotedValue(html, "title") ?? extractQuotedValue(html, "name"),
  };
}

async function ensureYouTubeBotProfile(adminClient: ReturnType<typeof getAdminClient>) {
  const { data: existingProfile, error: existingProfileError } = await adminClient
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("username", YOUTUBE_BOT_USERNAME)
    .maybeSingle();

  if (existingProfileError) {
    throw new Error(existingProfileError.message);
  }

  if (existingProfile) {
    return existingProfile;
  }

  const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
    email: YOUTUBE_BOT_EMAIL,
    email_confirm: true,
    user_metadata: {
      username: YOUTUBE_BOT_USERNAME,
      display_name: "YouTube Bot",
      system_user: true,
    },
  });

  if (createUserError || !createdUser.user?.id) {
    throw new Error(createUserError?.message ?? "Could not create YouTube bot user.");
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .upsert({
      id: createdUser.user.id,
      username: YOUTUBE_BOT_USERNAME,
      display_name: "YouTube Bot",
      avatar_url: null,
      bio: "Automatically shares official YouTube uploads selected by PlayThread admins.",
      genres: [],
      linked_platforms: [],
      account_role: "member",
      integrity_exempt: true,
      selected_title_key: "none",
    })
    .select(PROFILE_SELECT)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  return profile;
}

async function syncBanSignals(
  adminClient: ReturnType<typeof getAdminClient>,
  {
    targetUserId,
    actorUserId,
    reason,
    isBanned,
  }: {
    targetUserId: string;
    actorUserId: string;
    reason: string | null;
    isBanned: boolean;
  },
) {
  if (!isBanned) {
    const { error } = await adminClient
      .from("moderation_ban_signals")
      .update({ is_active: false })
      .eq("source_user_id", targetUserId);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const signalHashes = new Map<string, { signal_type: "network" | "device"; signal_hash: string }>();

  const { data: integrityRows, error: integrityError } = await adminClient
    .from("integrity_events")
    .select("request_ip_hash")
    .eq("user_id", targetUserId)
    .limit(100);

  if (integrityError) {
    throw new Error(integrityError.message);
  }

  for (const row of integrityRows ?? []) {
    if (row.request_ip_hash) {
      signalHashes.set(`network:${row.request_ip_hash}`, {
        signal_type: "network",
        signal_hash: row.request_ip_hash,
      });
    }
  }

  const { data: flagRows, error: flagError } = await adminClient
    .from("moderation_flags")
    .select("evidence_json")
    .eq("user_id", targetUserId)
    .limit(100);

  if (flagError) {
    throw new Error(flagError.message);
  }

  for (const row of flagRows ?? []) {
    const requestIpHash = row.evidence_json?.request_ip_hash;
    if (requestIpHash) {
      signalHashes.set(`network:${requestIpHash}`, {
        signal_type: "network",
        signal_hash: requestIpHash,
      });
    }
  }

  const { data: tokenRows, error: tokenError } = await adminClient
    .from("user_push_tokens")
    .select("expo_push_token")
    .eq("user_id", targetUserId)
    .eq("is_active", true);

  if (tokenError) {
    throw new Error(tokenError.message);
  }

  for (const row of tokenRows ?? []) {
    if (row.expo_push_token) {
      const tokenHash = await hashValue(`device:${row.expo_push_token}`);
      signalHashes.set(`device:${tokenHash}`, {
        signal_type: "device",
        signal_hash: tokenHash,
      });
    }
  }

  const rows = Array.from(signalHashes.values()).map((signal) => ({
    ...signal,
    source_user_id: targetUserId,
    banned_by: actorUserId,
    reason,
    is_active: true,
  }));

  if (rows.length === 0) {
    return;
  }

  const { error: upsertError } = await adminClient
    .from("moderation_ban_signals")
    .upsert(rows, { onConflict: "signal_type,signal_hash,source_user_id" });

  if (upsertError) {
    throw new Error(upsertError.message);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const user = await getAuthenticatedUser(request);
    const adminClient = getAdminClient();
    const actorProfile = await requireProfile(adminClient, user.id);
    const body = await readJsonBody<RequestBody>(request);
    const action = body.action;

    if (action === "get_moderation_flags") {
      assertStaff(actorProfile);

      const { data, error } = await adminClient
        .from("moderation_flags")
        .select("id, content_type, content_id, igdb_game_id, game_title, user_id, flagged_by, origin, category, labels, reason, content_excerpt, status, reviewed_at, created_at, evidence_json")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        throw new Error(error.message);
      }

      const profileIds = Array.from(
        new Set(
          (data ?? [])
            .flatMap((flag) => [flag.user_id, flag.flagged_by])
            .filter(Boolean),
        ),
      );
      const profilesById = new Map<string, Record<string, unknown>>();

      if (profileIds.length > 0) {
        const { data: profileRows, error: profileError } = await adminClient
          .from("profiles")
          .select("id, username, display_name, selected_name_color")
          .in("id", profileIds);

        if (profileError) {
          throw new Error(profileError.message);
        }

        for (const profile of profileRows ?? []) {
          profilesById.set(profile.id, profile);
        }
      }

      const flags = (data ?? []).map((flag) => ({
        ...flag,
        profiles: profilesById.get(flag.user_id) ?? null,
        reporter_profiles: flag.flagged_by ? (profilesById.get(flag.flagged_by) ?? null) : null,
      }));

      return jsonResponse({ success: true, flags });
    }

    if (action === "set_flag_status") {
      assertStaff(actorProfile);

      const flagId = String(body.flagId ?? "").trim();
      const status = String(body.status ?? "").trim();

      if (!flagId || !["open", "reviewed", "dismissed", "actioned"].includes(status)) {
        throw new Error("A valid flag id and status are required.");
      }

      const { data: flagRow, error: flagError } = await adminClient
        .from("moderation_flags")
        .select("id, user_id, status, category, origin, content_type, content_id, igdb_game_id")
        .eq("id", flagId)
        .maybeSingle();

      if (flagError) {
        throw new Error(flagError.message);
      }

      if (!flagRow) {
        throw new Error("That flag no longer exists.");
      }

      const { error } = await adminClient
        .from("moderation_flags")
        .update({
          status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", flagId);

      if (error) {
        throw new Error(error.message);
      }

      const { error: actionError } = await adminClient.from("moderation_actions").insert({
        target_user_id: flagRow.user_id,
        actor_user_id: user.id,
        action_type: "review_flag",
        reason: `Flag moved from ${flagRow.status} to ${status}.`,
        metadata_json: {
          flagId,
          previousStatus: flagRow.status,
          nextStatus: status,
          category: flagRow.category,
          origin: flagRow.origin,
          contentType: flagRow.content_type,
          contentId: flagRow.content_id,
        },
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      return jsonResponse({ success: true });
    }

    if (action === "set_content_visibility") {
      assertStaff(actorProfile);

      const flagId = String(body.flagId ?? "").trim();
      if (!flagId) {
        throw new Error("A valid flag id and visibility are required.");
      }

      const { data: flagRow, error: flagError } = await adminClient
        .from("moderation_flags")
        .select("id, user_id, status, category, origin, content_type, content_id, igdb_game_id")
        .eq("id", flagId)
        .maybeSingle();

      if (flagError) {
        throw new Error(flagError.message);
      }

      if (!flagRow) {
        throw new Error("That flag no longer exists.");
      }

      if (!flagRow.content_id) {
        throw new Error("That flagged item no longer has a target record.");
      }

      const result = await processContentVisibilityUpdate({
        adminClient,
        actorUserId: user.id,
        flagId,
        flagRow,
        visibility: body.visibility,
      });

      return jsonResponse({
        success: true,
        visibility: result.visibility,
        flagStatus: result.flagStatus,
      });
    }

    if (action === "delete_flagged_content") {
      assertStaff(actorProfile);

      const flagId = String(body.flagId ?? "").trim();
      if (!flagId) {
        throw new Error("A valid flag id is required.");
      }

      const { data: flagRow, error: flagError } = await adminClient
        .from("moderation_flags")
        .select("id, user_id, status, category, origin, content_type, content_id, igdb_game_id")
        .eq("id", flagId)
        .maybeSingle();

      if (flagError) {
        throw new Error(flagError.message);
      }

      if (!flagRow) {
        throw new Error("That flag no longer exists.");
      }

      if (!flagRow.content_id) {
        throw new Error("That flagged item no longer has a target record.");
      }

      assertCanModerateGameScope(actorProfile, flagRow.igdb_game_id ?? null);

      const result = await processContentRemoval({
        adminClient,
        actorUserId: user.id,
        flagId,
        flagRow,
      });

      return jsonResponse({
        success: true,
        deleted: result.deleted,
        flagStatus: result.flagStatus,
      });
    }

    if (action === "update_member_role") {
      assertAdmin(actorProfile);

      const targetUserId = String(body.targetUserId ?? "").trim();
      const accountRole = String(body.accountRole ?? "").trim();
      const moderationScope = String(body.moderationScope ?? "all").trim();
      const moderationGameIds = moderationScope === "games" ? sanitizeGameIds(body.moderationGameIds) : [];

      if (!targetUserId) {
        throw new Error("Target user is required.");
      }

      if (!["member", "moderator", "admin", "owner"].includes(accountRole)) {
        throw new Error("Invalid account role.");
      }

      if (!["all", "games"].includes(moderationScope)) {
        throw new Error("Invalid moderation scope.");
      }

      if (accountRole === "owner") {
        assertOwner(actorProfile);
      }

      const targetProfile = await requireProfile(adminClient, targetUserId);

      if (!canAdministerTarget(actorProfile, targetProfile)) {
        throw new Error("You cannot manage that account.");
      }

      if (accountRole === "admin" && actorProfile.account_role !== "owner") {
        throw new Error("Only the owner can promote admins.");
      }

      const { data, error } = await adminClient
        .from("profiles")
        .update({
          account_role: accountRole,
          moderation_scope: moderationScope,
          moderation_game_ids: moderationGameIds,
        })
        .eq("id", targetUserId)
        .select(PROFILE_SELECT)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      const { error: actionError } = await adminClient.from("moderation_actions").insert({
        target_user_id: targetUserId,
        actor_user_id: user.id,
        action_type:
          accountRole === "admin"
            ? "promote_admin"
            : accountRole === "moderator" && targetProfile.account_role !== "moderator"
              ? "promote_moderator"
              : accountRole === targetProfile.account_role
                ? "set_scope"
                : "demote_moderator",
        metadata_json: {
          previousAccountRole: targetProfile.account_role,
          nextAccountRole: accountRole,
          previousModerationScope: targetProfile.moderation_scope ?? "all",
          nextModerationScope: moderationScope,
          previousModerationGameIds: targetProfile.moderation_game_ids ?? [],
          nextModerationGameIds: moderationGameIds,
        },
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      return jsonResponse({ success: true, profile: data });
    }

    if (action === "set_developer_games") {
      assertAdmin(actorProfile);

      const targetUserId = String(body.targetUserId ?? "").trim();
      const developerGameIds = sanitizeGameIds(body.developerGameIds);

      if (!targetUserId) {
        throw new Error("Target user is required.");
      }

      const targetProfile = await requireProfile(adminClient, targetUserId);

      if (!canAdministerTarget(actorProfile, targetProfile)) {
        throw new Error("You cannot manage that account.");
      }

      const { data, error } = await adminClient
        .from("profiles")
        .update({
          developer_game_ids: developerGameIds,
        })
        .eq("id", targetUserId)
        .select(PROFILE_SELECT)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      await syncBanSignals(adminClient, {
        targetUserId,
        actorUserId: user.id,
        reason: bannedReason,
        isBanned,
      });

      const { error: actionError } = await adminClient.from("moderation_actions").insert({
        target_user_id: targetUserId,
        actor_user_id: user.id,
        action_type: "set_developer_games",
        reason: developerGameIds.length > 0 ? "Updated developer-tag game assignments." : "Removed developer-tag game assignments.",
        metadata_json: {
          previousDeveloperGameIds: targetProfile.developer_game_ids ?? [],
          nextDeveloperGameIds: developerGameIds,
        },
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      return jsonResponse({ success: true, profile: data });
    }

    if (action === "get_game_youtube_sources") {
      assertStaff(actorProfile);

      const { data, error } = await adminClient
        .from("game_youtube_sources")
        .select("id, igdb_game_id, game_title, game_cover_url, channel_url, channel_id, uploads_playlist_id, channel_title, enabled, autopost_started_at, last_checked_at, last_seen_video_published_at, last_webhook_received_at, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(200);

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({ success: true, sources: data ?? [] });
    }

    if (action === "upsert_game_youtube_source") {
      assertAdmin(actorProfile);

      const gameId = Number(body.gameId);
      const gameTitle = String(body.gameTitle ?? "").trim();
      const channelUrl = normalizeYouTubeChannelUrl(body.channelUrl);
      const channelId = normalizeYouTubeChannelId(body.channelId);
      const uploadsPlaylistId = String(body.uploadsPlaylistId ?? "").trim() || (channelId ? buildUploadsPlaylistId(channelId) : null);
      const channelTitle = String(body.channelTitle ?? "").trim() || null;
      const enabled = body.enabled !== false;

      if (!gameId || Number.isNaN(gameId) || gameId <= 0) {
        throw new Error("A valid game id is required.");
      }

      if (!gameTitle) {
        throw new Error("Game title is required.");
      }

      if (!channelUrl) {
        throw new Error("A valid YouTube channel URL is required.");
      }

      if (!channelId) {
        throw new Error("A canonical YouTube channel id is required.");
      }

      const { data: existingSource, error: existingError } = await adminClient
        .from("game_youtube_sources")
        .select("id, channel_id, channel_url, enabled")
        .eq("igdb_game_id", gameId)
        .eq("enabled", true)
        .maybeSingle();

      if (existingError) {
        throw new Error(existingError.message);
      }

      const payload = {
        igdb_game_id: gameId,
        game_title: gameTitle,
        game_cover_url: body.gameCoverUrl ?? null,
        channel_url: channelUrl,
        channel_id: channelId,
        uploads_playlist_id: uploadsPlaylistId,
        channel_title: channelTitle,
        enabled,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };

      const query = existingSource?.id
        ? adminClient
            .from("game_youtube_sources")
            .update(payload)
            .eq("id", existingSource.id)
        : adminClient
            .from("game_youtube_sources")
            .insert({
              ...payload,
              created_by: user.id,
            });

      const { data, error } = await query
        .select("id, igdb_game_id, game_title, game_cover_url, channel_url, channel_id, uploads_playlist_id, channel_title, enabled, autopost_started_at, last_checked_at, last_seen_video_published_at, last_webhook_received_at, created_at, updated_at")
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      const { error: actionError } = await adminClient.from("moderation_actions").insert({
        target_user_id: user.id,
        actor_user_id: user.id,
        action_type: "set_game_youtube_source",
        reason: enabled ? "Updated official YouTube source for a game." : "Disabled official YouTube source for a game.",
        metadata_json: {
          sourceId: data?.id ?? existingSource?.id ?? null,
          gameId,
          gameTitle,
          previous: existingSource ?? null,
          next: {
            channelUrl,
            channelId,
            uploadsPlaylistId,
            channelTitle,
            enabled,
          },
        },
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      return jsonResponse({ success: true, source: data });
    }

    if (action === "disable_game_youtube_source") {
      assertAdmin(actorProfile);

      const sourceId = String(body.sourceId ?? "").trim();

      if (!sourceId) {
        throw new Error("Source id is required.");
      }

      const { data: existingSource, error: existingError } = await adminClient
        .from("game_youtube_sources")
        .select("id, igdb_game_id, game_title, channel_id, channel_url, enabled")
        .eq("id", sourceId)
        .maybeSingle();

      if (existingError) {
        throw new Error(existingError.message);
      }

      if (!existingSource) {
        throw new Error("That YouTube source no longer exists.");
      }

      const { data, error } = await adminClient
        .from("game_youtube_sources")
        .update({
          enabled: false,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sourceId)
        .select("id, igdb_game_id, game_title, game_cover_url, channel_url, channel_id, uploads_playlist_id, channel_title, enabled, autopost_started_at, last_checked_at, last_seen_video_published_at, last_webhook_received_at, created_at, updated_at")
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      const { error: actionError } = await adminClient.from("moderation_actions").insert({
        target_user_id: user.id,
        actor_user_id: user.id,
        action_type: "set_game_youtube_source",
        reason: "Disabled official YouTube source for a game.",
        metadata_json: {
          sourceId,
          previous: existingSource,
          next: {
            enabled: false,
          },
        },
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      return jsonResponse({ success: true, source: data });
    }

    if (action === "resolve_youtube_channel") {
      assertAdmin(actorProfile);

      const channel = await resolveYouTubeChannel(body.channelUrl);

      return jsonResponse({
        success: true,
        channel,
      });
    }

    if (action === "ensure_youtube_bot") {
      assertAdmin(actorProfile);

      const botProfile = await ensureYouTubeBotProfile(adminClient);

      return jsonResponse({
        success: true,
        profile: botProfile,
      });
    }

    if (action === "set_ban_state") {
      assertAdmin(actorProfile);

      const targetUserId = String(body.targetUserId ?? "").trim();
      const isBanned = Boolean(body.isBanned);
      const bannedReason = String(body.bannedReason ?? "").trim() || null;

      if (!targetUserId) {
        throw new Error("Target user is required.");
      }

      const targetProfile = await requireProfile(adminClient, targetUserId);

      if (!canAdministerTarget(actorProfile, targetProfile)) {
        throw new Error("You cannot manage that account.");
      }

      const { data, error } = await adminClient
        .from("profiles")
        .update({
          is_banned: isBanned,
          banned_at: isBanned ? new Date().toISOString() : null,
          banned_reason: isBanned ? bannedReason : null,
        })
        .eq("id", targetUserId)
        .select(PROFILE_SELECT)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      const { error: actionError } = await adminClient.from("moderation_actions").insert({
        target_user_id: targetUserId,
        actor_user_id: user.id,
        action_type: isBanned ? "ban" : "restore",
        reason: bannedReason,
        metadata_json: {
          previousIsBanned: Boolean(targetProfile.is_banned),
          nextIsBanned: isBanned,
          previousReason: targetProfile.banned_reason ?? null,
          nextReason: bannedReason,
          targetAccountRole: targetProfile.account_role ?? "member",
        },
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      return jsonResponse({ success: true, profile: data });
    }

    if (action === "update_integrity_settings") {
      assertOwner(actorProfile);

      const { data: existingSettings } = await adminClient
        .from("integrity_settings")
        .select(
          "lookback_days, max_distinct_accounts_per_ip, max_distinct_positive_accounts_per_post, max_distinct_positive_accounts_per_comment, max_distinct_positive_accounts_per_target",
        )
        .eq("id", true)
        .maybeSingle();

      const lookbackDays = Math.max(1, Math.floor(Number(body.lookbackDays ?? 7)));
      const maxDistinctAccountsPerIp = Math.max(
        1,
        Math.floor(Number(body.maxDistinctAccountsPerIp ?? 5)),
      );
      const maxDistinctPositiveAccountsPerPost = Math.max(
        1,
        Math.floor(Number(body.maxDistinctPositiveAccountsPerPost ?? 3)),
      );
      const maxDistinctPositiveAccountsPerComment = Math.max(
        1,
        Math.floor(Number(body.maxDistinctPositiveAccountsPerComment ?? 3)),
      );
      const maxDistinctPositiveAccountsPerTarget = Math.max(
        1,
        Math.floor(Number(body.maxDistinctPositiveAccountsPerTarget ?? 4)),
      );

      const { data, error } = await adminClient
        .from("integrity_settings")
        .upsert({
          id: true,
          lookback_days: lookbackDays,
          max_distinct_accounts_per_ip: maxDistinctAccountsPerIp,
          max_distinct_positive_accounts_per_post: maxDistinctPositiveAccountsPerPost,
          max_distinct_positive_accounts_per_comment: maxDistinctPositiveAccountsPerComment,
          max_distinct_positive_accounts_per_target: maxDistinctPositiveAccountsPerTarget,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .select(
          "lookback_days, max_distinct_accounts_per_ip, max_distinct_positive_accounts_per_post, max_distinct_positive_accounts_per_comment, max_distinct_positive_accounts_per_target, updated_at",
        )
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      const { error: actionError } = await adminClient.from("moderation_actions").insert({
        target_user_id: user.id,
        actor_user_id: user.id,
        action_type: "update_integrity_settings",
        reason: "Updated integrity enforcement thresholds.",
        metadata_json: {
          previous: existingSettings ?? null,
          next: {
            lookback_days: lookbackDays,
            max_distinct_accounts_per_ip: maxDistinctAccountsPerIp,
            max_distinct_positive_accounts_per_post: maxDistinctPositiveAccountsPerPost,
            max_distinct_positive_accounts_per_comment: maxDistinctPositiveAccountsPerComment,
            max_distinct_positive_accounts_per_target: maxDistinctPositiveAccountsPerTarget,
          },
        },
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      return jsonResponse({ success: true, settings: data });
    }

    if (action === "update_post_metadata") {
      assertStaff(actorProfile);

      const postId = String(body.postId ?? "").trim();
      const nextType = String(body.type ?? "").trim();
      const pinnedHoursValue = body.pinnedHours == null ? null : Number(body.pinnedHours);

      if (!postId) {
        throw new Error("Post id is required.");
      }

      if (!["discussion", "review", "screenshot", "guide", "tip", "clip"].includes(nextType)) {
        throw new Error("Invalid post type.");
      }

      const { data: postRow, error: postError } = await adminClient
        .from("posts")
        .select("id, user_id, igdb_game_id, type, pinned_until")
        .eq("id", postId)
        .maybeSingle();

      if (postError) {
        throw new Error(postError.message);
      }

      if (!postRow) {
        throw new Error("That post no longer exists.");
      }

      assertCanModerateGameScope(actorProfile, postRow.igdb_game_id ?? null);

      const pinnedUntil =
        pinnedHoursValue && pinnedHoursValue > 0
          ? new Date(Date.now() + pinnedHoursValue * 60 * 60 * 1000).toISOString()
          : null;

      const { error: updateError } = await adminClient
        .from("posts")
        .update({
          type: nextType,
          pinned_until: pinnedUntil,
        })
        .eq("id", postId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      const actionType =
        nextType !== postRow.type ? "retag_post" : "pin_post";

      const { error: actionError } = await adminClient.from("moderation_actions").insert({
        target_user_id: postRow.user_id,
        actor_user_id: user.id,
        action_type: actionType,
        reason: nextType !== postRow.type ? "Moderator updated the thread tag." : "Moderator updated post pin state.",
        metadata_json: {
          postId,
          previousType: postRow.type,
          nextType,
          previousPinnedUntil: postRow.pinned_until ?? null,
          nextPinnedUntil: pinnedUntil,
        },
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      return jsonResponse({
        success: true,
        postId,
        type: nextType,
        pinnedUntil,
      });
    }

    if (action === "get_integrity_report") {
      assertStaff(actorProfile);

      const days = clampIntegrityReportDays(body.days);
      const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const [
        { data: dailySummary, error: dailyError },
        { data: blockedSummary, error: blockedError },
      ] = await Promise.all([
        adminClient
          .from("integrity_daily_summary")
          .select(
            "summary_day, event_type, event_count, positive_count, distinct_actor_count, distinct_target_count, distinct_network_count",
          )
          .gte("summary_day", windowStart)
          .order("summary_day", { ascending: false }),
        adminClient
          .from("integrity_blocked_daily_summary")
          .select(
            "summary_day, blocked_event_type, blocked_count, distinct_actor_count, distinct_network_count",
          )
          .gte("summary_day", windowStart)
          .order("summary_day", { ascending: false }),
      ]);

      if (dailyError) {
        throw new Error(dailyError.message);
      }

      if (blockedError) {
        throw new Error(blockedError.message);
      }

      return jsonResponse({
        success: true,
        report: {
          days,
          dailySummary: dailySummary ?? [],
          blockedSummary: blockedSummary ?? [],
        },
      });
    }

    if (action === "prune_integrity_data") {
      assertOwner(actorProfile);

      const result = await processRetentionPrune({
        adminClient,
        actorUserId: user.id,
        input: {
          integrityRetentionDays: body.integrityRetentionDays,
          moderationActionRetentionDays: body.moderationActionRetentionDays,
        },
      });

      return jsonResponse({
        success: true,
        retention: result.retention,
        result: result.result,
      });
    }

    throw new Error("Unsupported admin action.");
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
