import test from "node:test";
import assert from "node:assert/strict";

import { isGeneratedPlaceholderUsername } from "../profileHelpers.mjs";

test("isGeneratedPlaceholderUsername matches generated fallback usernames only", () => {
  assert.equal(isGeneratedPlaceholderUsername("user_123456789abc"), true);
  assert.equal(isGeneratedPlaceholderUsername("USER_abcdef123456"), true);
  assert.equal(isGeneratedPlaceholderUsername("user_short"), false);
  assert.equal(isGeneratedPlaceholderUsername("smoketest1"), false);
  assert.equal(isGeneratedPlaceholderUsername("user_123456789abczzz"), false);
});
