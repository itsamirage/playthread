import assert from "node:assert/strict";
import test from "node:test";

import {
  getAgeRatingLabel,
  isMatureAgeRating,
} from "../../supabase/functions/_shared/igdbAgeRatings.js";

test("getAgeRatingLabel prefers ESRB and supports string rating categories", () => {
  const label = getAgeRatingLabel([
    { rating_category: { organization: 2, rating: "twelve" } },
    { rating_category: { organization: 1, rating: "e10" } },
  ]);

  assert.equal(label, "ESRB E10+");
});

test("getAgeRatingLabel falls back to numeric board-scoped values", () => {
  assert.equal(getAgeRatingLabel([{ category: 2, rating: 4 }]), "PEGI 16");
  assert.equal(getAgeRatingLabel([{ category: 4, rating: 5 }]), "USK 18");
});

test("isMatureAgeRating only marks adult-only labels and explicit adult themes", () => {
  assert.equal(isMatureAgeRating([{ rating_category: { organization: 1, rating: "m" } }]), false);
  assert.equal(isMatureAgeRating([{ rating_category: { organization: 1, rating: "ao" } }]), true);
  assert.equal(isMatureAgeRating([], [{ name: "Fantasy" }]), false);
  assert.equal(isMatureAgeRating([], [{ name: "Adult" }]), true);
});
