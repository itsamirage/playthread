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

const ALLOWED_REACTIONS_BY_MODE: Record<string, string[]> = {
  utility: ["helpful", "not_helpful"],
  sentiment: ["like", "dislike"],
  appreciation: ["respect"],
};

type RequestBody = {
  postId?: string;
  reactionType?: string;
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
    const postId = String(body.postId ?? "").trim();
    const reactionType = String(body.reactionType ?? "").trim();

    if (!postId || !reactionType) {
      throw new Error("Post id and reaction type are required.");
    }

    const { data: postRow, error: postError } = await adminClient
      .from("posts")
      .select("id, user_id, reaction_mode")
      .eq("id", postId)
      .maybeSingle();

    if (postError) {
      throw new Error(postError.message);
    }

    if (!postRow) {
      throw new Error("That post no longer exists.");
    }

    const allowedReactions = ALLOWED_REACTIONS_BY_MODE[postRow.reaction_mode ?? "sentiment"] ?? ["like", "dislike"];

    if (!allowedReactions.includes(reactionType)) {
      throw new Error("That reaction is not valid for this post.");
    }

    const { data: existingReaction, error: existingError } = await adminClient
      .from("post_reactions")
      .select("id, reaction_type")
      .eq("user_id", user.id)
      .eq("post_id", postId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (existingReaction?.reaction_type === reactionType) {
      const { error } = await adminClient.from("post_reactions").delete().eq("id", existingReaction.id);

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({ viewerReaction: null });
    }

    const positiveReactions = new Set(["like", "helpful", "respect"]);
    const isPositive = positiveReactions.has(reactionType);
    const { requestIpHash } = await enforceIntegrityCheck({
      request,
      adminClient,
      profile,
      eventType: "post_reaction",
      postId,
      targetUserId: postRow.user_id ?? null,
      isPositive,
      metadata: {
        reaction_type: reactionType,
      },
    });

    if (existingReaction?.id) {
      const { error } = await adminClient
        .from("post_reactions")
        .update({ reaction_type: reactionType })
        .eq("id", existingReaction.id);

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({ viewerReaction: reactionType });
    }

    const { error } = await adminClient.from("post_reactions").insert({
      user_id: user.id,
      post_id: postId,
      reaction_type: reactionType,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (requestIpHash) {
      await recordIntegrityEvent(adminClient, {
        user_id: user.id,
        event_type: "post_reaction",
        target_user_id: postRow.user_id ?? null,
        post_id: postId,
        request_ip_hash: requestIpHash,
        is_positive: isPositive,
        metadata_json: {
          reaction_type: reactionType,
        },
      });
    }

    return jsonResponse({ viewerReaction: reactionType });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
