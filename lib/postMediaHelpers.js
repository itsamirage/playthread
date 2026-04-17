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
export const MAX_POST_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_POST_TOTAL_IMAGE_SIZE_BYTES = 24 * 1024 * 1024;
export const MAX_POST_IMAGE_COUNT = 6;
export const MIN_POST_IMAGE_DIMENSION = 120;
export const MAX_POST_IMAGE_ASPECT_RATIO = 4;
export const MAX_POST_IMAGE_DIMENSION = 1600;

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
  const width = Number(asset.width ?? 0);
  const height = Number(asset.height ?? 0);
  const aspectRatio = width > 0 && height > 0 ? Math.max(width / height, height / width) : 0;

  if (!mimeType || !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error("Choose a JPG, PNG, WebP, or GIF image.");
  }

  if (fileSize > MAX_POST_IMAGE_SIZE_BYTES) {
    throw new Error("Images must be 10 MB or smaller.");
  }

  if ((width > 0 && width < MIN_POST_IMAGE_DIMENSION) || (height > 0 && height < MIN_POST_IMAGE_DIMENSION)) {
    throw new Error("Images must be at least 120 px on each side.");
  }

  if (aspectRatio > MAX_POST_IMAGE_ASPECT_RATIO) {
    throw new Error("Images cannot be extremely wide or tall.");
  }
}

export function summarizePostImageAsset(asset = {}) {
  validatePostImageAsset(asset);

  const mimeType = String(asset.mimeType ?? "").trim().toLowerCase();
  const width = Number(asset.width ?? 0) || null;
  const height = Number(asset.height ?? 0) || null;
  const extension = inferImageExtension(asset);
  const aspectRatio = width && height ? Number((width / height).toFixed(3)) : null;
  const isAnimated = mimeType === "image/gif";

  return {
    mimeType,
    extension,
    fileSize: Number(asset.fileSize ?? 0) || 0,
    width,
    height,
    aspectRatio,
    isAnimated,
  };
}

export function getTotalPostImageSize(assets = []) {
  return (assets ?? []).reduce((sum, asset) => sum + Math.max(0, Number(asset?.fileSize ?? 0)), 0);
}

export function validatePostImageSelection(assets = []) {
  if (assets.length > MAX_POST_IMAGE_COUNT) {
    throw new Error(`Choose up to ${MAX_POST_IMAGE_COUNT} images.`);
  }

  const totalSize = getTotalPostImageSize(assets);
  if (totalSize > MAX_POST_TOTAL_IMAGE_SIZE_BYTES) {
    throw new Error("Selected images must total 24 MB or less.");
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
