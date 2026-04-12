import test from "node:test";
import assert from "node:assert/strict";

import {
  assertCanModerateGameScope,
  clampIntegrityReportDays,
  getContentVisibilityUpdate,
  normalizeRetentionArgs,
  sanitizeGameIds,
} from "../adminModerationLogic.mjs";

test("sanitizeGameIds keeps only positive integer game ids", () => {
  assert.deepEqual(sanitizeGameIds([12, "7", "abc", -1, 0, 3.5, 18]), [12, 7, 18]);
  assert.deepEqual(sanitizeGameIds(null), []);
});

test("assertCanModerateGameScope allows owners and all-scope moderators", () => {
  assert.equal(assertCanModerateGameScope({ account_role: "owner" }, 999), true);
  assert.equal(
    assertCanModerateGameScope(
      { account_role: "moderator", moderation_scope: "all", moderation_game_ids: [] },
      999
    ),
    true
  );
});

test("assertCanModerateGameScope blocks moderators outside allowed games", () => {
  assert.throws(
    () =>
      assertCanModerateGameScope(
        { account_role: "moderator", moderation_scope: "games", moderation_game_ids: [12, 44] },
        99
      ),
    /outside your moderator scope/
  );
});

test("assertCanModerateGameScope allows moderators within allowed games", () => {
  assert.equal(
    assertCanModerateGameScope(
      { account_role: "moderator", moderation_scope: "games", moderation_game_ids: [12, 44] },
      44
    ),
    true
  );
});

test("getContentVisibilityUpdate returns hide metadata for actionable flags", () => {
  assert.deepEqual(getContentVisibilityUpdate("hidden", "post"), {
    visibility: "hidden",
    contentType: "post",
    nextFlagStatus: "actioned",
    actionType: "hide_content",
    reason: "Flagged post was hidden from public feeds.",
  });
});

test("getContentVisibilityUpdate returns restore metadata for comments", () => {
  assert.deepEqual(getContentVisibilityUpdate("clean", "comment"), {
    visibility: "clean",
    contentType: "comment",
    nextFlagStatus: "reviewed",
    actionType: "restore_content",
    reason: "Flagged comment was restored to public feeds.",
  });
});

test("getContentVisibilityUpdate rejects unsupported content types", () => {
  assert.throws(() => getContentVisibilityUpdate("hidden", "profile"), /Only post and comment flags/);
  assert.throws(() => getContentVisibilityUpdate("oops", "post"), /valid flag id and visibility/);
});

test("clampIntegrityReportDays keeps report range between 1 and 60 days", () => {
  assert.equal(clampIntegrityReportDays(14), 14);
  assert.equal(clampIntegrityReportDays(0), 1);
  assert.equal(clampIntegrityReportDays(999), 60);
});

test("normalizeRetentionArgs enforces minimum retention windows", () => {
  assert.deepEqual(normalizeRetentionArgs({ integrityRetentionDays: 12, moderationActionRetentionDays: 30 }), {
    integrityRetentionDays: 30,
    moderationActionRetentionDays: 90,
  });
  assert.deepEqual(normalizeRetentionArgs({ integrityRetentionDays: 120, moderationActionRetentionDays: 400 }), {
    integrityRetentionDays: 120,
    moderationActionRetentionDays: 400,
  });
});
