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

const REACTION_MODE_BY_POST_TYPE: Record<string, string> = {
  guide: "utility",
  tip: "utility",
  discussion: "sentiment",
  review: "appreciation",
  screenshot: "sentiment",
  clip: "sentiment",
  image: "sentiment",
};

const DEFAULT_REACTION_BY_MODE: Record<string, string> = {
  utility: "helpful",
  sentiment: "like",
  appreciation: "respect",
};

type RequestBody = {
  gameId?: number;
  gameTitle?: string;
  gameCoverUrl?: string | null;
  type?: string;
  title?: string | null;
  body?: string;
  imageUrl?: string | null;
  rating?: number | null;
  spoiler?: boolean;
  spoilerTag?: string | null;
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
    const postType = String(body.type ?? "").trim();
    const textBody = String(body.body ?? "").trim();
    const gameId = Number(body.gameId);
    const gameTitle = String(body.gameTitle ?? "").trim();

    if (!gameId || Number.isNaN(gameId)) {
      throw new Error("A valid game is required.");
    }

    if (!gameTitle) {
      throw new Error("Game title is required.");
    }

    if (!textBody) {
      throw new Error("Post body is required.");
    }

    const reactionMode = REACTION_MODE_BY_POST_TYPE[postType] ?? "sentiment";
    const defaultReactionType = DEFAULT_REACTION_BY_MODE[reactionMode] ?? "like";
    const { requestIpHash } = await enforceIntegrityCheck({
      request,
      adminClient,
      profile,
      eventType: "post_create",
      metadata: {
        game_id: gameId,
        post_type: postType,
      },
    });

    const { data: post, error: postError } = await adminClient
      .from("posts")
      .insert({
        user_id: user.id,
        igdb_game_id: gameId,
        game_title: gameTitle,
        game_cover_url: body.gameCoverUrl ?? null,
        type: postType,
        reaction_mode: reactionMode,
        title: String(body.title ?? "").trim() || null,
        body: textBody,
        image_url: String(body.imageUrl ?? "").trim() || null,
        spoiler: Boolean(body.spoiler),
        spoiler_tag: body.spoiler ? String(body.spoilerTag ?? "").trim() || null : null,
        rating: body.rating != null ? Number(body.rating) / 2 : null,
      })
      .select("id")
      .single();

    if (postError || !post?.id) {
      throw new Error(postError?.message ?? "Could not create post.");
    }

    const { error: reactionError } = await adminClient.from("post_reactions").insert({
      user_id: user.id,
      post_id: post.id,
      reaction_type: defaultReactionType,
    });

    if (reactionError) {
      console.warn("Could not seed author reaction for new post", reactionError);
    }

    const moderation = evaluateModerationText(`${String(body.title ?? "").trim()}\n${textBody}`);

    if (moderation.moderationState === "warning" && moderation.category && moderation.reason) {
      const ipHash = await getRequestIpHash(request);

      await adminClient
        .from("posts")
        .update({
          moderation_state: moderation.moderationState,
          moderation_labels: moderation.labels,
        })
        .eq("id", post.id);

      await createModerationFlag(adminClient, {
        contentType: "post",
        contentId: post.id,
        userId: user.id,
        category: moderation.category,
        labels: moderation.labels,
        reason: moderation.reason,
        contentExcerpt: `${String(body.title ?? "").trim()} ${textBody}`.trim(),
        igdbGameId: gameId,
        gameTitle,
        evidence: {
          request_ip_hash: ipHash,
        },
      });
    }

    if (requestIpHash) {
      await recordIntegrityEvent(adminClient, {
        user_id: user.id,
        event_type: "post_create",
        post_id: post.id,
        request_ip_hash: requestIpHash,
        is_positive: false,
        metadata_json: {
          game_id: gameId,
          post_type: postType,
        },
      });
    }

    return jsonResponse({
      postId: post.id,
      moderation,
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
