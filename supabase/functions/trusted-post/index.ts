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
import { deleteMuxAsset } from "../_shared/mux.ts";

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
  action?: "create" | "update" | "delete";
  postId?: string;
  gameId?: number;
  gameTitle?: string;
  gameCoverUrl?: string | null;
  type?: string;
  title?: string | null;
  body?: string;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  imageMetadata?: {
    mimeType?: string | null;
    extension?: string | null;
    fileSize?: number | null;
    width?: number | null;
    height?: number | null;
    aspectRatio?: number | null;
    isAnimated?: boolean | null;
  } | null;
  imageMetadataList?: Array<{
    mimeType?: string | null;
    extension?: string | null;
    fileSize?: number | null;
    width?: number | null;
    height?: number | null;
    aspectRatio?: number | null;
    isAnimated?: boolean | null;
  }> | null;
  videoUploadId?: string | null;
  videoUploadToken?: string | null;
  rating?: number | null;
  spoiler?: boolean;
  spoilerTag?: string | null;
};

function canManagePost(postUserId: string | null, actorUserId: string, accountRole: string | null) {
  return postUserId === actorUserId || ["admin", "owner"].includes(accountRole ?? "");
}

function normalizeImageMetadata(value: RequestBody["imageMetadata"]) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const width = Number(value.width ?? 0);
  const height = Number(value.height ?? 0);
  const aspectRatio = Number(value.aspectRatio ?? 0);
  const fileSize = Number(value.fileSize ?? 0);

  return {
    mime_type: String(value.mimeType ?? "").trim().toLowerCase() || null,
    extension: String(value.extension ?? "").trim().toLowerCase() || null,
    file_size: fileSize > 0 ? fileSize : null,
    width: width > 0 ? width : null,
    height: height > 0 ? height : null,
    aspect_ratio: aspectRatio > 0 ? aspectRatio : null,
    is_animated: Boolean(value.isAnimated),
  };
}

