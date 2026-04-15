import test from "node:test";
import assert from "node:assert/strict";

import { isValidUsername } from "../usernameValidation.mjs";

test("isValidUsername accepts spaces and punctuation", () => {
  assert.equal(isValidUsername("pants.pants!pants?"), true);
  assert.equal(isValidUsername("pants pants"), true);
});

test("isValidUsername rejects leading or trailing spaces and overlong values", () => {
  assert.equal(isValidUsername(" pants"), false);
  assert.equal(isValidUsername("pants "), false);
  assert.equal(isValidUsername("x".repeat(21)), false);
});
