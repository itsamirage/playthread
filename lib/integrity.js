const INTEGRITY_ERROR_HINTS = [
  {
    match: /same post/i,
    title: "Reaction blocked",
    detail: "Too many accounts on this network are boosting the same post. Wait a while before trying again.",
  },
  {
    match: /same comment/i,
    title: "Reaction blocked",
    detail: "Too many accounts on this network are boosting the same comment. Try again later.",
  },
  {
    match: /same author/i,
    title: "Action blocked",
    detail: "This network is hitting the same author too often. Slow down before sending more reactions or gifts.",
  },
  {
    match: /creating activity/i,
    title: "Cooldown active",
    detail: "This network is generating too much activity right now. Wait a bit, then try again.",
  },
  {
    match: /banned/i,
    title: "Account restricted",
    detail: "This account is currently banned from posting and reactions.",
  },
];

export function describeIntegrityError(error) {
  const message = String(error?.message ?? error ?? "").trim();

  if (!message) {
    return {
      title: "Action failed",
      detail: "Something went wrong. Please try again.",
      shouldHighlightIntegrity: false,
    };
  }

  const hint = INTEGRITY_ERROR_HINTS.find((entry) => entry.match.test(message));

  if (hint) {
    return {
      title: hint.title,
      detail: hint.detail,
      shouldHighlightIntegrity: true,
    };
  }

  return {
    title: "Action failed",
    detail: message,
    shouldHighlightIntegrity: false,
  };
}
