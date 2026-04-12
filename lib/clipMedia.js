import * as ImagePicker from "expo-image-picker";

import { invokeEdgeFunction } from "./functions";

const MAX_CLIP_SIZE_BYTES = 200 * 1024 * 1024;

function validateClipAsset(asset = {}) {
  const mimeType = String(asset.mimeType ?? "").trim().toLowerCase();
  const fileSize = Number(asset.fileSize ?? 0);

  if (!mimeType.startsWith("video/")) {
    throw new Error("Choose a video clip.");
  }

  if (fileSize > MAX_CLIP_SIZE_BYTES) {
    throw new Error("Clips must be 200 MB or smaller.");
  }
}

async function assetToUploadBody(asset) {
  if (asset?.file instanceof File) {
    return asset.file;
  }

  const response = await fetch(asset.uri);

  if (!response.ok) {
    throw new Error("Could not read the selected clip.");
  }

  return response.blob();
}

export async function pickClipVideo() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    allowsMultipleSelection: false,
    quality: 1,
    selectionLimit: 1,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  validateClipAsset(result.assets[0]);
  return result.assets[0];
}

export async function uploadMuxClip(asset) {
  validateClipAsset(asset);

  const uploadResult = await invokeEdgeFunction("mux-video", {
    action: "create_upload",
  });
  const uploadUrl = uploadResult?.upload?.url;
  const uploadId = uploadResult?.upload?.id;
  const uploadToken = uploadResult?.upload?.uploadToken;

  if (!uploadUrl || !uploadId || !uploadToken) {
    throw new Error("Could not create a clip upload.");
  }

  const body = await assetToUploadBody(asset);
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": String(asset.mimeType ?? "video/mp4"),
    },
    body,
  });

  if (!response.ok) {
    throw new Error("Could not upload that clip to Mux.");
  }

  return {
    uploadId,
    uploadToken,
  };
}
