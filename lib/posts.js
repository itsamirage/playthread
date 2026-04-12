import { useCallback, useEffect, useState } from "react";

import { useAuth } from "./auth";
import { uploadMuxClip } from "./clipMedia";
import { invokeEdgeFunction } from "./functions";
import { removePostImage, uploadPostImage } from "./postMedia";
import { supabase } from "./supabase";

export const REACTION_MODE_BY_POST_TYPE = {
  guide: "utility",
  tip: "utility",
  discussion: "sentiment",
  review: "appreciation",
  screenshot: "sentiment",
  clip: "sentiment",
  image: "sentiment",
};

export const REACTION_OPTIONS_BY_MODE = {
  utility: ["helpful", "not_helpful"],
  sentiment: ["like", "dislike"],
  appreciation: ["respect"],
};

function getReactionModeForPostType(postType) {
  return REACTION_MODE_BY_POST_TYPE[postType] ?? "sentiment";
}

function formatRelativeTime(isoString) {
  const createdAt = new Date(isoString).getTime();
  const diffInMinutes = Math.max(1, Math.floor((Date.now() - createdAt) / 60000));

  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);

  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
}

function normalizePost(post) {
  const reactionMode = post.reaction_mode ?? getReactionModeForPostType(post.type);

  return {
    id: post.id,
    userId: post.user_id,
    gameId: post.igdb_game_id,
    gameTitle: post.game_title,
    gameCoverUrl: post.game_cover_url,
    type: post.type,
    title: post.title || "Untitled post",
    body: post.body,
    imageUrl: post.image_url ?? null,
    videoProvider: post.video_provider ?? null,
    videoUploadId: post.video_upload_id ?? null,
    videoUploadToken: post.video_upload_token ?? null,
    videoAssetId: post.video_asset_id ?? null,
    videoPlaybackId: post.video_playback_id ?? null,
    videoStatus: post.video_status ?? "none",
    videoThumbnailUrl: post.video_thumbnail_url ?? null,
    videoDurationSeconds: post.video_duration_seconds ?? null,
    spoiler: Boolean(post.spoiler),
    spoilerTag: post.spoiler_tag ?? null,
    rating:
      typeof post.rating === "number"
        ? Number((post.rating * 2).toFixed(1))
        : post.rating
          ? Number((Number(post.rating) * 2).toFixed(1))
          : null,
    author:
      post.profiles?.display_name ||
      post.profiles?.username ||
      "player",
    authorNameColor: post.profiles?.selected_name_color ?? "default",
    authorTitleKey: post.profiles?.selected_title_key ?? "none",
    reactionMode,
    reactionCounts: {
      like: 0,
      dislike: 0,
      helpful: 0,
      not_helpful: 0,
      respect: 0,
    },
    viewerReaction: null,
    comments: post.comments_count ?? 0,
    moderationState: post.moderation_state ?? "clean",
    moderationLabels: post.moderation_labels ?? [],
    age: formatRelativeTime(post.created_at),
    createdAt: post.created_at,
  };
}

function normalizeComment(comment, userId) {
  return {
    id: comment.id,
    postId: comment.post_id,
    userId: comment.user_id,
    body: comment.body,
    age: formatRelativeTime(comment.created_at),
    createdAt: comment.created_at,
    author:
      comment.profiles?.display_name ||
      comment.profiles?.username ||
      "player",
    authorNameColor: comment.profiles?.selected_name_color ?? "default",
    authorTitleKey: comment.profiles?.selected_title_key ?? "none",
    reactionCounts: {
      like: 0,
    },
    viewerReaction: null,
    moderationState: comment.moderation_state ?? "clean",
    moderationLabels: comment.moderation_labels ?? [],
    isMine: comment.user_id === userId,
  };
}

function applyReactionState(posts, reactions, viewerReactionByPostId) {
  const countsByPostId = new Map();

  reactions.forEach((reaction) => {
    const postId = reaction.post_id;
    const nextCounts = countsByPostId.get(postId) ?? {
      like: 0,
      dislike: 0,
      helpful: 0,
      not_helpful: 0,
      respect: 0,
    };

    if (typeof reaction.reaction_type === "string" && reaction.reaction_type in nextCounts) {
      nextCounts[reaction.reaction_type] += 1;
      countsByPostId.set(postId, nextCounts);
    }
  });

  return posts.map((post) => {
    const reactionCounts = countsByPostId.get(post.id) ?? post.reactionCounts;

    return {
      ...post,
      reactionCounts,
      viewerReaction: viewerReactionByPostId.get(post.id) ?? null,
    };
  });
}

