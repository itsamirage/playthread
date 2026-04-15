export function isReleasedGameForDisplay(game, now = Date.now()) {
  const releaseDate = Number(game?.releaseDate);

  if (!releaseDate || Number.isNaN(releaseDate)) {
    return false;
  }

  const releaseTimestamp = releaseDate > 10_000_000_000 ? releaseDate : releaseDate * 1000;
  return releaseTimestamp <= now;
}

export function getGameScoreBadge(game, now = Date.now()) {
  const numericScore = Number(game?.metacritic);
  const hasScore = Number.isFinite(numericScore) && numericScore > 0;

  if (hasScore) {
    return {
      kind: "score",
      label: String(Math.round(numericScore)),
    };
  }

  if (!isReleasedGameForDisplay(game, now)) {
    return {
      kind: "upcoming",
      label:
        game?.releaseYear && game.releaseYear !== "TBA"
          ? String(game.releaseYear)
          : "TBA",
    };
  }

  return null;
}
