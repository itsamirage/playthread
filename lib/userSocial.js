import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "./auth";
import { invokeEdgeFunction } from "./functions";
import { supabase } from "./supabase";

function useRealtimeReload({ enabled, tables, reload }) {
  const channelIdRef = useRef(`social:${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const channel = supabase.channel(`${channelIdRef.current}:${tables.join(",")}`);

    tables.forEach((table) => {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
        },
        () => {
          reload();
        },
      );
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, reload, tables]);
}

function normalizeProfileRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username || "player",
    avatarUrl: row.avatar_url ?? null,
    bio: row.bio ?? "",
    createdAt: row.created_at,
    selectedNameColor: row.selected_name_color ?? "default",
    selectedTitleKey: row.selected_title_key ?? "none",
  };
}

export function usePublicProfile(userId) {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error: nextError } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, avatar_url, bio, created_at, selected_name_color, selected_title_key"
        )
        .eq("id", userId)
        .maybeSingle();

      if (nextError) {
        throw nextError;
      }

      setProfile(normalizeProfileRow(data));
      setError(null);
    } catch (nextError) {
      setProfile(null);
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  return {
    profile,
    isLoading,
    error,
    reload: loadProfile,
  };
}

export function useUserFollows(targetUserId = null) {
  const { session } = useAuth();
  const [friendUserIds, setFriendUserIds] = useState([]);
  const [incomingRequestUserIds, setIncomingRequestUserIds] = useState([]);
  const [outgoingRequestUserIds, setOutgoingRequestUserIds] = useState([]);
  const [incomingRequestProfiles, setIncomingRequestProfiles] = useState([]);
  const [outgoingRequestProfiles, setOutgoingRequestProfiles] = useState([]);
  const [friendCount, setFriendCount] = useState(0);
  const [friends, setFriends] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadFollows = useCallback(async () => {
    try {
      setIsLoading(true);
      const [mineResult, targetFriendshipsResult] = await Promise.all([
        session?.user?.id
          ? supabase
              .from("user_friendships")
              .select("requester_user_id, addressee_user_id, status")
              .or(`requester_user_id.eq.${session.user.id},addressee_user_id.eq.${session.user.id}`)
          : Promise.resolve({ data: [], error: null }),
        targetUserId
          ? supabase
              .from("user_friendships")
              .select("requester_user_id, addressee_user_id, status, created_at")
              .or(`requester_user_id.eq.${targetUserId},addressee_user_id.eq.${targetUserId}`)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (mineResult.error) {
        throw mineResult.error;
      }

      if (targetFriendshipsResult.error) {
        throw targetFriendshipsResult.error;
      }

      const viewerRows = mineResult.data ?? [];
      const acceptedFriendUserIds = [];
      const incomingIds = [];
      const outgoingIds = [];

      viewerRows.forEach((row) => {
        const otherUserId =
          row.requester_user_id === session?.user?.id ? row.addressee_user_id : row.requester_user_id;

        if (!otherUserId) {
          return;
        }

        if (row.status === "accepted") {
          acceptedFriendUserIds.push(otherUserId);
        } else if (row.requester_user_id === session?.user?.id) {
          outgoingIds.push(otherUserId);
        } else {
          incomingIds.push(otherUserId);
        }
      });

      setFriendUserIds(acceptedFriendUserIds);
      setIncomingRequestUserIds(incomingIds);
      setOutgoingRequestUserIds(outgoingIds);

      // Fetch profiles for pending requests so UI can show usernames
      const pendingIds = [...new Set([...incomingIds, ...outgoingIds])];
      if (pendingIds.length > 0) {
        const { data: pendingProfiles } = await supabase
          .from("profiles")
          .select("id, username, display_name, selected_name_color")
          .in("id", pendingIds);
        const pendingMap = new Map((pendingProfiles ?? []).map((row) => [row.id, normalizeProfileRow(row)]));
        setIncomingRequestProfiles(incomingIds.map((id) => pendingMap.get(id)).filter(Boolean));
        setOutgoingRequestProfiles(outgoingIds.map((id) => pendingMap.get(id)).filter(Boolean));
      } else {
        setIncomingRequestProfiles([]);
        setOutgoingRequestProfiles([]);
      }

      const targetRows = targetFriendshipsResult.data ?? [];
      const targetFriendIds = targetRows
        .filter((row) => row.status === "accepted")
        .map((row) => (row.requester_user_id === targetUserId ? row.addressee_user_id : row.requester_user_id))
        .filter(Boolean);

      const uniqueTargetFriendIds = [...new Set(targetFriendIds)];
      setFriendCount(uniqueTargetFriendIds.length);

      if (uniqueTargetFriendIds.length > 0) {
        const { data: friendProfiles, error: friendProfilesError } = await supabase
          .from("profiles")
          .select(
            "id, username, display_name, avatar_url, bio, created_at, selected_name_color, selected_title_key",
          )
          .in("id", uniqueTargetFriendIds);

        if (friendProfilesError) {
          throw friendProfilesError;
        }

        const profileMap = new Map((friendProfiles ?? []).map((row) => [row.id, normalizeProfileRow(row)]));
        setFriends(uniqueTargetFriendIds.map((friendId) => profileMap.get(friendId)).filter(Boolean));
      } else {
        setFriends([]);
      }
    } catch {
      setFriendUserIds([]);
      setIncomingRequestUserIds([]);
      setOutgoingRequestUserIds([]);
      setIncomingRequestProfiles([]);
      setOutgoingRequestProfiles([]);
      setFriendCount(0);
      setFriends([]);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id, targetUserId]);

  useEffect(() => {
    loadFollows();
  }, [loadFollows]);

  useRealtimeReload({
    enabled: Boolean(session?.user?.id || targetUserId),
    tables: ["user_friendships"],
    reload: loadFollows,
  });

  const getFriendshipStatus = useCallback(
    (userId) => {
      if (friendUserIds.includes(userId)) {
        return "friends";
      }
      if (incomingRequestUserIds.includes(userId)) {
        return "incoming";
      }
      if (outgoingRequestUserIds.includes(userId)) {
        return "outgoing";
      }
      return "none";
    },
    [friendUserIds, incomingRequestUserIds, outgoingRequestUserIds],
  );

  return {
    friendUserIds,
    incomingRequestUserIds,
    outgoingRequestUserIds,
    incomingRequestProfiles,
    outgoingRequestProfiles,
    friendCount,
    friends,
    getFriendshipStatus,
    isLoading,
    reload: loadFollows,
  };
}

export async function requestFriend({ targetUserId }) {
  return invokeEdgeFunction("trusted-follow", {
    action: "request",
    targetUserId,
  });
}

export async function acceptFriendRequest({ targetUserId }) {
  return invokeEdgeFunction("trusted-follow", {
    action: "accept",
    targetUserId,
  });
}

export async function declineFriendRequest({ targetUserId }) {
  return invokeEdgeFunction("trusted-follow", {
    action: "decline",
    targetUserId,
  });
}

export async function cancelFriendRequest({ targetUserId }) {
  return invokeEdgeFunction("trusted-follow", {
    action: "cancel",
    targetUserId,
  });
}

export async function removeFriend({ targetUserId }) {
  return invokeEdgeFunction("trusted-follow", {
    action: "remove",
    targetUserId,
  });
}

const ACTIVITY_SELECT =
  "id, user_id, igdb_game_id, game_title, game_cover_url, type, title, body, reaction_mode, rating, comments_count, moderation_state, moderation_labels, created_at, updated_at, spoiler, spoiler_tag, image_url, image_urls, pinned_until, video_provider, video_upload_id, video_upload_token, video_asset_id, video_playback_id, video_status, video_thumbnail_url, video_duration_seconds, profiles(username, display_name, selected_title_key, selected_name_color, developer_game_ids)";

export function useUserActivity(userId, { limit = 20 } = {}) {
  const { session } = useAuth();
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const offsetRef = useRef(0);

  const loadActivity = useCallback(async () => {
    if (!userId) {
      setPosts([]);
      setError(null);
      setIsLoading(false);
      setHasMore(false);
      return;
    }

    try {
      setIsLoading(true);
      offsetRef.current = 0;
      const { data, error: nextError } = await supabase
        .from("posts")
        .select(ACTIVITY_SELECT)
        .eq("user_id", userId)
        .neq("moderation_state", "hidden")
        .order("created_at", { ascending: false })
        .range(0, limit - 1);

      if (nextError) {
        throw nextError;
      }

      const module = await import("./posts.js");
      const normalized = (data ?? []).map(module.normalizePostForExternal ?? ((row) => row));
      const withReactions = await module.loadExternalPostsWithReactions(normalized, session?.user?.id);
      setPosts(withReactions);
      setHasMore((data ?? []).length === limit);
      offsetRef.current = (data ?? []).length;
      setError(null);
    } catch (nextError) {
      setPosts([]);
      setError(nextError);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [limit, session?.user?.id, userId]);

  const loadMore = useCallback(async () => {
    if (!userId) return;

    try {
      setIsLoadingMore(true);
      const currentOffset = offsetRef.current;
      const { data, error: nextError } = await supabase
        .from("posts")
        .select(ACTIVITY_SELECT)
        .eq("user_id", userId)
        .neq("moderation_state", "hidden")
        .order("created_at", { ascending: false })
        .range(currentOffset, currentOffset + limit - 1);

      if (nextError) throw nextError;

      const module = await import("./posts.js");
      const normalized = (data ?? []).map(module.normalizePostForExternal ?? ((row) => row));
      const withReactions = await module.loadExternalPostsWithReactions(normalized, session?.user?.id);
      setPosts((prev) => [...prev, ...withReactions]);
      setHasMore((data ?? []).length === limit);
      offsetRef.current = currentOffset + (data ?? []).length;
    } catch {
      // silently fail — user can retry
    } finally {
      setIsLoadingMore(false);
    }
  }, [limit, session?.user?.id, userId]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  useRealtimeReload({
    enabled: Boolean(userId),
    tables: ["posts", "post_reactions", "post_comments"],
    reload: loadActivity,
  });

  return {
    posts,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    reload: loadActivity,
    loadMore,
  };
}

export function useUserCommentHistory(userId, { limit = 20 } = {}) {
  const [comments, setComments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const offsetRef = useRef(0);

  const loadComments = useCallback(async () => {
    if (!userId) {
      setComments([]);
      setError(null);
      setIsLoading(false);
      setHasMore(false);
      return;
    }

    try {
      setIsLoading(true);
      offsetRef.current = 0;
      const { data, error: nextError } = await supabase
        .from("post_comments")
        .select(
          "id, post_id, user_id, body, image_url, moderation_state, moderation_labels, created_at, updated_at, posts(id, title, igdb_game_id, game_title), profiles(username, display_name, selected_title_key, selected_name_color)",
        )
        .eq("user_id", userId)
        .neq("moderation_state", "hidden")
        .order("created_at", { ascending: false })
        .range(0, limit - 1);

      if (nextError) {
        throw nextError;
      }

      const module = await import("./posts.js");
      const normalized = (data ?? []).map((comment) => {
        const normalizedComment = module.normalizeCommentForExternal?.(comment) ?? {
          id: comment.id,
          postId: comment.post_id,
          userId: comment.user_id,
          body: comment.body,
          imageUrl: comment.image_url ?? null,
          createdAt: comment.created_at,
          updatedAt: comment.updated_at ?? comment.created_at,
          moderationState: comment.moderation_state ?? "clean",
          moderationLabels: comment.moderation_labels ?? [],
          author:
            comment.profiles?.display_name ||
            comment.profiles?.username ||
            "player",
          authorNameColor: comment.profiles?.selected_name_color ?? "default",
          authorTitleKey: comment.profiles?.selected_title_key ?? "none",
        };

        return {
          ...normalizedComment,
          postTitle: comment.posts?.title ?? "Post",
          gameId: comment.posts?.igdb_game_id ?? null,
          gameTitle: comment.posts?.game_title ?? "",
        };
      });

      setComments(normalized);
      setHasMore((data ?? []).length === limit);
      offsetRef.current = (data ?? []).length;
      setError(null);
    } catch (nextError) {
      setComments([]);
      setHasMore(false);
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, [limit, userId]);

  const loadMore = useCallback(async () => {
    if (!userId) {
      return;
    }

    try {
      setIsLoadingMore(true);
      const currentOffset = offsetRef.current;
      const { data, error: nextError } = await supabase
        .from("post_comments")
        .select(
          "id, post_id, user_id, body, image_url, moderation_state, moderation_labels, created_at, updated_at, posts(id, title, igdb_game_id, game_title), profiles(username, display_name, selected_title_key, selected_name_color)",
        )
        .eq("user_id", userId)
        .neq("moderation_state", "hidden")
        .order("created_at", { ascending: false })
        .range(currentOffset, currentOffset + limit - 1);

      if (nextError) {
        throw nextError;
      }

      const nextComments = (data ?? []).map((comment) => ({
        id: comment.id,
        postId: comment.post_id,
        userId: comment.user_id,
        body: comment.body,
        imageUrl: comment.image_url ?? null,
        createdAt: comment.created_at,
        updatedAt: comment.updated_at ?? comment.created_at,
        moderationState: comment.moderation_state ?? "clean",
        moderationLabels: comment.moderation_labels ?? [],
        author:
          comment.profiles?.display_name ||
          comment.profiles?.username ||
          "player",
        authorNameColor: comment.profiles?.selected_name_color ?? "default",
        authorTitleKey: comment.profiles?.selected_title_key ?? "none",
        postTitle: comment.posts?.title ?? "Post",
        gameId: comment.posts?.igdb_game_id ?? null,
        gameTitle: comment.posts?.game_title ?? "",
      }));

      setComments((currentComments) => [...currentComments, ...nextComments]);
      setHasMore((data ?? []).length === limit);
      offsetRef.current = currentOffset + (data ?? []).length;
    } catch {
      // Allow retry from the UI.
    } finally {
      setIsLoadingMore(false);
    }
  }, [limit, userId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  useRealtimeReload({
    enabled: Boolean(userId),
    tables: ["post_comments"],
    reload: loadComments,
  });

  return {
    comments,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    reload: loadComments,
    loadMore,
  };
}

export function useMyReviewCount(userId) {
  const [reviewCount, setReviewCount] = useState(0);
  const [avgRating, setAvgRating] = useState(null);

  const loadReviews = useCallback(async () => {
    if (!userId) {
      setReviewCount(0);
      setAvgRating(null);
      return;
    }

    try {
      // Count game ratings — any game rated counts as a review
      const { data, error } = await supabase
        .from("game_ratings")
        .select("rating")
        .eq("user_id", userId);

      if (error) {
        throw error;
      }

      const rows = data ?? [];
      setReviewCount(rows.length);

      if (rows.length > 0) {
        // Stored ratings are halved (÷2) — multiply by 2 to get back to 1-10 scale
        const avg = rows.reduce((sum, row) => sum + Number(row.rating) * 2, 0) / rows.length;
        // Round to nearest 0.5
        setAvgRating(Math.round(avg * 2) / 2);
      } else {
        setAvgRating(null);
      }
    } catch {
      setReviewCount(0);
      setAvgRating(null);
    }
  }, [userId]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  useRealtimeReload({
    enabled: Boolean(userId),
    tables: ["game_ratings"],
    reload: loadReviews,
  });

  return { reviewCount, avgRating, reload: loadReviews };
}

export function useMyReviewsByGame(userId) {
  const [reviewsByGameId, setReviewsByGameId] = useState(new Map());

  const load = useCallback(async () => {
    if (!userId) {
      setReviewsByGameId(new Map());
      return;
    }
    try {
      const { data } = await supabase
        .from("game_ratings")
        .select("igdb_game_id, rating")
        .eq("user_id", userId);

      const map = new Map();
      for (const row of data ?? []) {
        if (row.igdb_game_id && row.rating != null) {
          // Stored as halved value — multiply by 2 for 1-10 display scale
          // Use String key so it matches game.id from followed-game objects
          map.set(String(row.igdb_game_id), Math.round(Number(row.rating) * 4) / 2);
        }
      }
      setReviewsByGameId(map);
    } catch {
      setReviewsByGameId(new Map());
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeReload({ enabled: Boolean(userId), tables: ["game_ratings"], reload: load });

  return { reviewsByGameId };
}

export function useUserReviews(userId) {
  const [reviews, setReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setReviews([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data } = await supabase
        .from("game_ratings")
        .select("igdb_game_id, rating, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      const gameIds = [...new Set((data ?? []).map((row) => Number(row.igdb_game_id)).filter(Boolean))];
      const coverModule = await import("./igdb.js");
      const covers = gameIds.length > 0 ? await coverModule.fetchGameCovers(gameIds) : [];
      const coverMap = new Map((covers ?? []).map((game) => [Number(game.id), game]));

      setReviews(
        (data ?? []).map((row) => {
          const gameId = Number(row.igdb_game_id);
          const cover = coverMap.get(gameId);

          return {
            gameId,
            rating: Math.round(Number(row.rating) * 4) / 2,
            createdAt: row.created_at,
            title: cover?.title ?? `Game ${gameId}`,
            coverUrl: cover?.coverUrl ?? null,
          };
        }),
      );
    } catch {
      setReviews([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeReload({
    enabled: Boolean(userId),
    tables: ["game_ratings"],
    reload: load,
  });

  return {
    reviews,
    isLoading,
    reload: load,
  };
}

export function usePublicReviewCount(userId) {
  const [reviewCount, setReviewCount] = useState(0);
  const [avgRating, setAvgRating] = useState(null);

  const load = useCallback(async () => {
    if (!userId) {
      setReviewCount(0);
      setAvgRating(null);
      return;
    }
    try {
      const { data } = await supabase
        .from("game_ratings")
        .select("rating")
        .eq("user_id", userId);

      const rows = data ?? [];
      setReviewCount(rows.length);

      if (rows.length > 0) {
        const avg = rows.reduce((sum, row) => sum + Number(row.rating) * 2, 0) / rows.length;
        setAvgRating(Math.round(avg * 2) / 2);
      } else {
        setAvgRating(null);
      }
    } catch {
      setReviewCount(0);
      setAvgRating(null);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { reviewCount, avgRating };
}

export function useCreatorSearch(query, { limit = 8 } = {}) {
  const normalizedQuery = String(query ?? "").trim();
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadResults = async () => {
      if (normalizedQuery.length < 2) {
        setResults([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, bio, created_at, selected_name_color, selected_title_key")
          .or(`username.ilike.%${normalizedQuery}%,display_name.ilike.%${normalizedQuery}%`)
          .limit(limit);

        if (error) {
          throw error;
        }

        if (isMounted) {
          setResults((data ?? []).map(normalizeProfileRow));
        }
      } catch {
        if (isMounted) {
          setResults([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadResults();

    return () => {
      isMounted = false;
    };
  }, [limit, normalizedQuery]);

  return {
    results,
    isLoading,
  };
}
