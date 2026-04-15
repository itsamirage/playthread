const TRUSTED_AVATAR_HOSTS = new Set([
  "avatars.steamstatic.com",
  "avatars.cloudflare.steamstatic.com",
  "steamcdn-a.akamaihd.net",
  "media.steampowered.com",
]);

const IMAGE_EXTENSION_PATTERN = /\.(png|jpg|jpeg|gif|webp)$/i;

export function normalizeProfileIdentityInput(input = {}) {
  return {
    displayName: String(input.displayName ?? "").trim(),
    bio: String(input.bio ?? "").trim(),
    avatarUrl: String(input.avatarUrl ?? "").trim(),
  };
}

export function validateProfileIdentityInput(input = {}) {
  const normalized = normalizeProfileIdentityInput(input);

  if (!normalized.displayName) {
    throw new Error("Display name is required.");
  }

  if (normalized.displayName.length > 32) {
    throw new Error("Display name must be 32 characters or fewer.");
  }

  if (normalized.bio.length > 160) {
    throw new Error("Bio must be 160 characters or fewer.");
  }

  if (normalized.avatarUrl) {
    let parsedUrl;

    try {
      parsedUrl = new URL(normalized.avatarUrl);
    } catch {
      throw new Error("Avatar URL must be a valid HTTPS image URL.");
    }

    if (parsedUrl.protocol !== "https:") {
      throw new Error("Avatar URL must use HTTPS.");
    }

    if (!TRUSTED_AVATAR_HOSTS.has(parsedUrl.hostname)) {
      throw new Error("Only linked Steam avatar URLs are supported right now.");
    }

    if (!IMAGE_EXTENSION_PATTERN.test(parsedUrl.pathname) && !TRUSTED_AVATAR_HOSTS.has(parsedUrl.hostname)) {
      throw new Error("Avatar URL must point to a supported image.");
    }
  }

  return normalized;
}

export function evaluateAvatarSubmission(avatarUrl) {
  const normalizedAvatarUrl = String(avatarUrl ?? "").trim();

  if (!normalizedAvatarUrl) {
    return {
      moderationState: "clean",
      labels: [],
      reason: null,
      shouldFlag: false,
    };
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(normalizedAvatarUrl);
  } catch {
    return {
      moderationState: "warning",
      labels: ["avatar review"],
      reason: "Avatar submission needs manual review.",
      shouldFlag: true,
    };
  }

  if (TRUSTED_AVATAR_HOSTS.has(parsedUrl.hostname)) {
    return {
      moderationState: "clean",
      labels: [],
      reason: null,
      shouldFlag: false,
    };
  }

  return {
    moderationState: "warning",
    labels: ["avatar review"],
    reason: "Avatar submission from an unsupported host was blocked.",
    shouldFlag: true,
  };
}
