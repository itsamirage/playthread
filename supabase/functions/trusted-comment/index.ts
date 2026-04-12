import {
  assertActiveProfile,
  corsHeaders,
  createModerationFlag,
  enforceIntegrityCheck,
  evaluateModerationText,
  getAdminClient,
  getAuthenticatedUser,
  getRequestIpHash,
  jsonResponse,
  readJsonBody,
  recordIntegrityEvent,
  requireProfile,
} from "../_shared/trusted.ts";

type RequestBody = {
  action?: "create" | "delete";
  postId?: string;
  commentId?: string;
  body?: string;
};

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
