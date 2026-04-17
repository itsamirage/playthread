import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

import { supabase } from "./supabase";
import {
  buildPostImagePath,
  getTotalPostImageSize,
  MAX_POST_IMAGE_COUNT,
  MAX_POST_IMAGE_DIMENSION,
  MAX_POST_IMAGE_SIZE_BYTES,
  POST_MEDIA_BUCKET,
  summarizePostImageAsset,
  validatePostImageAsset,
  validatePostImageSelection,
} from "./postMediaHelpers";

async function assetToUploadBody(asset) {
  if (asset?.file instanceof File) {
    return asset.file;
  }

  const response = await fetch(asset.uri);

  if (!response.ok) {
    throw new Error("Could not read the selected image.");
  }

  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function pickPostImage() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: false,
    quality: 0.9,
    selectionLimit: 1,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  validatePostImageAsset(result.assets[0]);
  return result.assets[0];
}

export async function pickPostImages({ limit = 6 } = {}) {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    quality: 0.9,
    selectionLimit: limit,
  });

  if (result.canceled || !Array.isArray(result.assets) || result.assets.length === 0) {
    return [];
  }

  const assets = result.assets.slice(0, limit);
  const optimizedAssets = [];

  for (const asset of assets) {
    optimizedAssets.push(await optimizePostImageAsset(asset));
  }

  validatePostImageSelection(optimizedAssets);
  return optimizedAssets;
}

async function readAssetSize(uri) {
  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error("Could not process the selected image.");
  }

  const buffer = await response.arrayBuffer();
  return buffer.byteLength;
}

async function optimizePostImageAsset(asset) {
  validatePostImageAsset(asset);

  const mimeType = String(asset?.mimeType ?? "").trim().toLowerCase();
  const width = Number(asset?.width ?? 0);
  const height = Number(asset?.height ?? 0);
  const needsResize = Math.max(width, height) > MAX_POST_IMAGE_DIMENSION;
  const needsCompression = Number(asset?.fileSize ?? 0) > 2 * 1024 * 1024;

  if (mimeType === "image/gif" || (!needsResize && !needsCompression)) {
    return asset;
  }

  const resizeAction = needsResize
    ? width >= height
      ? { resize: { width: MAX_POST_IMAGE_DIMENSION } }
      : { resize: { height: MAX_POST_IMAGE_DIMENSION } }
    : null;

  const actions = resizeAction ? [resizeAction] : [];
  const result = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: 0.72,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const nextFileSize = await readAssetSize(result.uri);
  const optimizedAsset = {
    ...asset,
    uri: result.uri,
    width: result.width,
    height: result.height,
    fileSize: nextFileSize,
    fileName: String(asset?.fileName ?? "image").replace(/\.[^.]+$/, ".jpg"),
    mimeType: "image/jpeg",
  };

  validatePostImageAsset(optimizedAsset);
  return optimizedAsset;
}

export async function uploadPostImage({ userId, asset }) {
  const metadata = summarizePostImageAsset(asset);

  const path = buildPostImagePath(userId, asset);
  const body = await assetToUploadBody(asset);
  const contentType = metadata.mimeType;

  const { error } = await supabase.storage
    .from(POST_MEDIA_BUCKET)
    .upload(path, body, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(error.message || "Could not upload image.");
  }

  const { data } = supabase.storage.from(POST_MEDIA_BUCKET).getPublicUrl(path);

  return {
    bucket: POST_MEDIA_BUCKET,
    path,
    publicUrl: data.publicUrl,
    metadata,
  };
}

export async function removePostImage(path) {
  if (!path) {
    return;
  }

  const { error } = await supabase.storage.from(POST_MEDIA_BUCKET).remove([path]);

  if (error) {
    console.warn("Could not remove orphaned post image", error);
  }
}
