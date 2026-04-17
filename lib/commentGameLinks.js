const GAME_LINK_TOKEN_REGEX = /\{\{game-link:(-?\d+)\|([^}]+)\}\}/g;

export function extractCommentGameLink(body = "") {
  const match = GAME_LINK_TOKEN_REGEX.exec(String(body ?? ""));
  GAME_LINK_TOKEN_REGEX.lastIndex = 0;

  if (!match) {
    return null;
  }

  return {
    gameId: Number(match[1]),
    title: match[2],
  };
}

export function stripCommentGameLinkTokens(body = "") {
  return String(body ?? "").replaceAll(GAME_LINK_TOKEN_REGEX, "").replace(/\s+/g, " ").trim();
}

export function injectCommentGameLink(body = "", link) {
  if (!link?.gameId || !link?.title) {
    return stripCommentGameLinkTokens(body);
  }

  return `${stripCommentGameLinkTokens(body)} {{game-link:${Number(link.gameId)}|${String(link.title).trim()}}}`.trim();
}

export function buildCommentTextSegments(body = "") {
  const visibleBody = stripCommentGameLinkTokens(body);
  const link = extractCommentGameLink(body);

  if (!link || !visibleBody) {
    return [{ text: visibleBody, gameId: null }];
  }

  const titleIndex = visibleBody.toLowerCase().indexOf(link.title.toLowerCase());
  if (titleIndex < 0) {
    return [{ text: visibleBody, gameId: null }];
  }

  const before = visibleBody.slice(0, titleIndex);
  const linkedText = visibleBody.slice(titleIndex, titleIndex + link.title.length);
  const after = visibleBody.slice(titleIndex + link.title.length);

  return [
    before ? { text: before, gameId: null } : null,
    { text: linkedText, gameId: link.gameId },
    after ? { text: after, gameId: null } : null,
  ].filter(Boolean);
}
