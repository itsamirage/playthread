import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_PREFIX = "playthread:create-post-draft:";

function buildDraftStorageKey(contextKey) {
  return `${STORAGE_PREFIX}${contextKey || "global"}`;
}

function normalizeDraftValue(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    selectedGameId: value.selectedGameId ? Number(value.selectedGameId) : null,
    postType: typeof value.postType === "string" ? value.postType : "discussion",
    title: String(value.title ?? ""),
    body: String(value.body ?? ""),
    rating: String(value.rating ?? "8"),
    isSpoiler: Boolean(value.isSpoiler),
    spoilerTag: String(value.spoilerTag ?? ""),
    gameSearch: String(value.gameSearch ?? ""),
    hadMedia: Boolean(value.hadMedia),
    mediaSummary: String(value.mediaSummary ?? ""),
    updatedAt: value.updatedAt ?? null,
  };
}

export async function loadPostComposerDraft(contextKey) {
  try {
    const rawValue = await AsyncStorage.getItem(buildDraftStorageKey(contextKey));
    return normalizeDraftValue(rawValue ? JSON.parse(rawValue) : null);
  } catch {
    return null;
  }
}

export async function savePostComposerDraft(contextKey, value) {
  try {
    await AsyncStorage.setItem(
      buildDraftStorageKey(contextKey),
      JSON.stringify({
        ...value,
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Ignore local draft persistence failures.
  }
}

export async function clearPostComposerDraft(contextKey) {
  try {
    await AsyncStorage.removeItem(buildDraftStorageKey(contextKey));
  } catch {
    // Ignore local draft persistence failures.
  }
}
