import { useCallback, useEffect, useState } from "react";

import { useAuth } from "./auth";
import { supabase } from "./supabase";

function normalizeResource(row) {
  return {
    id: row.id,
    gameId: Number(row.igdb_game_id),
    gameTitle: row.game_title ?? "",
    userId: row.user_id,
    kind: row.kind ?? "guide",
    title: row.title,
    url: row.url ?? null,
    body: row.body ?? "",
    isPinned: Boolean(row.is_pinned),
    createdAt: row.created_at,
    author: row.profiles?.display_name ?? row.profiles?.username ?? "player",
  };
}

export function useCommunityResources(gameId, gameTitle = "") {
  const { session } = useAuth();
  const [resources, setResources] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadResources = useCallback(async () => {
    const numericGameId = Number(gameId);
    if (!numericGameId) {
      setResources([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error: nextError } = await supabase
        .from("game_community_resources")
        .select("id, igdb_game_id, game_title, user_id, kind, title, url, body, is_pinned, created_at, profiles(username, display_name)")
        .eq("igdb_game_id", numericGameId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(8);

      if (nextError) {
        throw nextError;
      }

      setResources((data ?? []).map(normalizeResource));
      setError(null);
    } catch (nextError) {
      setResources([]);
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  const addResource = useCallback(async ({ kind = "guide", title, url = "", body = "" }) => {
    if (!session?.user?.id) {
      throw new Error("Sign in to add a resource.");
    }

    const cleanTitle = String(title ?? "").trim();
    if (!cleanTitle) {
      throw new Error("Add a resource title.");
    }

    const { error: insertError } = await supabase.from("game_community_resources").insert({
      igdb_game_id: Number(gameId),
      game_title: gameTitle,
      user_id: session.user.id,
      kind,
      title: cleanTitle,
      url: String(url ?? "").trim() || null,
      body: String(body ?? "").trim() || null,
    });

    if (insertError) {
      throw insertError;
    }

    await loadResources();
  }, [gameId, gameTitle, loadResources, session?.user?.id]);

  return {
    resources,
    isLoading,
    error,
    reload: loadResources,
    addResource,
  };
}
