import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { fetchGameCovers } from "./igdb";
import { useAuth } from "./auth";
import { supabase } from "./supabase";

export const FOLLOW_STATUS_OPTIONS = [
  { key: "have_not_played", label: "Have not Played" },
  { key: "currently_playing", label: "Currently Playing" },
  { key: "taking_a_break", label: "Taking a Break" },
  { key: "completed", label: "Completed" },
];

const DEFAULT_FOLLOW_STATUS = "currently_playing";

const FollowsContext = createContext({
  followedGameIds: [],
  followedGames: [],
  followedCount: 0,
  isLoading: true,
  isFollowingGame: () => false,
  getFollowStatus: () => null,
  shouldShowSpoilersByDefault: () => false,
  setFollowStatus: async () => ({ error: null }),
  unfollowGame: async () => ({ error: null }),
  toggleFollow: async () => ({ error: null }),
});

function normalizeFollowStatus(status) {
  const matchedStatus = FOLLOW_STATUS_OPTIONS.find((option) => option.key === status);
  return matchedStatus?.key ?? DEFAULT_FOLLOW_STATUS;
}

function mapFollowRowToGame(row) {
  return {
    id: row.igdb_game_id,
    title: row.game_title,
    coverUrl: row.game_cover_url,
    followedAt: row.created_at,
    playStatus: normalizeFollowStatus(row.play_status),
  };
}

function sortFollowGames(games) {
  return [...games].sort(
    (firstGame, secondGame) =>
      new Date(secondGame.followedAt).getTime() - new Date(firstGame.followedAt).getTime()
  );
}

function isMissingPlayStatusColumn(error) {
  const message = error?.message ?? "";
  return typeof message === "string" && message.toLowerCase().includes("play_status");
}

export function getFollowStatusLabel(status) {
  return (
    FOLLOW_STATUS_OPTIONS.find((option) => option.key === normalizeFollowStatus(status))?.label ??
    FOLLOW_STATUS_OPTIONS.find((option) => option.key === DEFAULT_FOLLOW_STATUS)?.label
  );
}

export function shouldRevealSpoilersForStatus(status) {
  if (!status) {
    return false;
  }

  return normalizeFollowStatus(status) !== "completed";
}

