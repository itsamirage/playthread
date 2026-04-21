import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "./auth";
import { invokeEdgeFunction } from "./functions";
import { normalizeStoredRating } from "./gameRatingMath";
import { supabase } from "./supabase";

export const GAME_RATING_OPTIONS = [
  "1",
  "1.5",
  "2",
  "2.5",
  "3",
  "3.5",
  "4",
  "4.5",
  "5",
  "5.5",
  "6",
  "6.5",
  "7",
  "7.5",
  "8",
  "8.5",
  "9",
  "9.5",
  "10",
];

export function useGameRating(gameId) {
  const numericGameId = Number(gameId);
  const { session } = useAuth();
  const [myRating, setMyRating] = useState(null);
  const [averageRating, setAverageRating] = useState(null);
  const [ratingsCount, setRatingsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadRatings = useCallback(async () => {
    if (!numericGameId || Number.isNaN(numericGameId)) {
      setMyRating(null);
      setAverageRating(null);
      setRatingsCount(0);
      setError(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const [myRatingResult, summaryResult] = await Promise.all([
        session?.user?.id
          ? supabase
              .from("game_ratings")
              .select("rating")
              .eq("user_id", session.user.id)
              .eq("igdb_game_id", numericGameId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("game_rating_summary")
          .select("average_rating, ratings_count")
          .eq("igdb_game_id", numericGameId)
          .maybeSingle(),
      ]);

      if (myRatingResult.error) {
        throw myRatingResult.error;
      }

      if (summaryResult.error) {
        throw summaryResult.error;
      }

      setMyRating(normalizeStoredRating(myRatingResult.data?.rating ?? null));
      setAverageRating(normalizeStoredRating(summaryResult.data?.average_rating ?? null));
      setRatingsCount(summaryResult.data?.ratings_count ?? 0);
      setError(null);
    } catch (nextError) {
      setError(nextError);
      setMyRating(null);
      setAverageRating(null);
      setRatingsCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [numericGameId, session?.user?.id]);

  useEffect(() => {
    loadRatings();
  }, [loadRatings]);

  return useMemo(
    () => ({
      myRating,
      averageRating,
      ratingsCount,
      isLoading,
      error,
      reload: loadRatings,
    }),
    [averageRating, error, isLoading, loadRatings, myRating, ratingsCount],
  );
}

export async function saveGameRating({ gameId, userId, rating }) {
  const numericGameId = Number(gameId);
  const cleanUserId = String(userId ?? "").trim();
  const normalizedRating = Number(rating);

  if (!numericGameId || Number.isNaN(numericGameId)) {
    throw new Error("A valid game is required.");
  }

  if (!cleanUserId) {
    throw new Error("You must be signed in to rate a game.");
  }

  if (!Number.isFinite(normalizedRating) || normalizedRating < 1 || normalizedRating > 10) {
    throw new Error("Choose a rating between 1 and 10.");
  }

  try {
    await invokeEdgeFunction("trusted-user", {
      action: "save_game_rating",
      gameId: numericGameId,
      rating: normalizedRating,
    });
  } catch (error) {
    throw new Error(error.message || "Could not save your rating.");
  }
}
