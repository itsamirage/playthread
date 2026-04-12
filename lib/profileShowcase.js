import { useEffect, useMemo, useState } from "react";

import { useAuth } from "./auth";
import { supabase } from "./supabase";

function isMissingShowcaseTable(error) {
  return (
    error?.code === "42P01" || error?.message?.toLowerCase().includes("profile_showcase_items")
  );
}

function normalizeShowcaseItem(row) {
  return {
    id: row.id,
    kind: row.kind,
    provider: row.provider,
    providerGameId: row.provider_game_id,
    providerAchievementId: row.provider_achievement_id,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.image_url,
    position: row.position,
    metadata: row.metadata_json ?? {},
  };
}

function isMissingSteamSyncTable(error) {
  const message = error?.message?.toLowerCase?.() ?? "";

  return (
    error?.code === "42P01" ||
    message.includes("user_game_stats") ||
    message.includes("user_achievements")
  );
}

function normalizeSteamGame(row) {
  return {
    id: `game:${row.provider_game_id}`,
    kind: "game",
    provider: row.provider,
    providerGameId: row.provider_game_id,
    providerAchievementId: null,
    title: row.metadata_json?.title ?? `Steam App ${row.provider_game_id}`,
    subtitle:
      typeof row.metadata_json?.playtime_hours === "number"
        ? `${row.metadata_json.playtime_hours.toFixed(2)} hours played`
        : "Synced from Steam library",
    imageUrl: null,
    completionPercent: row.completion_percent,
    completedAchievementCount: row.completed_achievement_count ?? 0,
    totalAchievementCount: row.total_achievement_count ?? 0,
    playtimeHours:
      typeof row.metadata_json?.playtime_hours === "number"
        ? row.metadata_json.playtime_hours
        : null,
    metadata: row.metadata_json ?? {},
  };
}

function normalizeSteamAchievement(row) {
  return {
    id: `achievement:${row.provider_game_id}:${row.provider_achievement_id}`,
    kind: "achievement",
    provider: row.provider,
    providerGameId: row.provider_game_id,
    providerAchievementId: row.provider_achievement_id,
    title: row.title,
    subtitle:
      typeof row.rarity_percent === "number"
        ? `${row.metadata_json?.game_title ?? "Steam"} | ${row.rarity_percent.toFixed(2)}% unlocked`
        : row.metadata_json?.game_title ?? "Steam achievement",
    imageUrl: row.icon_url,
    rarityPercent: row.rarity_percent,
    unlockedAt: row.unlocked_at,
    metadata: row.metadata_json ?? {},
  };
}

function buildMasteryItem(game) {
  return {
    id: `mastery:${game.providerGameId}`,
    kind: "game",
    provider: game.provider,
    providerGameId: game.providerGameId,
    providerAchievementId: null,
    title: `${game.title} Mastery`,
    subtitle: "100% achievements completed",
    imageUrl: game.imageUrl ?? null,
    metadata: {
      ...(game.metadata ?? {}),
      display_variant: "mastery",
      source: "manual",
    },
  };
}

export async function saveProfileShowcase(userId, items) {
  if (!userId) {
    throw new Error("You need to sign in before editing your showcase.");
  }

  const sanitizedItems = items.slice(0, 3).map((item, index) => ({
    user_id: userId,
    kind: item.kind,
    provider: item.provider,
    provider_game_id: item.providerGameId ?? null,
    provider_achievement_id: item.providerAchievementId ?? null,
    title: item.title,
    subtitle: item.subtitle ?? null,
    image_url: item.imageUrl ?? null,
    position: index,
    metadata_json: {
      ...(item.metadata ?? {}),
      source: "manual",
      pinned_by_user: true,
    },
  }));

  const { error: deleteError } = await supabase
    .from("profile_showcase_items")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    throw deleteError;
  }

  if (sanitizedItems.length === 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from("profile_showcase_items")
    .insert(sanitizedItems);

  if (insertError) {
    throw insertError;
  }
}

