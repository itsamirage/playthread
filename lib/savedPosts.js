import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "./auth";
import { normalizePostForExternal, loadExternalPostsWithReactions } from "./posts";
import { supabase } from "./supabase";

const STORAGE_PREFIX = "playthread:saved-posts";
const listeners = new Set();

function storageKey(userId) {
  return `${STORAGE_PREFIX}:${userId ?? "guest"}`;
}

async function readSavedPostIds(userId) {
  if (userId && userId !== "guest") {
    const { data, error } = await supabase
      .from("saved_posts")
      .select("post_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!error) {
      const remoteIds = (data ?? []).map((row) => String(row.post_id)).filter(Boolean);
      await AsyncStorage.setItem(storageKey(userId), JSON.stringify(remoteIds));
      return remoteIds;
    }
  }

  const rawValue = await AsyncStorage.getItem(storageKey(userId));
  const parsedValue = rawValue ? JSON.parse(rawValue) : [];

  return Array.isArray(parsedValue)
    ? parsedValue.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
}

async function writeSavedPostIds(userId, postIds) {
  const uniquePostIds = [...new Set(postIds.map((value) => String(value ?? "").trim()).filter(Boolean))];
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(uniquePostIds));
  listeners.forEach((listener) => listener(userId, uniquePostIds));
  return uniquePostIds;
}

async function upsertSavedPost({ userId, postId, collection = "General", notifyComments = false, notifyEdits = false }) {
  if (!userId || userId === "guest") {
    return;
  }

  const { error } = await supabase
    .from("saved_posts")
    .upsert({
      user_id: userId,
      post_id: postId,
      collection: String(collection || "General").trim() || "General",
      notify_comments: Boolean(notifyComments),
      notify_edits: Boolean(notifyEdits),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,post_id" });

  if (error && error.code !== "42P01" && error.code !== "42703") {
    throw error;
  }
}

async function deleteSavedPost({ userId, postId }) {
  if (!userId || userId === "guest") {
    return;
  }

  const { error } = await supabase
    .from("saved_posts")
    .delete()
    .eq("user_id", userId)
    .eq("post_id", postId);

  if (error && error.code !== "42P01") {
    throw error;
  }
}

async function updateSavedPostCollectionRow({ userId, postId, collection }) {
  if (!userId || userId === "guest") {
    return;
  }

  const cleanCollection = String(collection || "General").trim() || "General";
  const { error } = await supabase
    .from("saved_posts")
    .update({
      collection: cleanCollection,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("post_id", postId);

  if (error && error.code !== "42P01" && error.code !== "42703") {
    throw error;
  }
}

export function useSavedPostIds() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? "guest";
  const [savedPostIds, setSavedPostIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      setSavedPostIds(await readSavedPostIds(userId));
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const listener = (changedUserId, nextPostIds) => {
      if (changedUserId === userId) {
        setSavedPostIds(nextPostIds);
      }
    };

    listeners.add(listener);
    return () => listeners.delete(listener);
  }, [userId]);

  const toggleSavedPost = useCallback(async (postId, options = {}) => {
    const cleanPostId = String(postId ?? "").trim();
    if (!cleanPostId) {
      return savedPostIds;
    }

    const currentPostIds = await readSavedPostIds(userId);
    const nextPostIds = currentPostIds.includes(cleanPostId)
      ? currentPostIds.filter((currentPostId) => currentPostId !== cleanPostId)
      : [cleanPostId, ...currentPostIds].slice(0, 100);

    setSavedPostIds(nextPostIds);
    await writeSavedPostIds(userId, nextPostIds);

    if (currentPostIds.includes(cleanPostId)) {
      await deleteSavedPost({ userId, postId: cleanPostId }).catch(() => {});
    } else {
      await upsertSavedPost({ userId, postId: cleanPostId, ...options }).catch(() => {});
    }

    return nextPostIds;
  }, [savedPostIds, userId]);

  return {
    savedPostIds,
    isLoading,
    isSavedPost: useCallback((postId) => savedPostIds.includes(String(postId ?? "")), [savedPostIds]),
    reload,
    toggleSavedPost,
  };
}

export function useSavedPosts({ limit = 20 } = {}) {
  const { session } = useAuth();
  const { savedPostIds, isLoading: idsLoading, reload, toggleSavedPost } = useSavedPostIds();
  const [posts, setPosts] = useState([]);
  const [savedRows, setSavedRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadPosts = async () => {
      if (savedPostIds.length === 0) {
        setPosts([]);
        setSavedRows([]);
        setIsLoading(false);
        setError(null);
        return;
      }

      try {
        setIsLoading(true);
        let remoteRows = [];

        if (session?.user?.id) {
          const { data: rows } = await supabase
            .from("saved_posts")
            .select("post_id, collection, note, notify_comments, notify_edits, created_at")
            .eq("user_id", session.user.id)
            .in("post_id", savedPostIds.slice(0, limit));
          remoteRows = rows ?? [];
        }

        const { data, error: nextError } = await supabase
          .from("posts")
          .select("id, user_id, igdb_game_id, game_title, game_cover_url, type, title, body, reaction_mode, rating, comments_count, moderation_state, moderation_labels, created_at, updated_at, spoiler, spoiler_tag, image_url, image_urls, image_captions, pinned_until, video_provider, video_upload_id, video_upload_token, video_asset_id, video_playback_id, video_status, video_thumbnail_url, video_duration_seconds, profiles(username, display_name, selected_title_key, selected_name_color, developer_game_ids)")
          .in("id", savedPostIds.slice(0, limit))
          .neq("moderation_state", "hidden");

        if (nextError) {
          throw nextError;
        }

        const normalizedPosts = (data ?? []).map(normalizePostForExternal);
        const withReactions = await loadExternalPostsWithReactions(normalizedPosts, session?.user?.id);
        const postsById = new Map(withReactions.map((post) => [post.id, post]));
        const orderedPosts = savedPostIds.map((postId) => postsById.get(postId)).filter(Boolean);

        if (isMounted) {
          setPosts(orderedPosts);
          setSavedRows(remoteRows);
          setError(null);
        }
      } catch (nextError) {
        if (isMounted) {
          setPosts([]);
          setError(nextError);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadPosts();

    return () => {
      isMounted = false;
    };
  }, [limit, savedPostIds, session?.user?.id]);

  const updateSavedPostCollection = useCallback(async (postId, collection) => {
    const cleanPostId = String(postId ?? "").trim();
    if (!cleanPostId || !session?.user?.id) {
      return;
    }

    const cleanCollection = String(collection || "General").trim() || "General";
    setSavedRows((currentRows) =>
      currentRows.map((row) =>
        String(row.post_id) === cleanPostId ? { ...row, collection: cleanCollection } : row
      )
    );

    await updateSavedPostCollectionRow({
      userId: session.user.id,
      postId: cleanPostId,
      collection: cleanCollection,
    });
  }, [session?.user?.id]);

  return {
    posts,
    savedRows,
    savedPostIds,
    isLoading: isLoading || idsLoading,
    error,
    reload,
    toggleSavedPost,
    updateSavedPostCollection,
  };
}
