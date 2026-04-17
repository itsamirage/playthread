import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPostImagePath,
  getTotalPostImageSize,
  inferImageExtension,
  validatePostImageSelection,
  summarizePostImageAsset,
  validatePostImageAsset,
} from "../postMediaHelpers.mjs";

test("inferImageExtension prefers mime type over filename", () => {
  assert.equal(
    inferImageExtension({
      fileName: "clip.png",
      mimeType: "image/webp",
    }),
    "webp",
  );
});

test("buildPostImagePath nests uploads under the user id", () => {
  const path = buildPostImagePath("user-123", {
    fileName: "shot.png",
    mimeType: "image/png",
  });

  assert.match(path, /^user-123\/\d+-[a-z0-9]{8}\.png$/);
});

test("validatePostImageAsset accepts supported image uploads", () => {
  assert.doesNotThrow(() =>
    validatePostImageAsset({
      mimeType: "image/jpeg",
      fileSize: 1024,
    }),
  );
});

test("validatePostImageAsset rejects unsupported mime types", () => {
  assert.throws(
    () =>
      validatePostImageAsset({
        mimeType: "video/mp4",
        fileSize: 1024,
      }),
    /Choose a JPG, PNG, WebP, or GIF image/,
  );
});

test("validatePostImageAsset rejects oversized files", () => {
  assert.throws(
    () =>
      validatePostImageAsset({
        mimeType: "image/png",
        fileSize: 11 * 1024 * 1024,
      }),
    /10 MB or smaller/,
  );
});

test("validatePostImageAsset rejects tiny images", () => {
  assert.throws(
    () =>
      validatePostImageAsset({
        mimeType: "image/png",
        fileSize: 1024,
        width: 80,
        height: 200,
      }),
    /at least 120 px/,
  );
});

test("summarizePostImageAsset returns normalized moderation metadata", () => {
  const metadata = summarizePostImageAsset({
    fileName: "shot.gif",
    mimeType: "image/gif",
    fileSize: 2048,
    width: 640,
    height: 360,
  });

  assert.deepEqual(metadata, {
    mimeType: "image/gif",
    extension: "gif",
    fileSize: 2048,
    width: 640,
    height: 360,
    aspectRatio: 1.778,
    isAnimated: true,
  });
});

test("getTotalPostImageSize sums file sizes across selected images", () => {
  assert.equal(getTotalPostImageSize([{ fileSize: 1000 }, { fileSize: 2500 }]), 3500);
});

test("validatePostImageSelection rejects oversized total payloads", () => {
  assert.throws(
    () =>
      validatePostImageSelection([
        { fileSize: 10 * 1024 * 1024 },
        { fileSize: 10 * 1024 * 1024 },
        { fileSize: 5 * 1024 * 1024 },
      ]),
    /24 MB or less/,
  );
});
