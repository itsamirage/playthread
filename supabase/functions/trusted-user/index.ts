import {
  assertActiveProfile,
  corsHeaders,
  getAdminClient,
  getAuthenticatedUser,
  jsonResponse,
  readJsonBody,
  requireProfile,
} from "../_shared/trusted.ts";

type RequestBody =
  | {
      action?: "save_game_follow";
      gameId?: number | string;
      gameTitle?: string | null;
      gameCoverUrl?: string | null;
      playStatus?: string | null;
    }
  | {
      action?: "update_game_follow_cover";
      gameId?: number | string;
      gameCoverUrl?: string | null;
    }
  | {
      action?: "unfollow_game";
      gameId?: number | string;
    }
  | {
      action?: "save_game_rating";
      gameId?: number | string;
      rating?: number | string;
    }
  | {
      action?: "save_notification_preferences";
      preferences?: Record<string, unknown>;
    }
  | {
      action?: "mark_notification_read";
      notificationId?: string;
    }
  | {
      action?: "mark_all_notifications_read";
    };

const FOLLOW_STATUSES = new Set([
  "have_not_played",
  "currently_playing",
  "taking_a_break",
  "completed",
]);

function normalizeGameId(value: unknown) {
  const gameId = Number(value);

  if (!Number.isInteger(gameId) || gameId <= 0) {
    throw new Error("A valid game is required.");
  }

  return gameId;
}

function normalizeText(value: unknown, fallback: string, maxLength = 180) {
  const text = String(value ?? "").trim();
  return (text || fallback).slice(0, maxLength);
}

function normalizeOptionalUrl(value: unknown) {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  if (!/^https?:\/\//i.test(text)) {
    throw new Error("A valid image URL is required.");
  }

  return text.slice(0, 1000);
}

function normalizeFollowStatus(value: unknown) {
  const status = String(value ?? "currently_playing").trim();
  return FOLLOW_STATUSES.has(status) ? status : "currently_playing";
}

function normalizeStoredRating(value: unknown) {
  const rating = Number(value);

  if (!Number.isFinite(rating) || rating < 1 || rating > 10) {
    throw new Error("Choose a rating between 1 and 10.");
  }

  return rating / 2;
}

function normalizeBoolean(value: unknown, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeCooldownMinutes(value: unknown) {
  const minutes = Number(value);

  if (!Number.isFinite(minutes)) {
    return 30;
  }

  return Math.max(0, Math.min(240, Math.round(minutes)));
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
    const profile = await requireProfile(adminClient, user.id);
    assertActiveProfile(profile);

    const body = await readJsonBody<RequestBody>(request);
    const action = body.action;

    if (action === "save_game_follow") {
      const gameId = normalizeGameId(body.gameId);
      const gameTitle = normalizeText(body.gameTitle, `Game ${gameId}`);
      const gameCoverUrl = normalizeOptionalUrl(body.gameCoverUrl);
      const playStatus = normalizeFollowStatus(body.playStatus);

      const { data, error } = await adminClient
        .from("follows")
        .upsert(
          {
            user_id: user.id,
            igdb_game_id: gameId,
            game_title: gameTitle,
            game_cover_url: gameCoverUrl,
            play_status: playStatus,
          },
          { onConflict: "user_id,igdb_game_id" },
        )
        .select("igdb_game_id, game_title, game_cover_url, play_status, created_at")
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({ follow: data });
    }

    if (action === "update_game_follow_cover") {
      const gameId = normalizeGameId(body.gameId);
      const gameCoverUrl = normalizeOptionalUrl(body.gameCoverUrl);

      const { error } = await adminClient
        .from("follows")
        .update({ game_cover_url: gameCoverUrl })
        .eq("user_id", user.id)
        .eq("igdb_game_id", gameId);

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({ success: true });
    }

    if (action === "unfollow_game") {
      const gameId = normalizeGameId(body.gameId);

      const { error } = await adminClient
        .from("follows")
        .delete()
        .eq("user_id", user.id)
        .eq("igdb_game_id", gameId);

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({ success: true });
    }

    if (action === "save_game_rating") {
      const gameId = normalizeGameId(body.gameId);
      const rating = normalizeStoredRating(body.rating);

      const { error } = await adminClient
        .from("game_ratings")
        .upsert(
          {
            user_id: user.id,
            igdb_game_id: gameId,
            rating,
          },
          { onConflict: "user_id,igdb_game_id" },
        );

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({ success: true });
    }

    if (action === "save_notification_preferences") {
      const preferences = body.preferences ?? {};

      const { error } = await adminClient
        .from("notification_preferences")
        .upsert(
          {
            user_id: user.id,
            push_enabled: normalizeBoolean(preferences.pushEnabled, true),
            post_comment_enabled: normalizeBoolean(preferences.postCommentEnabled, true),
            coin_gift_received_enabled: normalizeBoolean(preferences.coinGiftReceivedEnabled, true),
            moderation_warning_enabled: normalizeBoolean(preferences.moderationWarningEnabled, true),
            followed_game_post_enabled: normalizeBoolean(preferences.followedGamePostEnabled, true),
            new_follower_enabled: normalizeBoolean(preferences.newFollowerEnabled, true),
            activity_noise_control_enabled: normalizeBoolean(
              preferences.activityNoiseControlEnabled,
              true,
            ),
            activity_push_cooldown_minutes: normalizeCooldownMinutes(
              preferences.activityPushCooldownMinutes,
            ),
          },
          { onConflict: "user_id" },
        );

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({ success: true });
    }

    if (action === "mark_notification_read") {
      const notificationId = String(body.notificationId ?? "").trim();

      if (!notificationId) {
        throw new Error("A notification id is required.");
      }

      const { error } = await adminClient
        .from("notifications")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq("id", notificationId)
        .eq("user_id", user.id);

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({ success: true });
    }

    if (action === "mark_all_notifications_read") {
      const { error } = await adminClient
        .from("notifications")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({ success: true });
    }

    throw new Error("Unsupported trusted user action.");
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
