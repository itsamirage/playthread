import test from "node:test";
import assert from "node:assert/strict";

import {
  buildContentVisibilityWritePlan,
  buildProfileIdentityWritePlan,
  buildProfileTitleSelectionWritePlan,
  buildProfileUsernameRepairWritePlan,
  buildRetentionPruneWritePlan,
} from "../trustedWritePlans.mjs";

test("buildProfileIdentityWritePlan produces a clean profile update for normal input", () => {
  const plan = buildProfileIdentityWritePlan(
    {
      displayName: "Player One",
      bio: "Short bio",
      avatarUrl: "https://avatars.steamstatic.com/avatar.jpg",
    },
    "hash-123"
  );

  assert.deepEqual(plan.profileUpdate, {
    display_name: "Player One",
    bio: "Short bio",
    avatar_url: "https://avatars.steamstatic.com/avatar.jpg",
    profile_moderation_state: "clean",
    profile_moderation_labels: [],
    avatar_moderation_state: "clean",
    avatar_moderation_labels: [],
  });
  assert.equal(plan.flags.length, 0);
});

test("buildProfileIdentityWritePlan emits moderation flags for risky text and avatar hosts", () => {
  const plan = buildProfileIdentityWritePlan(
    {
      displayName: "Player One",
      bio: "white power garbage",
      avatarUrl: "https://example.com/avatar.png",
    },
    "hash-abc"
  );

  assert.equal(plan.profileUpdate.profile_moderation_state, "warning");
  assert.equal(plan.profileUpdate.avatar_moderation_state, "warning");
  assert.equal(plan.flags.length, 2);
  assert.equal(plan.flags[0].category, "hate");
  assert.equal(plan.flags[0].evidence.request_ip_hash, "hash-abc");
  assert.equal(plan.flags[1].category, "spam");
  assert.equal(plan.flags[1].evidence.avatar_url, "https://example.com/avatar.png");
});

test("buildProfileTitleSelectionWritePlan accepts valid profile titles", () => {
  const plan = buildProfileTitleSelectionWritePlan("boss_slayer");

  assert.deepEqual(plan.profileUpdate, {
    selected_title_key: "boss_slayer",
  });
});

test("buildProfileUsernameRepairWritePlan only repairs generated or email-derived usernames", () => {
  const generatedPlan = buildProfileUsernameRepairWritePlan({
    currentUsername: "user_123456789abc",
    preferredUsername: "ActualPlayer",
    currentEmail: "fallback@example.com",
  });
  const emailPlan = buildProfileUsernameRepairWritePlan({
    currentUsername: "fallback",
    preferredUsername: "ActualPlayer",
    currentEmail: "fallback@example.com",
  });
  const noOpPlan = buildProfileUsernameRepairWritePlan({
    currentUsername: "steady_handle",
    preferredUsername: "ActualPlayer",
    currentEmail: "fallback@example.com",
  });

  assert.equal(generatedPlan.shouldUpdate, true);
  assert.equal(generatedPlan.profileUpdate.username, "actualplayer");
  assert.equal(emailPlan.shouldUpdate, true);
  assert.equal(noOpPlan.shouldUpdate, false);
});

test("buildContentVisibilityWritePlan maps flagged post hide action to post update and audit insert", () => {
  const plan = buildContentVisibilityWritePlan(
    {
      id: "flag-1",
      content_type: "post",
      content_id: "post-1",
      igdb_game_id: 42,
      category: "abuse",
      origin: "automatic",
    },
    "hidden"
  );

  assert.equal(plan.targetTable, "posts");
  assert.deepEqual(plan.contentUpdate, { moderation_state: "hidden" });
  assert.deepEqual(plan.flagUpdate, { status: "actioned" });
  assert.equal(plan.actionInsert.action_type, "hide_content");
  assert.equal(plan.actionInsert.metadata_json.flagId, "flag-1");
  assert.equal(plan.result.flagStatus, "actioned");
});

test("buildContentVisibilityWritePlan maps flagged comment restore action to comment update and audit insert", () => {
  const plan = buildContentVisibilityWritePlan(
    {
      id: "flag-2",
      content_type: "comment",
      content_id: "comment-9",
      igdb_game_id: null,
      category: "spam",
      origin: "manual",
    },
    "clean"
  );

  assert.equal(plan.targetTable, "post_comments");
  assert.deepEqual(plan.contentUpdate, { moderation_state: "clean" });
  assert.deepEqual(plan.flagUpdate, { status: "reviewed" });
  assert.equal(plan.actionInsert.action_type, "restore_content");
  assert.equal(plan.result.visibility, "clean");
});

test("buildRetentionPruneWritePlan normalizes rpc args and audit payload", () => {
  const plan = buildRetentionPruneWritePlan(
    {
      integrityRetentionDays: 14,
      moderationActionRetentionDays: 30,
    },
    { deleted_integrity_events: 2, deleted_review_actions: 1 },
    "user-1"
  );

  assert.deepEqual(plan.rpcArgs, {
    integrity_retention_days: 30,
    moderation_action_retention_days: 90,
  });
  assert.equal(plan.actionInsert.actor_user_id, "user-1");
  assert.equal(plan.actionInsert.action_type, "run_retention_prune");
  assert.deepEqual(plan.actionInsert.metadata_json.result, {
    deleted_integrity_events: 2,
    deleted_review_actions: 1,
  });
  assert.deepEqual(plan.result, {
    integrityRetentionDays: 30,
    moderationActionRetentionDays: 90,
  });
});
