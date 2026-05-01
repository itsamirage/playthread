const MODERATION_REPLACEMENTS = [
  [/[0]/g, "o"],
  [/[1!|]/g, "i"],
  [/[3]/g, "e"],
  [/[4@]/g, "a"],
  [/[5$]/g, "s"],
  [/[7]/g, "t"],
  [/[\u200b-\u200d\ufeff]/g, ""],
];

const HATE_PATTERNS = [
  /\bwhite power\b/i,
  /\bheil hitler\b/i,
  /\bgo back to (your|the) country\b/i,
  /\bsubhuman\b/i,
  /\bethnic cleansing\b/i,
  /\brace war\b/i,
  /\b(hitler|nazi)s?\s+(was|were)\s+right\b/i,
  /\b(all|every)\s+(jews?|muslims?|black people|gay people|trans people|immigrants|mexicans?|asians?|disabled people)\s+(must|should|need to)\s+(die|leave|be removed)\b/i,
  /\b(deport|remove|exterminate|eradicate)\s+(all|every)\s+(jews?|muslims?|black people|gay people|trans people|immigrants|mexicans?|asians?|disabled people)\b/i,
  /\b(monkey|ape)\s+(race|people|trash)\b/i,
  /\b(nigg(?:a|er)s?|fag(?:gots?)?|trann(?:y|ies)|kikes?|spics?|chinks?|gooks?|wetbacks?|beaners?|retards?|ragheads?|sandniggers?|zipperheads?)\b/i,
];

const ABUSE_PATTERNS = [
  /\bkill yourself\b/i,
  /\bkys\b/i,
  /\bgo die\b/i,
  /\byou should die\b/i,
  /\bi hope you die\b/i,
  /\bi hope (someone|they|he|she) (kills|murders|rapes) you\b/i,
  /\bi'?m going to (kill|murder|rape|hurt) you\b/i,
  /\b(i will|i'?ll) (kill|murder|rape|hurt) you\b/i,
  /\b(i will|i'?ll|i am going to|i'?m gonna) (find|track) (you|your) (address|house|home|family)\b/i,
  /\b(i know|found|have) your (address|home|location|ip)\b/i,
  /\b(doxx?|swat) (you|him|her|them)\b/i,
  /\bpost(ing)? your (address|home|location|ip)\b/i,
  /\bworthless trash\b/i,
  /\bstupid (idiot|moron)\b/i,
  /\bdrink bleach\b/i,
  /\bcut yourself\b/i,
  /\bslit your wrists\b/i,
  /\bhang yourself\b/i,
];

const NUDITY_PATTERNS = [
  /\bexplicit nude\b/i,
  /\bgraphic sexual\b/i,
  /\bsexual assault\b/i,
  /\bsex tape\b/i,
  /\bsexually explicit\b/i,
  /\bporn\b/i,
  /\bporno\b/i,
  /\bxxx\b/i,
  /\bnudes?\b/i,
  /\bnaked pics?\b/i,
  /\bonlyfans\b/i,
  /\bnsfw\s+(pics?|vids?|content)\b/i,
  /\bunderage\s+(nude|sex|porn|sexual)\b/i,
  /\bchild\s+(porn|sexual)\b/i,
  /\bminors?\s+(nude|sex|porn|sexual)\b/i,
  /\b(send|dm|drop|trade|sell|buy)\s+(nudes?|pics|explicit pics)\b/i,
  /\bnonconsensual\b/i,
  /\bleaked\s+(nudes?|sex tape|explicit)\b/i,
];

function addLabel(labels, value) {
  if (!labels.includes(value)) {
    labels.push(value);
  }
}

function normalizeModerationText(text) {
  let normalized = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  for (const [pattern, replacement] of MODERATION_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesModerationPatterns(patterns, rawText, normalizedText) {
  const compactText = normalizedText.replace(/\s+/g, "");
  return patterns.some(
    (pattern) =>
      pattern.test(rawText) ||
      pattern.test(normalizedText) ||
      pattern.test(compactText),
  );
}

export function evaluateModerationText(text) {
  const normalizedText = String(text ?? "").trim();
  const searchableText = normalizeModerationText(normalizedText);
  const labels = [];

  if (!normalizedText) {
    return {
      moderationState: "clean",
      labels,
      category: null,
      reason: null,
    };
  }

  if (matchesModerationPatterns(HATE_PATTERNS, normalizedText, searchableText)) {
    addLabel(labels, "hateful speech");
  }

  if (matchesModerationPatterns(ABUSE_PATTERNS, normalizedText, searchableText)) {
    addLabel(labels, "abusive language");
  }

  if (matchesModerationPatterns(NUDITY_PATTERNS, normalizedText, searchableText)) {
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