async function loadReactionState(posts, userId) {
  if (posts.length === 0) {
    return posts;
  }

  const postIds = posts.map((post) => post.id);
  const [{ data: reactionRows, error: reactionsError }, { data: viewerRows, error: viewerError }] =
    await Promise.all([
      supabase
        .from("post_reactions")
        .select("post_id, reaction_type")
        .in("post_id", postIds),
      userId
        ? supabase
            .from("post_reactions")
            .select("post_id, reaction_type")
            .eq("user_id", userId)
            .in("post_id", postIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (reactionsError) {
    throw reactionsError;
  }

  if (viewerError) {
    throw viewerError;
  }

  const viewerReactionByPostId = new Map(
    (viewerRows ?? []).map((row) => [row.post_id, row.reaction_type]),
  );

  return applyReactionState(posts, reactionRows ?? [], viewerReactionByPostId);
}

async function loadPostsWithReactions(query, userId) {
  const { data, error: postsError } = await query;

  if (postsError) {
    throw postsError;
  }

  const normalizedPosts = (data ?? []).map(normalizePost);
  return loadReactionState(normalizedPosts, userId);
}

function applyCommentReactionState(comments, reactions, viewerReactionByCommentId) {
  const countsByCommentId = new Map();

  reactions.forEach((reaction) => {
    const commentId = reaction.comment_id;
    const nextCounts = countsByCommentId.get(commentId) ?? { like: 0 };

    if (reaction.reaction_type === "like") {
      nextCounts.like += 1;
      countsByCommentId.set(commentId, nextCounts);
    }
  });

  return comments.map((comment) => ({
    ...comment,
    reactionCounts: countsByCommentId.get(comment.id) ?? comment.reactionCounts,
    viewerReaction: viewerReactionByCommentId.get(comment.id) ?? null,
  }));
}

async function loadCommentReactionState(comments, userId) {
  if (comments.length === 0) {
    return comments;
  }

  const commentIds = comments.map((comment) => comment.id);
  const [{ data: reactionRows, error: reactionsError }, { data: viewerRows, error: viewerError }] =
    await Promise.all([
      supabase
        .from("comment_reactions")
        .select("comment_id, reaction_type")
        .in("comment_id", commentIds),
      userId
        ? supabase
            .from("comment_reactions")
            .select("comment_id, reaction_type")
            .eq("user_id", userId)
            .in("comment_id", commentIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (reactionsError) {
    throw reactionsError;
  }

  if (viewerError) {
    throw viewerError;
  }

  const viewerReactionByCommentId = new Map(
    (viewerRows ?? []).map((row) => [row.comment_id, row.reaction_type])
  );

  return applyCommentReactionState(comments, reactionRows ?? [], viewerReactionByCommentId);
}

function getPeriodStart(period) {
  const now = new Date();

  if (period === "day") {
    return new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString();
  }

  if (period === "week") {
    return new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7).toISOString();
  }

  if (period === "month") {
    return new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30).toISOString();
  }

  if (period === "year") {
    return new Date(now.getTime() - 1000 * 60 * 60 * 24 * 365).toISOString();
  }

  return null;
}

function getCommunityBoost(followCount) {
  return 1 + Math.min(0.45, 2.4 / Math.sqrt((followCount ?? 0) + 1));
}

function scorePost(post, { communityBoost = 1, period = "all" } = {}) {
  const postAgeHours = Math.max(
    1,
    (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60),
  );
  const decayBase =
    period === "day"
      ? 18
      : period === "week"
        ? 72
        : period === "month"
          ? 240
          : period === "year"
            ? 720
            : 1200;
  const decayFloor = period === "all" ? 0.5 : 0.2;
  const decay = Math.max(decayFloor, decayBase / (postAgeHours + decayBase));
  const counts = post.reactionCounts ?? {};

  if (post.reactionMode === "utility") {
    return (
      (((counts.helpful ?? 0) * 4 - (counts.not_helpful ?? 0) * 0.75 + post.comments * 1.2) *
        decay *
        communityBoost)
    );
  }

  if (post.reactionMode === "appreciation") {
    return (((counts.respect ?? 0) * 3.5 + post.comments * 1.4) * decay * communityBoost);
  }

  return (
    ((counts.like ?? 0) * 2 - (counts.dislike ?? 0) * 0.4 + post.comments) *
    decay *
    communityBoost
  );
}

async function loadFollowCountsByGameIds(gameIds) {
  const uniqueGameIds = [...new Set(gameIds.filter(Boolean))];

  if (uniqueGameIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("follows")
    .select("igdb_game_id")
    .in("igdb_game_id", uniqueGameIds);

  if (error) {
    throw error;
  }

  const countsByGameId = new Map();

  for (const row of data ?? []) {
    countsByGameId.set(row.igdb_game_id, (countsByGameId.get(row.igdb_game_id) ?? 0) + 1);
  }

  return countsByGameId;
}

async function loadRankedPosts({ query, userId, period = "all", limit = 60 }) {
  const startDate = getPeriodStart(period);
  const baseQuery = startDate ? query.gte("created_at", startDate) : query;
  const posts = await loadPostsWithReactions(baseQuery.limit(limit), userId);
  const followCountsByGameId = await loadFollowCountsByGameIds(posts.map((post) => post.gameId));

  return [...posts]
    .map((post) => ({
      ...post,
      followCount: followCountsByGameId.get(post.gameId) ?? 0,
      rankingScore: scorePost(post, {
        communityBoost: getCommunityBoost(followCountsByGameId.get(post.gameId) ?? 0),
        period,
      }),
    }))
    .sort((left, right) => right.rankingScore - left.rankingScore);
}

export function useFeedPosts(followedGameIds) {
  const { session } = useAuth();
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadPosts = useCallback(async () => {
    if (!followedGameIds.length) {
      setPosts([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const nextPosts = await loadPostsWithReactions(
        supabase
          .from("posts")
          .select(
            "id, user_id, igdb_game_id, game_title, game_cover_url, type, title, body, reaction_mode, rating, comments_count, moderation_state, moderation_labels, created_at, spoiler, spoiler_tag, profiles(username, display_name)"
              .replace("profiles(username, display_name)", "image_url, video_provider, video_upload_id, video_upload_token, video_asset_id, video_playback_id, video_status, video_thumbnail_url, video_duration_seconds, profiles(username, display_name, selected_title_key, selected_name_color)")
          )
          .in("igdb_game_id", followedGameIds)
          .neq("moderation_state", "hidden")
          .order("created_at", { ascending: false })
          .limit(30),
        session?.user?.id,
      );

      setPosts(nextPosts);
      setError(null);
    } catch (nextError) {
      setPosts([]);
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, [followedGameIds, session?.user?.id]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  return {
    posts,
    isLoading,
    error,
    reload: loadPosts,
  };
}

export function useGamePosts(gameId) {
  const { session } = useAuth();
  const numericGameId = Number(gameId);
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadPosts = useCallback(async () => {
    if (!numericGameId || Number.isNaN(numericGameId)) {
      setPosts([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const nextPosts = await loadPostsWithReactions(
        supabase
          .from("posts")
          .select(
            "id, user_id, igdb_game_id, game_title, game_cover_url, type, title, body, reaction_mode, rating, comments_count, moderation_state, moderation_labels, created_at, spoiler, spoiler_tag, profiles(username, display_name)"
              .replace("profiles(username, display_name)", "image_url, video_provider, video_upload_id, video_upload_token, video_asset_id, video_playback_id, video_status, video_thumbnail_url, video_duration_seconds, profiles(username, display_name, selected_title_key, selected_name_color)")
          )
          .eq("igdb_game_id", numericGameId)
          .neq("moderation_state", "hidden")
          .order("created_at", { ascending: false })
          .limit(30),
        session?.user?.id,
      );

      setPosts(nextPosts);
      setError(null);
    } catch (nextError) {
      setPosts([]);
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, [numericGameId, session?.user?.id]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  return {
    posts,
    isLoading,
    error,
    reload: loadPosts,
  };
}

export function usePopularPosts(period = "day") {
  const { session } = useAuth();
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadPosts = useCallback(async () => {
    try {
      setIsLoading(true);
      const nextPosts = await loadRankedPosts({
        query:
          supabase
            .from("posts")
            .select(
              "id, user_id, igdb_game_id, game_title, game_cover_url, type, title, body, reaction_mode, rating, comments_count, moderation_state, moderation_labels, created_at, spoiler, spoiler_tag, profiles(username, display_name)"
                .replace("profiles(username, display_name)", "image_url, video_provider, video_upload_id, video_upload_token, video_asset_id, video_playback_id, video_status, video_thumbnail_url, video_duration_seconds, profiles(username, display_name, selected_title_key, selected_name_color)")
            )
            .neq("moderation_state", "hidden")
            .order("created_at", { ascending: false }),
        period,
        limit: 120,
        userId: session?.user?.id,
      });

      setPosts(nextPosts);
      setError(null);
    } catch (nextError) {
      setPosts([]);
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, [period, session?.user?.id]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  return {
    posts,
    isLoading,
    error,
    reload: loadPosts,
  };
}

export async function createPost({
  userId,
  gameId,
  gameTitle,
  gameCoverUrl,
  type,
  title,
  body,
  rating,
  spoiler,
  spoilerTag,
  imageAsset = null,
  clipAsset = null,
}) {
  let uploadedImagePath = null;

  try {
    let imageUrl = null;
    let videoUploadId = null;
    let videoUploadToken = null;

    if (imageAsset) {
      const upload = await uploadPostImage({
        userId,
        asset: imageAsset,
      });

      uploadedImagePath = upload.path;
      imageUrl = upload.publicUrl;
    }

    if (clipAsset) {
      const clipUpload = await uploadMuxClip(clipAsset);
      videoUploadId = clipUpload.uploadId;
      videoUploadToken = clipUpload.uploadToken;
    }

    const data = await invokeEdgeFunction("trusted-post", {
      gameId,
      gameTitle,
      gameCoverUrl,
      type,
      title,
      body,
      rating,
      spoiler,
      spoilerTag,
      imageUrl,
      videoUploadId,
      videoUploadToken,
    });

    return {
      data: data?.postId ? { id: data.postId } : null,
      error: null,
      moderation: data?.moderation ?? null,
    };
  } catch (error) {
    await removePostImage(uploadedImagePath);

    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Could not create post.",
      },
    };
  }
}

export async function togglePostReaction({ userId, postId, reactionType }) {
  const data = await invokeEdgeFunction("trusted-post-reaction", {
    userId,
    postId,
    reactionType,
  });

  return data?.viewerReaction ?? null;
}

export function usePostComments(postId, isEnabled = true) {
  const { session } = useAuth();
  const [comments, setComments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadComments = useCallback(async () => {
    if (!isEnabled || !postId) {
      setComments([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error: commentsError } = await supabase
        .from("post_comments")
        .select(
          "id, post_id, user_id, body, moderation_state, moderation_labels, created_at, profiles(username, display_name)"
            .replace("profiles(username, display_name)", "profiles(username, display_name, selected_title_key, selected_name_color)")
        )
        .eq("post_id", postId)
        .neq("moderation_state", "hidden")
        .order("created_at", { ascending: true });

      if (commentsError) {
        throw commentsError;
      }

      const normalizedComments = (data ?? []).map((comment) =>
        normalizeComment(comment, session?.user?.id)
      );
      const commentsWithReactions = await loadCommentReactionState(
        normalizedComments,
        session?.user?.id
      );
      setComments(commentsWithReactions);
      setError(null);
    } catch (nextError) {
      setComments([]);
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, [isEnabled, postId, session?.user?.id]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  return {
    comments,
    isLoading,
    error,
    reload: loadComments,
  };
}

export async function createPostComment({ userId, postId, body }) {
  try {
    const data = await invokeEdgeFunction("trusted-comment", {
      userId,
      postId,
      body,
    });

    return {
      data: data?.commentId ? { id: data.commentId } : null,
      error: null,
      moderation: data?.moderation ?? null,
    };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Could not create comment.",
      },
    };
  }
}

export async function deletePostComment({ commentId, userId }) {
  void userId;
  await invokeEdgeFunction("trusted-comment", {
    action: "delete",
    commentId,
  });
}

export async function toggleCommentReaction({ userId, commentId, reactionType = "like" }) {
  const data = await invokeEdgeFunction("trusted-comment-reaction", {
    userId,
    commentId,
    reactionType,
  });

  return data?.viewerReaction ?? null;
}
