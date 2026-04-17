import test from "node:test";
import assert from "node:assert/strict";

import {
  formatDisplayRating,
  normalizeStoredRating,
  toStoredRating,
} from "../gameRatingMath.js";

test("normalizeStoredRating snaps recovered DB values to the nearest 0.5", () => {
  assert.equal(normalizeStoredRating(4.8), 9.5);
  assert.equal(normalizeStoredRating(4.75), 9.5);
  assert.equal(normalizeStoredRating(5), 10);
  assert.equal(normalizeStoredRating(null), null);
});

test("toStoredRating halves 1-10 ratings for persistence", () => {
  assert.equal(toStoredRating(9.5), 4.75);
  assert.equal(toStoredRating(10), 5);
});

test("formatDisplayRating preserves whole and half-step labels without toFixed drift", () => {
  assert.equal(formatDisplayRating(9.5), "9.5");
  assert.equal(formatDisplayRating(10), "10");
  assert.equal(formatDisplayRating(null), "--");
});
