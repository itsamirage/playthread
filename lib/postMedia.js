import * as ImagePicker from "expo-image-picker";

import { supabase } from "./supabase";
import {
  buildPostImagePath,
  POST_MEDIA_BUCKET,
  summarizePostImageAsset,
  validatePostImageAsset,
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
