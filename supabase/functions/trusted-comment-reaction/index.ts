import {
  assertActiveProfile,
  corsHeaders,
  enforceIntegrityCheck,
  getAdminClient,
  getAuthenticatedUser,
  jsonResponse,
  readJsonBody,
  recordIntegrityEvent,
  requireProfile,
} from "../_shared/trusted.ts";

type RequestBody = {
  commentId?: string;
  reactionType?: string;
};

async function getCommentReactionCounts(adminClient: ReturnType<typeof getAdminClient>, commentId: string) {
  const { count, error } = await adminClient
    .from("comment_reactions")
    .select("id", { count: "exact", head: true })
    .eq("comment_id", commentId)
    .eq("reaction_type", "like");

  if (error) {
    throw new Error(error.message);
  }

  return {
    like: count ?? 0,
  };
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
    const commentId = String(body.commentId ?? "").trim();
    const reactionType = String(body.reactionType ?? "like").trim();

    if (!commentId) {
      throw new Error("Comment id is required.");
    }

    if (reactionType !== "like") {
      throw new Error("Only comment likes are supported.");
    }

    const { data: commentRow, error: commentError } = await adminClient
      .from("post_comments")
      .select("id, post_id, user_id")
      .eq("id", commentId)
      .maybeSingle();

    if (commentError) {
      throw new Error(commentError.message);
    }

    if (!commentRow) {
      throw new Error("That comment no longer exists.");
    }

    const { data: existingReaction, error: existingError } = await adminClient
      .from("comment_reactions")
      .select("id, reaction_type")
      .eq("user_id", user.id)
      .eq("comment_id", commentId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (existingReaction?.reaction_type === reactionType) {
      const { error } = await adminClient.from("comment_reactions").delete().eq("id", existingReaction.id);

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({
        viewerReaction: null,
        reactionCounts: await getCommentReactionCounts(adminClient, commentId),
      });
    }

    const { requestIpHash } = await enforceIntegrityCheck({
      request,
      adminClient,
      profile,
      eventType: "comment_reaction",
      targetUserId: commentRow.user_id ?? null,
      postId: commentRow.post_id ?? null,
      commentId,
      isPositive: true,
      metadata: {
        reaction_type: reactionType,
      },
    });

    if (existingReaction?.id) {
      const { error } = await adminClient
        .from("comment_reactions")
        .update({ reaction_type: reactionType })
        .eq("id", existingReaction.id);

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({
        viewerReaction: reactionType,
        reactionCounts: await getCommentReactionCounts(adminClient, commentId),
      });
    }

    const { error } = await adminClient.from("comment_reactions").insert({
      user_id: user.id,
      comment_id: commentId,
      reaction_type: reactionType,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (requestIpHash) {
      await recordIntegrityEvent(adminClient, {
        user_id: user.id,
        event_type: "comment_reaction",
        target_user_id: commentRow.user_id ?? null,
        post_id: commentRow.post_id ?? null,
        comment_id: commentId,
        request_ip_hash: requestIpHash,
        is_positive: true,
        metadata_json: {
          reaction_type: reactionType,
        },
      });
    }

    return jsonResponse({
      viewerReaction: reactionType,
      reactionCounts: await getCommentReactionCounts(adminClient, commentId),
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
