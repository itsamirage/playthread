const HATE_PATTERNS = [
  /\bwhite power\b/i,
  /\bheil hitler\b/i,
  /\bgo back to (your|the) country\b/i,
  /\bsubhuman\b/i,
];

const ABUSE_PATTERNS = [
  /\bkill yourself\b/i,
  /\bgo die\b/i,
  /\byou should die\b/i,
  /\bworthless trash\b/i,
  /\bstupid (idiot|moron)\b/i,
];

const NUDITY_PATTERNS = [
  /\bexplicit nude\b/i,
  /\bgraphic sexual\b/i,
  /\bsex tape\b/i,
  /\bporn\b/i,
  /\bnudes?\b/i,
];

function addLabel(labels, value) {
  if (!labels.includes(value)) {
    labels.push(value);
  }
}

export function evaluateModerationText(text) {
  const normalizedText = String(text ?? "").trim();
  const labels = [];

  if (!normalizedText) {
    return {
      moderationState: "clean",
      labels,
      category: null,
      reason: null,
    };
  }

  if (HATE_PATTERNS.some((pattern) => pattern.test(normalizedText))) {
    addLabel(labels, "hateful speech");
  }

  if (ABUSE_PATTERNS.some((pattern) => pattern.test(normalizedText))) {
    addLabel(labels, "abusive language");
  }

  if (NUDITY_PATTERNS.some((pattern) => pattern.test(normalizedText))) {
    addLabel(labels, "sexual content");
  }

  if (labels.length === 0) {
    return {
      moderationState: "clean",
      labels,
      category: null,
      reason: null,
    };
  }

  const category = labels.includes("hateful speech")
    ? "hate"
    : labels.includes("sexual content")
      ? "nudity"
      : "abuse";

  return {
    moderationState: "warning",
    labels,
    category,
    reason: `Auto-flagged for ${labels.join(", ")}.`,
  };
}

export function formatModerationWarning(labels) {
  if (!labels?.length) {
    return "This content is under review.";
  }

  return `Warning: flagged for ${labels.join(" and ")}.`;
}
