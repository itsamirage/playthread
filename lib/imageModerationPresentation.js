function formatBytes(value) {
  const size = Number(value ?? 0);

  if (!size || Number.isNaN(size)) {
    return null;
  }

  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function describeImageModerationDetails(imageMetadata) {
  if (!imageMetadata || typeof imageMetadata !== "object") {
    return [];
  }

  const details = [];
  const width = Number(imageMetadata.width ?? 0);
  const height = Number(imageMetadata.height ?? 0);
  const fileSize = formatBytes(imageMetadata.file_size ?? imageMetadata.fileSize ?? 0);
  const mimeType = String(imageMetadata.mime_type ?? imageMetadata.mimeType ?? "").trim();
  const extension = String(imageMetadata.extension ?? "").trim();

  if (width > 0 && height > 0) {
    details.push(`${width}x${height}`);
  }

  if (fileSize) {
    details.push(fileSize);
  }

  if (mimeType) {
    details.push(mimeType);
  } else if (extension) {
    details.push(extension.toUpperCase());
  }

  if (imageMetadata.is_animated || imageMetadata.isAnimated) {
    details.push("animated");
  }

  return details;
}
