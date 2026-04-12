import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPostImagePath,
  inferImageExtension,
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
        fileSize: 6 * 1024 * 1024,
      }),
    /5 MB or smaller/,
  );
});