export function useProfileShowcase() {
  const { session, isLoading: authLoading } = useAuth();
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const loadShowcase = async () => {
      if (authLoading) {
        return;
      }

      if (!session?.user?.id) {
        setItems([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);

        const { data, error } = await supabase
          .from("profile_showcase_items")
          .select(
            "id, kind, provider, provider_game_id, provider_achievement_id, title, subtitle, image_url, position, metadata_json"
          )
          .eq("user_id", session.user.id)
          .order("position", { ascending: true });

        if (error) {
          if (isMissingShowcaseTable(error)) {
            setItems([]);
            return;
          }

          throw error;
        }

        setItems((data ?? []).map(normalizeShowcaseItem));
      } catch (error) {
        console.warn("Could not load profile showcase:", error?.message ?? error);
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadShowcase();
  }, [authLoading, session?.user?.id, reloadKey]);

  const featuredAchievements = useMemo(
    () => items.filter((item) => item.kind === "achievement"),
    [items]
  );

  const featuredGames = useMemo(() => items.filter((item) => item.kind === "game"), [items]);

  return {
    items,
    featuredAchievements,
    featuredGames,
    isLoading,
    reloadShowcase: () => setReloadKey((currentValue) => currentValue + 1),
  };
}

export function useSteamShowcaseCatalog() {
  const { session, isLoading: authLoading } = useAuth();
  const [games, setGames] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const loadCatalog = async () => {
      if (authLoading) {
        return;
      }

      if (!session?.user?.id) {
        setGames([]);
        setAchievements([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);

        const [gamesResult, achievementsResult] = await Promise.all([
          supabase
            .from("user_game_stats")
            .select(
              "provider, provider_game_id, completion_percent, completed_achievement_count, total_achievement_count, metadata_json",
            )
            .eq("user_id", session.user.id)
            .eq("provider", "steam")
            .order("last_synced_at", { ascending: false }),
          supabase
            .from("user_achievements")
            .select(
              "provider, provider_game_id, provider_achievement_id, title, icon_url, unlocked_at, rarity_percent, metadata_json",
            )
            .eq("user_id", session.user.id)
            .eq("provider", "steam")
            .eq("is_unlocked", true)
            .order("rarity_percent", { ascending: true })
            .order("unlocked_at", { ascending: false }),
        ]);

        if (gamesResult.error) {
          if (isMissingSteamSyncTable(gamesResult.error)) {
            setGames([]);
          } else {
            throw gamesResult.error;
          }
        } else {
          setGames((gamesResult.data ?? []).map(normalizeSteamGame));
        }

        if (achievementsResult.error) {
          if (isMissingSteamSyncTable(achievementsResult.error)) {
            setAchievements([]);
          } else {
            throw achievementsResult.error;
          }
        } else {
          setAchievements((achievementsResult.data ?? []).map(normalizeSteamAchievement));
        }
      } catch (error) {
        console.warn("Could not load Steam showcase catalog:", error?.message ?? error);
        setGames([]);
        setAchievements([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadCatalog();
  }, [authLoading, session?.user?.id, reloadKey]);

  const achievementsByGameId = useMemo(() => {
    const nextMap = new Map();

    achievements.forEach((achievement) => {
      const currentValue = nextMap.get(achievement.providerGameId) ?? [];
      currentValue.push(achievement);
      nextMap.set(achievement.providerGameId, currentValue);
    });

    return nextMap;
  }, [achievements]);

  const gameGroups = useMemo(
    () =>
      games.map((game) => {
        const gameAchievements = [...(achievementsByGameId.get(game.providerGameId) ?? [])].sort(
          (left, right) => {
            const leftRarity =
              typeof left.rarityPercent === "number" ? left.rarityPercent : Number.POSITIVE_INFINITY;
            const rightRarity =
              typeof right.rarityPercent === "number" ? right.rarityPercent : Number.POSITIVE_INFINITY;

            if (leftRarity !== rightRarity) {
              return leftRarity - rightRarity;
            }

            const leftUnlocked = left.unlockedAt ? new Date(left.unlockedAt).getTime() : 0;
            const rightUnlocked = right.unlockedAt ? new Date(right.unlockedAt).getTime() : 0;
            return rightUnlocked - leftUnlocked;
          },
        );

        const hasMastery =
          typeof game.completionPercent === "number" &&
          game.completionPercent >= 100 &&
          game.totalAchievementCount > 0;

        return {
          game,
          achievements: gameAchievements,
          masteryItem: hasMastery ? buildMasteryItem(game) : null,
        };
      }),
    [achievementsByGameId, games],
  );

  return {
    games,
    achievements,
    gameGroups,
    isLoading,
    reloadCatalog: () => setReloadKey((currentValue) => currentValue + 1),
  };
}