export function FollowsProvider({ children }) {
  const { session, isLoading: authLoading } = useAuth();
  const [followedGames, setFollowedGames] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadFollows = async () => {
      if (authLoading) {
        return;
      }

      if (!session?.user?.id) {
        setFollowedGames([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);

        let data = null;
        let error = null;

        const nextResponse = await supabase
          .from("follows")
          .select("igdb_game_id, game_title, game_cover_url, play_status, created_at")
          .eq("user_id", session.user.id);

        data = nextResponse.data;
        error = nextResponse.error;

        if (error && isMissingPlayStatusColumn(error)) {
          const fallbackResponse = await supabase
            .from("follows")
            .select("igdb_game_id, game_title, game_cover_url, created_at")
            .eq("user_id", session.user.id);

          data = fallbackResponse.data?.map((row) => ({
            ...row,
            play_status: DEFAULT_FOLLOW_STATUS,
          }));
          error = fallbackResponse.error;
        }

        if (error) {
          console.warn("Could not load follows:", error.message);
          setFollowedGames([]);
          return;
        }

        setFollowedGames(sortFollowGames((data ?? []).map(mapFollowRowToGame)));
      } finally {
        setIsLoading(false);
      }
    };

    loadFollows();
  }, [authLoading, session?.user?.id]);

  useEffect(() => {
    const backfillMissingCovers = async () => {
      if (!session?.user?.id || followedGames.length === 0) {
        return;
      }

      const gamesMissingCovers = followedGames.filter((game) => !game.coverUrl);

      if (gamesMissingCovers.length === 0) {
        return;
      }

      try {
        const coverResults = await fetchGameCovers(gamesMissingCovers.map((game) => game.id));
        const coverMap = new Map(
          coverResults.filter((item) => item.coverUrl).map((item) => [item.id, item.coverUrl])
        );

        if (coverMap.size === 0) {
          return;
        }

        setFollowedGames((currentGames) =>
          currentGames.map((game) => ({
            ...game,
            coverUrl: coverMap.get(game.id) ?? game.coverUrl,
          }))
        );

        await Promise.all(
          [...coverMap.entries()].map(([gameId, coverUrl]) =>
            supabase
              .from("follows")
              .update({ game_cover_url: coverUrl })
              .eq("user_id", session.user.id)
              .eq("igdb_game_id", gameId)
          )
        );
      } catch (error) {
        console.warn("Could not backfill follow covers:", error?.message ?? error);
      }
    };

    backfillMissingCovers();
  }, [followedGames, session?.user?.id]);

  const followedGameIds = useMemo(() => followedGames.map((game) => game.id), [followedGames]);

  const setFollowStatus = async (game, nextStatus) => {
    if (!session?.user?.id) {
      return {
        error: {
          message: "You must be logged in to follow games.",
        },
      };
    }

    const gameId = Number(game?.id ?? game);

    if (!gameId || Number.isNaN(gameId)) {
      return {
        error: {
          message: "Game data is missing for this item.",
        },
      };
    }

    const normalizedStatus = normalizeFollowStatus(nextStatus);
    const existingGame = followedGames.find((item) => item.id === gameId);

    if (existingGame) {
      const { error } = await supabase
        .from("follows")
        .update({ play_status: normalizedStatus })
        .eq("user_id", session.user.id)
        .eq("igdb_game_id", gameId);

      if (error) {
        return { error };
      }

      setFollowedGames((currentGames) =>
        currentGames.map((item) =>
          item.id === gameId
            ? {
                ...item,
                playStatus: normalizedStatus,
              }
            : item
        )
      );

      return { error: null };
    }

    const followedAt = new Date().toISOString();
    const { error } = await supabase.from("follows").insert({
      user_id: session.user.id,
      igdb_game_id: gameId,
      game_title: game?.title ?? `Game ${gameId}`,
      game_cover_url: game?.coverUrl ?? null,
      play_status: normalizedStatus,
    });

    if (error) {
      return { error };
    }

    setFollowedGames((currentGames) =>
      sortFollowGames([
        {
          id: gameId,
          title: game?.title ?? `Game ${gameId}`,
          coverUrl: game?.coverUrl ?? null,
          followedAt,
          playStatus: normalizedStatus,
        },
        ...currentGames,
      ])
    );

    return { error: null };
  };

  const unfollowGame = async (game) => {
    if (!session?.user?.id) {
      return {
        error: {
          message: "You must be logged in to unfollow games.",
        },
      };
    }

    const gameId = Number(game?.id ?? game);

    if (!gameId || Number.isNaN(gameId)) {
      return {
        error: {
          message: "Game data is missing for this item.",
        },
      };
    }

    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("user_id", session.user.id)
      .eq("igdb_game_id", gameId);

    if (error) {
      return { error };
    }

    setFollowedGames((currentGames) => currentGames.filter((item) => item.id !== gameId));
    return { error: null };
  };

  const toggleFollow = async (game) => {
    if (followedGameIds.includes(Number(game?.id ?? game))) {
      return unfollowGame(game);
    }

    return setFollowStatus(game, DEFAULT_FOLLOW_STATUS);
  };

  const isFollowingGame = (gameId) => followedGameIds.includes(Number(gameId));

  const getFollowStatus = (gameId) =>
    followedGames.find((game) => game.id === Number(gameId))?.playStatus ?? null;

  const shouldShowSpoilersByDefault = (gameId) =>
    shouldRevealSpoilersForStatus(getFollowStatus(gameId));

  return (
    <FollowsContext.Provider
      value={{
        followedGameIds,
        followedGames,
        followedCount: followedGameIds.length,
        isLoading,
        isFollowingGame,
        getFollowStatus,
        shouldShowSpoilersByDefault,
        setFollowStatus,
        unfollowGame,
        toggleFollow,
      }}
    >
      {children}
    </FollowsContext.Provider>
  );
}

export function useFollows() {
  return useContext(FollowsContext);
}
