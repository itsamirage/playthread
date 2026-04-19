import test from "node:test";
import assert from "node:assert/strict";

import { normalizeNumericIdArray, parsePostImageUrls } from "../postNormalization.mjs";

test("parsePostImageUrls supports serialized JSON arrays", () => {
  assert.deepEqual(
    parsePostImageUrls('["https://a.test/1.jpg","https://a.test/2.jpg"]'),
    ["https://a.test/1.jpg", "https://a.test/2.jpg"],
  );
});

test("parsePostImageUrls supports postgres array strings", () => {
  assert.deepEqual(
    parsePostImageUrls('{"https://a.test/1.jpg","https://a.test/2.jpg"}'),
    ["https://a.test/1.jpg", "https://a.test/2.jpg"],
  );
});

test("normalizeNumericIdArray accepts array and string payloads", () => {
  assert.deepEqual(normalizeNumericIdArray([1, "2", "bad", 0]), [1, 2]);
  assert.deepEqual(normalizeNumericIdArray("{12,14,99}"), [12, 14, 99]);
});
