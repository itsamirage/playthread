import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateAvatarSubmission,
  normalizeProfileIdentityInput,
  validateProfileIdentityInput,
} from "../profileModerationLogic.mjs";

test("normalizeProfileIdentityInput trims profile identity fields", () => {
  assert.deepEqual(
    normalizeProfileIdentityInput({
      displayName: "  Player One  ",
      bio: "  hello there  ",
      avatarUrl: "  https://example.com/a.png  ",
    }),
    {
      displayName: "Player One",
      bio: "hello there",
      avatarUrl: "https://example.com/a.png",
    }
  );
});

test("validateProfileIdentityInput accepts a normal display name and bio", () => {
  assert.deepEqual(
    validateProfileIdentityInput({
      displayName: "Player One",
      bio: "Short bio",
      avatarUrl: "",
    }),
    {
      displayName: "Player One",
      bio: "Short bio",
      avatarUrl: "",
    }
  );
});

test("validateProfileIdentityInput rejects invalid display name and avatar inputs", () => {
  assert.throws(() => validateProfileIdentityInput({ displayName: "", bio: "", avatarUrl: "" }), /Display name is required/);
  assert.throws(
    () => validateProfileIdentityInput({ displayName: "x".repeat(33), bio: "", avatarUrl: "" }),
    /32 characters or fewer/
  );
  assert.throws(
    () => validateProfileIdentityInput({ displayName: "Player", bio: "", avatarUrl: "http://example.com/a.png" }),
    /must use HTTPS/
  );
});

test("evaluateAvatarSubmission keeps trusted Steam avatar hosts clean", () => {
  assert.deepEqual(evaluateAvatarSubmission("https://avatars.steamstatic.com/avatar.jpg"), {
    moderationState: "clean",
    labels: [],
    reason: null,
    shouldFlag: false,
  });
});

test("evaluateAvatarSubmission flags untrusted avatar hosts for review", () => {
  assert.deepEqual(evaluateAvatarSubmission("https://example.com/avatar.png"), {
    moderationState: "warning",
    labels: ["avatar review"],
    reason: "Avatar submission from an untrusted host needs manual review.",
    shouldFlag: true,
  });
});
