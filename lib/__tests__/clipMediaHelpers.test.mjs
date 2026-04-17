import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_CLIP_DURATION_MS,
  validateClipAsset,
} from "../clipMediaHelpers.js";

test("clip duration cap is 3 minutes", () => {
  assert.equal(MAX_CLIP_DURATION_MS, 3 * 60 * 1000);
});

test("validateClipAsset rejects clips longer than 3 minutes", () => {
  assert.throws(
    () =>
      validateClipAsset({
        mimeType: "video/mp4",
        fileSize: 1024,
        duration: 3 * 60 * 1000 + 1,
      }),
    /3 minutes or shorter/,
  );
});

test("validateClipAsset accepts short valid clips", () => {
  assert.doesNotThrow(() =>
    validateClipAsset({
      mimeType: "video/mp4",
      fileSize: 1024,
      duration: 60 * 1000,
    }),
  );
});
