import test from "node:test";
import assert from "node:assert/strict";

import { parseSupabaseAuthCallback } from "../authCallback.mjs";

test("parseSupabaseAuthCallback reads recovery tokens from hash params", () => {
  const result = parseSupabaseAuthCallback(
    "playthread://reset-password#access_token=a1&refresh_token=r1&type=recovery",
  );

  assert.deepEqual(result, {
    pathname: "",
    accessToken: "a1",
    refreshToken: "r1",
    type: "recovery",
    code: null,
    errorCode: null,
    errorDescription: null,
  });
});

test("parseSupabaseAuthCallback returns null for unrelated urls", () => {
  assert.equal(parseSupabaseAuthCallback("playthread://login"), null);
});
