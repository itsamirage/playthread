export function sanitizeGameIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}

export function assertCanModerateGameScope(actorProfile, gameId) {
  if ((actorProfile?.account_role ?? "member") !== "moderator") {
    return true;
  }

  const moderationScope = actorProfile?.moderation_scope ?? "all";

  if (moderationScope === "all") {
    return true;
  }

  const allowedGames = new Set(actorProfile?.moderation_game_ids ?? []);

  if (!gameId || !allowedGames.has(gameId)) {
    throw new Error("That content is outside your moderator scope.");
  }

  return true;
}

export function getContentVisibilityUpdate(visibility, contentType) {
  const nextVisibility = String(visibility ?? "").trim();
  const nextContentType = String(contentType ?? "").trim();

  if (!["clean", "hidden"].includes(nextVisibility)) {
    throw new Error("A valid flag id and visibility are required.");
  }

  if (!["post", "comment"].includes(nextContentType)) {
    throw new Error("Only post and comment flags support content visibility changes.");
  }

  const nextFlagStatus = nextVisibility === "hidden" ? "actioned" : "reviewed";
  const actionType = nextVisibility === "hidden" ? "hide_content" : "restore_content";
  const reason =
    nextVisibility === "hidden"
      ? `Flagged ${nextContentType} was hidden from public feeds.`
      : `Flagged ${nextContentType} was restored to public feeds.`;

  return {
    visibility: nextVisibility,
    contentType: nextContentType,
    nextFlagStatus,
    actionType,
    reason,
  };
}

export function clampIntegrityReportDays(value) {
  return Math.min(60, Math.max(1, Math.floor(Number(value ?? 14))));
}

export function normalizeRetentionArgs({
  integrityRetentionDays,
  moderationActionRetentionDays,
} = {}) {
  return {
    integrityRetentionDays: Math.max(30, Math.floor(Number(integrityRetentionDays ?? 90))),
    moderationActionRetentionDays: Math.max(
      90,
      Math.floor(Number(moderationActionRetentionDays ?? 365)),
    ),
  };
}
