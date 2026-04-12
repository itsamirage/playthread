import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "./auth";
import { supabase } from "./supabase";

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
  const [followedUserIds, setFollowedUserIds] = useState([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const loadFollows = useCallback(async () => {
    if (!session?.user?.id) {
      setFollowedUserIds([]);
      setFollowerCount(0);
      setFollowingCount(0);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const [mineResult, followerResult, followingResult] = await Promise.all([
        supabase
          .from("user_follows")
          .select("target_user_id")
          .eq("follower_user_id", session.user.id),
        targetUserId
          ? supabase
              .from("user_follows")
              .select("id", { count: "exact", head: true })
              .eq("target_user_id", targetUserId)
          : Promise.resolve({ count: 0, error: null }),
        targetUserId
          ? supabase
              .from("user_follows")
              .select("id", { count: "exact", head: true })
              .eq("follower_user_id", targetUserId)
          : Promise.resolve({ count: 0, error: null }),
      ]);

      if (mineResult.error) {
        throw mineResult.error;
      }

      if (followerResult.error) {
        throw followerResult.error;
      }

      if (followingResult.error) {
        throw followingResult.error;
      }

      setFollowedUserIds((mineResult.data ?? []).map((row) => row.target_user_id));
      setFollowerCount(followerResult.count ?? 0);
      setFollowingCount(followingResult.count ?? 0);
    } catch {
      setFollowedUserIds([]);
      setFollowerCount(0);
      setFollowingCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id, targetUserId]);

  useEffect(() => {
    loadFollows();
  }, [loadFollows]);

  const isFollowingUser = useCallback(
    (userId) => followedUserIds.includes(userId),
    [followedUserIds],
  );

  return {
    followedUserIds,
    followerCount,
    followingCount,
    isFollowingUser,
    isLoading,
    reload: loadFollows,
  };
}

export async function followUser({ followerUserId, targetUserId }) {
  return supabase.from("user_follows").insert({
    follower_user_id: followerUserId,
    target_user_id: targetUserId,
  });
}

export async function unfollowUser({ followerUserId, targetUserId }) {
  return supabase
    .from("user_follows")
    .delete()
    .eq("follower_user_id", followerUserId)
    .eq("target_user_id", targetUserId);
}

export function useUserActivity(userId, { limit = 20 } = {}) {
  const { session } = useAuth();
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadActivity = useCallback(async () => {
    if (!userId) {
      setPosts([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error: nextError } = await supabase
        .from("posts")
        .select(
          "id, user_id, igdb_game_id, game_title, game_cover_url, type, title, body, reaction_mode, rating, comments_count, moderation_state, moderation_labels, created_at, spoiler, spoiler_tag, image_url, video_provider, video_upload_id, video_upload_token, video_asset_id, video_playback_id, video_status, video_thumbnail_url, video_duration_seconds, profiles(username, display_name, selected_title_key, selected_name_color)"
        )
        .eq("user_id", userId)
        .neq("moderation_state", "hidden")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (nextError) {
        throw nextError;
      }

      const module = await import("./posts.js");
      const normalized = (data ?? []).map(module.normalizePostForExternal ?? ((row) => row));
      const withReactions = await module.loadExternalPostsWithReactions(normalized, session?.user?.id);
      setPosts(withReactions);
      setError(null);
    } catch (nextError) {
      setPosts([]);
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, [limit, session?.user?.id, userId]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  return {
    posts,
    isLoading,
    error,
    reload: loadActivity,
  };
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
