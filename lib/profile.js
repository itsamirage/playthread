import { useCallback, useEffect, useState } from "react";

import { useAuth } from "./auth";
import { invokeEdgeFunction } from "./functions";
import { isGeneratedPlaceholderUsername } from "./profileHelpers.mjs";
import { supabase } from "./supabase";

function getPreferredUsername(session) {
  const metadataUsername = session?.user?.user_metadata?.username;

  if (typeof metadataUsername === "string" && metadataUsername.trim().length > 0) {
    return metadataUsername.trim().toLowerCase();
  }

  return null;
}

export function useCurrentProfile() {
  const { session } = useAuth();
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      if (!session?.user?.id) {
        setProfile(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

        const { data, error } = await supabase
          .from("profiles")
          .select(
            "id, username, display_name, avatar_url, bio, created_at, account_role, moderation_scope, moderation_game_ids, developer_game_ids, is_banned, banned_reason, integrity_exempt, coins_from_posts, coins_from_comments, coins_from_gifts, coins_from_adjustments, coins_spent, selected_name_color, selected_banner_style, selected_title_key, profile_moderation_state, profile_moderation_labels, avatar_moderation_state, avatar_moderation_labels"
          )
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const preferredUsername = getPreferredUsername(session);
      const needsUsernameRepair =
        preferredUsername &&
        data?.username &&
        (
          isGeneratedPlaceholderUsername(data.username) ||
          (
            session.user.email &&
            data.username === session.user.email.split("@")[0].toLowerCase()
          )
        ) &&
        data.username !== preferredUsername;

      let nextProfile = data ?? null;

      if (needsUsernameRepair) {
        const { data: repairedProfile, error: repairError } = await supabase
          .from("profiles")
          .update({
            username: preferredUsername,
            display_name: preferredUsername,
          })
          .eq("id", session.user.id)
          .select(
            "id, username, display_name, avatar_url, bio, created_at, account_role, moderation_scope, moderation_game_ids, developer_game_ids, is_banned, banned_reason, integrity_exempt, coins_from_posts, coins_from_comments, coins_from_gifts, coins_from_adjustments, coins_spent, selected_name_color, selected_banner_style, selected_title_key, profile_moderation_state, profile_moderation_labels, avatar_moderation_state, avatar_moderation_labels"
          )
          .maybeSingle();

        if (!repairError && repairedProfile) {
          nextProfile = repairedProfile;
        }
      }

      setProfile(nextProfile);
    } catch (error) {
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  return {
    profile,
    isLoading,
    reload: loadProfile,
  };
}

export async function saveProfileIdentity({
  displayName,
  bio,
  avatarUrl,
}) {
  const data = await invokeEdgeFunction("trusted-profile", {
    action: "update_identity",
    displayName,
    bio,
    avatarUrl,
  });

  return {
    profile: data?.profile ?? null,
    moderation: data?.moderation ?? null,
  };
}

export async function saveProfileTitle(userId, titleKey) {
  return supabase
    .from("profiles")
    .update({
      selected_title_key: titleKey,
    })
    .eq("id", userId);
}