function normalizeImageUrls(value: RequestBody["imageUrls"], fallbackImageUrl: string | null) {
  const urls = Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];

  if (urls.length > 0) {
    return urls;
  }

  return fallbackImageUrl ? [fallbackImageUrl] : [];
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
    const action = String(body.action ?? "create").trim();

    if (action === "delete") {
      const postId = String(body.postId ?? "").trim();

      if (!postId) {
        throw new Error("Post id is required.");
      }

      const { data: postRow, error: postError } = await adminClient
        .from("posts")
        .select("id, user_id, type, video_asset_id, igdb_game_id, game_title")
        .eq("id", postId)
        .maybeSingle();

      if (postError) {
        throw new Error(postError.message);
      }

      if (!postRow) {
        throw new Error("That post no longer exists.");
      }

      if (!canManagePost(postRow.user_id, user.id, profile.account_role)) {
        throw new Error("You cannot delete that post.");
      }

      const { error: deleteError } = await adminClient.from("posts").delete().eq("id", postId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      if (postRow.type === "clip" && postRow.video_asset_id) {
        try {
          await deleteMuxAsset(postRow.video_asset_id);
        } catch (muxError) {
          console.warn("Could not delete Mux asset for removed post", muxError);
        }
      }

      return jsonResponse({ success: true, deletedPostId: postId });
    }

    if (action === "update") {
      const postId = String(body.postId ?? "").trim();
      const nextTitle = String(body.title ?? "").trim() || null;
      const nextBody = String(body.body ?? "").trim();
      const nextSpoiler = Boolean(body.spoiler);
      const nextSpoilerTag = nextSpoiler ? String(body.spoilerTag ?? "").trim() || null : null;

      if (!postId) {
        throw new Error("Post id is required.");
      }

      const { data: postRow, error: postError } = await adminClient
        .from("posts")
        .select("id, user_id, type, igdb_game_id, game_title")
        .eq("id", postId)
        .maybeSingle();

      if (postError) {
        throw new Error(postError.message);
      }

      if (!postRow) {
        throw new Error("That post no longer exists.");
      }

      if (!canManagePost(postRow.user_id, user.id, profile.account_role)) {
        throw new Error("You cannot edit that post.");
      }

      if (!nextBody && postRow.type !== "clip") {
        throw new Error("Post body is required.");
      }

      const moderation = evaluateModerationText(`${nextTitle ?? ""}\n${nextBody}`);
      const updatePayload = {
        title: nextTitle,
        body: nextBody,
        spoiler: nextSpoiler,
        spoiler_tag: nextSpoilerTag,
        moderation_state: moderation.moderationState,
        moderation_labels: moderation.labels,
      };

      const { error: updateError } = await adminClient
        .from("posts")
        .update(updatePayload)
        .eq("id", postId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      if (moderation.moderationState === "warning" && moderation.category && moderation.reason) {
        const ipHash = await getRequestIpHash(request);

        await createModerationFlag(adminClient, {
          contentType: "post",
          contentId: postId,
          userId: postRow.user_id,
          category: moderation.category,
          labels: moderation.labels,
          reason: moderation.reason,
          contentExcerpt: `${nextTitle ?? ""} ${nextBody}`.trim(),
          igdbGameId: postRow.igdb_game_id ?? null,
          gameTitle: postRow.game_title ?? null,
          evidence: {
            request_ip_hash: ipHash,
            post_type: postRow.type,
          },
        });

        await insertNotification(adminClient, {
          userId: postRow.user_id,
          actorUserId: user.id,
          kind: "moderation_warning",
          title: "Your post was flagged for review",
          body: moderation.reason,
          entityType: "post",
          entityId: postId,
          metadata: {
            labels: moderation.labels,
            postType: postRow.type,
          },
        });
      }

      return jsonResponse({
        success: true,
        postId,
        moderation,
      });
    }

    const postType = String(body.type ?? "").trim();
    const textBody = String(body.body ?? "").trim();
    const imageMetadata = normalizeImageMetadata(body.imageMetadata);
    const fallbackImageUrl = String(body.imageUrl ?? "").trim() || null;
    const imageUrls = normalizeImageUrls(body.imageUrls, fallbackImageUrl);
    const videoUploadId = String(body.videoUploadId ?? "").trim() || null;
    const videoUploadToken = String(body.videoUploadToken ?? "").trim() || null;
    const gameId = Number(body.gameId);
    const gameTitle = String(body.gameTitle ?? "").trim();

    if (!gameId || Number.isNaN(gameId)) {
      throw new Error("A valid game is required.");
    }

    if (!gameTitle) {
      throw new Error("Game title is required.");
    }

    if (!textBody && postType !== "clip") {
      throw new Error("Post body is required.");
    }

    if (postType === "clip" && !videoUploadId && !videoUploadToken) {
      throw new Error("Clip posts require an uploaded video.");
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
        image_url: imageUrls[0] ?? fallbackImageUrl,
        image_urls: imageUrls,
        video_provider: postType === "clip" ? "mux" : null,
        video_upload_id: postType === "clip" ? videoUploadId : null,
        video_upload_token: postType === "clip" ? videoUploadToken : null,
        video_status: postType === "clip" ? "uploading" : "none",
        spoiler: Boolean(body.spoiler),
        spoiler_tag: body.spoiler ? String(body.spoilerTag ?? "").trim() || null : null,
        rating: body.rating != null ? Number(body.rating) : null,
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
          post_type: postType,
          media_kind:
            postType === "clip"
              ? "clip"
                : imageUrls[0] ?? fallbackImageUrl
                ? "image"
                : "text",
          image_url: imageUrls[0] ?? fallbackImageUrl,
          image_urls: imageUrls,
          image_metadata: body.imageMetadataList ?? imageMetadata,
          video_upload_id: videoUploadId,
          video_status: postType === "clip" ? "uploading" : "none",
        },
      });

      await insertNotification(adminClient, {
        userId: user.id,
        actorUserId: user.id,
        kind: "moderation_warning",
        title: "Your post was flagged for review",
        body: moderation.reason,
        entityType: "post",
        entityId: post.id,
        metadata: {
          labels: moderation.labels,
          postType,
          imageMetadata,
        },
      });
    }

    const { data: followerRows, error: followerError } = await adminClient
      .from("follows")
      .select("user_id")
      .eq("igdb_game_id", gameId);

    if (!followerError) {
      const recipients = [...new Set((followerRows ?? []).map((row) => row.user_id).filter(Boolean))]
        .filter((recipientId) => recipientId !== user.id);

      if (recipients.length > 0) {
        await Promise.all(
          recipients.map((recipientId) =>
            insertNotification(adminClient, {
              userId: recipientId,
              actorUserId: user.id,
              kind: "followed_game_post",
              title: `${gameTitle} has a new post`,
              body: String(body.title ?? "").trim() || `${profile.username ?? "A player"} posted in a game you follow.`,
              entityType: "post",
              entityId: post.id,
              metadata: {
                gameId,
                gameTitle,
                postType,
                actorName: profile.username ?? "player",
              },
            }),
          ),
        );
      }
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
          media_kind:
            postType === "clip"
              ? "clip"
                : imageUrls[0] ?? fallbackImageUrl
                ? "image"
                : "text",
          video_upload_id: videoUploadId,
          image_metadata: body.imageMetadataList ?? imageMetadata,
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
