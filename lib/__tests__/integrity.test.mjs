import test from "node:test";
import assert from "node:assert/strict";

import { describeIntegrityError } from "../integrity.mjs";

test("describeIntegrityError maps known integrity failures to clearer copy", () => {
  const result = describeIntegrityError("Too many accounts from this network are boosting the same post. That reaction was blocked.");

  assert.equal(result.title, "Reaction blocked");
  assert.equal(result.shouldHighlightIntegrity, true);
});

test("describeIntegrityError falls back to raw message for non-integrity failures", () => {
  const result = describeIntegrityError("Could not load comments.");

  assert.equal(result.title, "Action failed");
  assert.equal(result.detail, "Could not load comments.");
  assert.equal(result.shouldHighlightIntegrity, false);
});
