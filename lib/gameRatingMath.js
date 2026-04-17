export function normalizeStoredRating(value) {
  if (value == null) {
    return null;
  }

  const raw = Number(value) * 2;
  return Math.round(raw * 2) / 2;
}

export function toStoredRating(value) {
  return Number(value) / 2;
}

export function formatDisplayRating(value) {
  if (value == null) {
    return "--";
  }

  return String(value);
}
