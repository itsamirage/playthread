import {
  assertActiveProfile,
  corsHeaders,
  createModerationFlag,
  enforceIntegrityCheck,
  evaluateModerationText,
  getAdminClient,
  getAuthenticatedUser,
  getRequestIpHash,
  insertNotification,
  jsonResponse,
  readJsonBody,
  recordIntegrityEvent,
  requireProfile,
} from "../_shared/trusted.ts";

type RequestBody = {
  action?: "create" | "update" | "delete";
  postId?: string;
  commentId?: string;
  body?: string;
  imageUrl?: string | null;
};

const DEFAULT_COMMENT_CREATE_COOLDOWN_SECONDS = 8;
const DEFAULT_COMMENTS_PER_DAY = 120;
const DEFAULT_COMMENTS_PER_30_DAYS = 1500;
const DEFAULT_MEDIA_COMMENTS_PER_DAY = 20;
const DEFAULT_MEDIA_COMMENTS_PER_30_DAYS = 150;

function readNumberEnv(name: string, fallback: number, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const rawValue = Deno.env.get(name);
  const parsedValue = Number(rawValue ?? fallback);

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsedValue)));
}

async function enforceCommentCreateLimits({
  adminClient,
  profile,
  userId,
  hasMedia,
}: {
  adminClient: ReturnType<typeof getAdminClient>;
  profile: { account_role: string | null; integrity_exempt: boolean | null };
  userId: string;
  hasMedia: boolean;
}) {
  if (profile.integrity_exempt || ["admin", "owner"].includes(profile.account_role ?? "")) {
    return;
  }

  const cooldownSeconds = readNumberEnv(
    "COMMENT_CREATE_COOLDOWN_SECONDS",
    DEFAULT_COMMENT_CREATE_COOLDOWN_SECONDS,
    { min: 0, max: 600 },
  );
  const maxCommentsPerDay = readNumberEnv("COMMENTS_MAX_PER_DAY", DEFAULT_COMMENTS_PER_DAY, {
    min: 1,
    max: 5000,
  });
  const maxCommentsPer30Days = readNumberEnv(
    "COMMENTS_MAX_PER_30_DAYS",
    DEFAULT_COMMENTS_PER_30_DAYS,
    { min: 1, max: 20000 },
  );
  const maxMediaCommentsPerDay = readNumberEnv(
    "MEDIA_COMMENTS_MAX_PER_DAY",
    DEFAULT_MEDIA_COMMENTS_PER_DAY,
    { min: 1, max: 1000 },
  );
  const maxMediaCommentsPer30Days = readNumberEnv(
    "MEDIA_COMMENTS_MAX_PER_30_DAYS",
    DEFAULT_MEDIA_COMMENTS_PER_30_DAYS,
    { min: 1, max: 5000 },
  );

  const now = Date.now();
  const cooldownStart = new Date(now - cooldownSeconds * 1000).toISOString();
  const dayStart = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [cooldownResult, dailyResult, monthlyResult] = await Promise.all([
    adminClient
      .from("post_comments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", cooldownStart),
    adminClient
      .from("post_comments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", dayStart),
    adminClient
      .from("post_comments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", monthStart),
  ]);

  if (cooldownResult.error) {
    throw new Error(`Could not verify comment cooldown: ${cooldownResult.error.message}`);
  }

  if (dailyResult.error) {
    throw new Error(`Could not verify daily comment limit: ${dailyResult.error.message}`);
  }

  if (monthlyResult.error) {
    throw new Error(`Could not verify monthly comment limit: ${monthlyResult.error.message}`);
  }

  if (cooldownSeconds > 0 && (cooldownResult.count ?? 0) > 0) {
    throw new Error("Wait a moment before commenting again.");
  }

  if ((dailyResult.count ?? 0) >= maxCommentsPerDay) {
    throw new Error(`You have reached the limit of ${maxCommentsPerDay} comments in 24 hours.`);
  }

  if ((monthlyResult.count ?? 0) >= maxCommentsPer30Days) {
    throw new Error(`You have reached the limit of ${maxCommentsPer30Days} comments in 30 days.`);
  }

  if (!hasMedia) {
    return;
  }

  const [mediaDailyResult, mediaMonthlyResult] = await Promise.all([
    adminClient
      .from("post_comments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", dayStart)
      .not("image_url", "is", null),
    adminClient
      .from("post_comments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", monthStart)
      .not("image_url", "is", null),
  ]);

  if (mediaDailyResult.error) {
    throw new Error(`Could not verify daily media comment limit: ${mediaDailyResult.error.message}`);
  }

  if (mediaMonthlyResult.error) {
    throw new Error(`Could not verify monthly media comment limit: ${mediaMonthlyResult.error.message}`);
  }

  if ((mediaDailyResult.count ?? 0) >= maxMediaCommentsPerDay) {
    throw new Error(`You have reached the limit of ${maxMediaCommentsPerDay} image comments in 24 hours.`);
  }

  if ((mediaMonthlyResult.count ?? 0) >= maxMediaCommentsPer30Days) {
    throw new Error(`You have reached the limit of ${maxMediaCommentsPer30Days} image comments in 30 days.`);
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
    const profile = await requireProfile(adminClient, user.id);
    assertActiveProfile(profile);

    const body = await readJsonBody<RequestBody>(request);
    const action = body.action ?? "create";

    if (action === "delete") {
      const commentId = String(body.commentId ?? "").trim();

      if (!commentId) {
        throw new Error("Comment id is required.");
      }

      const { data: commentRow, error: commentError } = await adminClient
        .from("post_comments")
        .select("id, user_id")
        .eq("id", commentId)
        .maybeSingle();

      if (commentError) {
        throw new Error(commentError.message);
      }

      if (!commentRow) {
        throw new Error("That comment no longer exists.");
      }

      if (commentRow.user_id !== user.id && !["admin", "owner"].includes(profile.account_role ?? "")) {
        throw new Error("You cannot delete that comment.");
      }

      const { error } = await adminClient.from("post_comments").delete().eq("id", commentId);

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({ success: true });
    }

    if (action === "update") {
      const commentId = String(body.commentId ?? "").trim();
      const textBody = String(body.body ?? "").trim();

      if (!commentId) {
        throw new Error("Comment id is required.");
      }

      if (!textBody) {
        throw new Error("Comment body is required.");
      }

      const { data: commentRow, error: commentError } = await adminClient
        .from("post_comments")
        .select("id, user_id")
        .eq("id", commentId)
        .maybeSingle();

      if (commentError) {
        throw new Error(commentError.message);
      }

      if (!commentRow) {
        throw new Error("That comment no longer exists.");
      }

      if (commentRow.user_id !== user.id && !["admin", "owner"].includes(profile.account_role ?? "")) {
        throw new Error("You cannot edit that comment.");
      }

      const moderation = evaluateModerationText(textBody);
      const { error: updateError } = await adminClient
        .from("post_comments")
        .update({
          body: textBody,
          moderation_state: moderation.moderationState,
          moderation_labels: moderation.labels,
        })
        .eq("id", commentId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      return jsonResponse({
        success: true,
        commentId,
        moderation,
      });
    }

    const postId = String(body.postId ?? "").trim();
    const textBody = String(body.body ?? "").trim();

    if (!postId) {
      throw new Error("Post id is required.");
    }

    if (!textBody) {
      throw new Error("Comment body is required.");
    }

    const { data: postRow, error: postError } = await adminClient
      .from("posts")
      .select("id, user_id, igdb_game_id, game_title")
      .eq("id", postId)
      .maybeSingle();

    if (postError) {
      throw new Error(postError.message);
    }

    if (!postRow) {
      throw new Error("That post no longer exists.");
    }

    const imageUrl = String(body.imageUrl ?? "").trim() || null;

    await enforceCommentCreateLimits({
      adminClient,
      profile,
      userId: user.id,
      hasMedia: Boolean(imageUrl),
    });

    const { requestIpHash } = await enforceIntegrityCheck({
      request,
      adminClient,
      profile,
      eventType: "comment_create",
      postId,
      targetUserId: postRow.user_id ?? null,
      metadata: {
        game_id: postRow.igdb_game_id ?? null,
      },
    });

    const { data: comment, error: commentError } = await adminClient
      .from("post_comments")
      .insert({
        user_id: user.id,
        post_id: postId,
        body: textBody,
        image_url: imageUrl,
      })
      .select("id")
      .single();

    if (commentError || !comment?.id) {
      throw new Error(commentError?.message ?? "Could not create comment.");
    }

    const moderation = evaluateModerationText(textBody);

    if (moderation.moderationState === "warning" && moderation.category && moderation.reason) {
      const ipHash = await getRequestIpHash(request);

      await adminClient
        .from("post_comments")
        .update({
          moderation_state: moderation.moderationState,
          moderation_labels: moderation.labels,
        })
        .eq("id", comment.id);

      await createModerationFlag(adminClient, {
        contentType: "comment",
        contentId: comment.id,
        userId: user.id,
        category: moderation.category,
        labels: moderation.labels,
        reason: moderation.reason,
        contentExcerpt: textBody,
        igdbGameId: postRow.igdb_game_id ?? null,
        gameTitle: postRow.game_title ?? null,
        evidence: {
          request_ip_hash: ipHash,
        },
      });

      await insertNotification(adminClient, {
        userId: user.id,
        actorUserId: user.id,
        kind: "moderation_warning",
        title: "Your comment was flagged for review",
        body: moderation.reason,
        entityType: "comment",
        entityId: comment.id,
        metadata: {
          labels: moderation.labels,
          postId,
        },
      });
    }

    if (postRow.user_id && postRow.user_id !== user.id) {
      await insertNotification(adminClient, {
        userId: postRow.user_id,
        actorUserId: user.id,
        kind: "post_comment",
        title: "New reply on your post",
        body: textBody.slice(0, 160),
        entityType: "post",
        entityId: postId,
        metadata: {
          commentId: comment.id,
          gameId: postRow.igdb_game_id ?? null,
          gameTitle: postRow.game_title ?? null,
        },
      });
    }

    if (requestIpHash) {
      await recordIntegrityEvent(adminClient, {
        user_id: user.id,
        event_type: "comment_create",
        target_user_id: postRow.user_id ?? null,
        post_id: postId,
        comment_id: comment.id,
        request_ip_hash: requestIpHash,
        is_positive: false,
        metadata_json: {
          game_id: postRow.igdb_game_id ?? null,
        },
      });
    }

    return jsonResponse({
      commentId: comment.id,
      moderation,
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
