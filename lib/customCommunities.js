import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "./auth";
import { invokeEdgeFunction } from "./functions";
import { supabase } from "./supabase";

function normalizeCommunity(row) {
  return {
    id: row.community_game_id,
    tableId: row.id,
    slug: row.slug,
    title: row.title,
    family: "Custom",
    subtitle: row.subtitle,
    eyebrow: "Community",
    body: row.body,
    creatorUserId: row.creator_user_id,
    creatorName: row.profiles?.display_name ?? row.profiles?.username ?? "player",
    moderationState: row.moderation_state ?? "active",
    allowedPostTypes: ["discussion", "review", "guide", "tip", "screenshot", "clip"],
    isCustom: true,
  };
}

export function useCustomCommunities() {
  const [communities, setCommunities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadCommunities = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error: communitiesError } = await supabase
        .from("custom_communities")
        .select("id, community_game_id, slug, title, subtitle, body, creator_user_id, moderation_state, created_at, updated_at, profiles(username, display_name)")
        .eq("moderation_state", "active")
        .order("created_at", { ascending: false });

      if (communitiesError) {
        throw communitiesError;
      }

      setCommunities((data ?? []).map(normalizeCommunity));
      setError(null);
    } catch (nextError) {
      setCommunities([]);
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCommunities();
  }, [loadCommunities]);

  return useMemo(
    () => ({
      communities,
      isLoading,
      error,
      reload: loadCommunities,
    }),
    [communities, error, isLoading, loadCommunities],
  );
}

export function useCustomCommunityBySlug(slug) {
  const [community, setCommunity] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(slug));
  const [error, setError] = useState(null);

  const loadCommunity = useCallback(async () => {
    const cleanSlug = String(slug ?? "").trim();
    if (!cleanSlug) {
      setCommunity(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error: communityError } = await supabase
        .from("custom_communities")
        .select("id, community_game_id, slug, title, subtitle, body, creator_user_id, moderation_state, created_at, updated_at, profiles(username, display_name)")
        .eq("slug", cleanSlug)
        .eq("moderation_state", "active")
        .maybeSingle();

      if (communityError) {
        throw communityError;
      }

      setCommunity(data ? normalizeCommunity(data) : null);
      setError(null);
    } catch (nextError) {
      setCommunity(null);
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadCommunity();
  }, [loadCommunity]);

  return {
    community,
    isLoading,
    error,
    reload: loadCommunity,
  };
}

export function useCommunityBans(community) {
  const { session } = useAuth();
  const [bans, setBans] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadBans = useCallback(async () => {
    if (!community?.tableId) {
      setBans([]);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("custom_community_bans")
        .select("id, community_id, user_id, reason, created_at, profiles(username, display_name)")
        .eq("community_id", community.tableId)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      setBans(data ?? []);
    } catch {
      setBans([]);
    } finally {
      setIsLoading(false);
    }
  }, [community?.tableId]);

  useEffect(() => {
    loadBans();
  }, [loadBans, session?.user?.id]);

  return {
    bans,
    bannedUserIds: new Set(bans.map((ban) => ban.user_id)),
    isLoading,
    reload: loadBans,
  };
}

export async function createCustomCommunity({ title, subtitle, body }) {
  const data = await invokeEdgeFunction("trusted-community", {
    action: "create",
    title,
    subtitle,
    body,
  });

  return data?.community ? normalizeCommunity(data.community) : null;
}

export async function updateCustomCommunity({ communityId, title, subtitle, body }) {
  const data = await invokeEdgeFunction("trusted-community", {
    action: "update",
    communityId,
    title,
    subtitle,
    body,
  });

  return data?.community ? normalizeCommunity(data.community) : null;
}

export async function hideCustomCommunity({ communityId }) {
  await invokeEdgeFunction("trusted-community", {
    action: "hide",
    communityId,
  });
}

export async function setCustomCommunityBan({ communityId, targetUserId, reason }) {
  await invokeEdgeFunction("trusted-community", {
    action: "ban_user",
    communityId,
    targetUserId,
    reason,
  });
}

export async function removeCustomCommunityBan({ communityId, targetUserId }) {
  await invokeEdgeFunction("trusted-community", {
    action: "unban_user",
    communityId,
    targetUserId,
  });
}
