const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const EXTENSION_BY_MIME_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const POST_MEDIA_BUCKET = "post-media";
export const MAX_POST_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export function inferImageExtension({ fileName = "", mimeType = "", uri = "" } = {}) {
  const normalizedMimeType = String(mimeType ?? "").trim().toLowerCase();

  if (EXTENSION_BY_MIME_TYPE[normalizedMimeType]) {
    return EXTENSION_BY_MIME_TYPE[normalizedMimeType];
  }

  const match = String(fileName || uri).match(/\.([a-z0-9]+)(?:[?#].*)?$/i);
  return match?.[1]?.toLowerCase() ?? "jpg";
}

export function validatePostImageAsset(asset = {}) {
  const mimeType = String(asset.mimeType ?? "").trim().toLowerCase();
  const fileSize = Number(asset.fileSize ?? 0);

  if (!mimeType || !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error("Choose a JPG, PNG, WebP, or GIF image.");
  }

  if (fileSize > MAX_POST_IMAGE_SIZE_BYTES) {
    throw new Error("Images must be 5 MB or smaller.");
  }
}

export function buildPostImagePath(userId, asset = {}) {
  const cleanUserId = String(userId ?? "").trim();

  if (!cleanUserId) {
    throw new Error("A user id is required.");
  }

  const extension = inferImageExtension(asset);
  const token = Math.random().toString(36).slice(2, 10);

  return `${cleanUserId}/${Date.now()}-${token}.${extension}`;
}
