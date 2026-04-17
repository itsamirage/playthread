export const MAX_CLIP_SIZE_BYTES = 200 * 1024 * 1024;
export const MAX_CLIP_DURATION_MS = 3 * 60 * 1000;

export function validateClipAsset(asset = {}) {
  const mimeType = String(asset.mimeType ?? "").trim().toLowerCase();
  const fileSize = Number(asset.fileSize ?? 0);
  const duration = Number(asset.duration ?? 0);

  if (!mimeType.startsWith("video/")) {
    throw new Error("Choose a video clip.");
  }

  if (fileSize > MAX_CLIP_SIZE_BYTES) {
    throw new Error("Clips must be 200 MB or smaller.");
  }

  if (duration > MAX_CLIP_DURATION_MS) {
    throw new Error("Clips must be 3 minutes or shorter.");
  }
}
