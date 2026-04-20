import test from "node:test";
import assert from "node:assert/strict";

import { processContentVisibilityUpdate, processRetentionPrune } from "../trustedAdminService.mjs";
import {
  processProfileIdentityUpdate,
  processProfileTitleSelection,
  processProfileUsernameRepair,
} from "../trustedProfileService.mjs";

function createMockAdminClient({
  maybeSingleByTable = {},
  rpcResults = {},
} = {}) {
  const operations = [];

  const client = {
    operations,
    from(table) {
      const state = {
        table,
        action: null,
        payload: null,
        filters: [],
        selectValue: null,
      };

      const chain = {
        select(value) {
          state.selectValue = value;
          return chain;
        },
        update(payload) {
          state.action = "update";
          state.payload = payload;
          return chain;
        },
        insert(payload) {
          operations.push({
            table,
            action: "insert",
            payload,
          });
          return Promise.resolve({ error: null });
        },
        eq(column, value) {
          state.filters.push({ column, value });
          return chain;
        },
        then(resolve, reject) {
          operations.push({
            table,
            action: state.action ?? "select",
            payload: state.payload,
            filters: state.filters,
            select: state.selectValue,
          });

          return Promise.resolve({ error: null }).then(resolve, reject);
        },
        maybeSingle() {
          operations.push({
            table,
            action: state.action ?? "select",
            payload: state.payload,
            filters: state.filters,
            select: state.selectValue,
          });

          return Promise.resolve(maybeSingleByTable[table] ?? { data: null, error: null });
        },
      };

      return chain;
    },
    rpc(name, args) {
      operations.push({
        type: "rpc",
        name,
        args,
      });

      return Promise.resolve(rpcResults[name] ?? { data: null, error: null });
    },
  };

  return client;
}

test("processProfileIdentityUpdate updates the profile row and emits moderation flags", async () => {
  const adminClient = createMockAdminClient({
    maybeSingleByTable: {
      profiles: {
        data: { id: "user-1", display_name: "Player One", avatar_url: "https://example.com/a.png" },
        error: null,
      },
    },
  });
  const capturedFlags = [];

  const result = await processProfileIdentityUpdate({
    adminClient,
    userId: "user-1",
    profileSelect: "id, display_name, avatar_url",
    input: {
      displayName: "Player One",
      bio: "white power is bad but pattern triggers",
      avatarUrl: "https://example.com/a.png",
    },
    requestIpHash: "hash-1",
    createModerationFlag: async (_client, payload) => {
      capturedFlags.push(payload);
    },
  });

  const profileUpdate = adminClient.operations.find(
    (operation) => operation.table === "profiles" && operation.action === "update"
  );

  assert.equal(profileUpdate.payload.display_name, "Player One");
  assert.equal(profileUpdate.payload.profile_moderation_state, "warning");
  assert.equal(profileUpdate.payload.avatar_moderation_state, "warning");
  assert.equal(result.profile.id, "user-1");
  assert.equal(capturedFlags.length, 2);
  assert.equal(capturedFlags[0].userId, "user-1");
  assert.equal(capturedFlags[1].category, "spam");
});

test("processProfileTitleSelection updates the selected profile title", async () => {
  const adminClient = createMockAdminClient({
    maybeSingleByTable: {
      profiles: {
        data: { id: "user-1", selected_title_key: "boss_slayer" },
        error: null,
      },
    },
  });

  const result = await processProfileTitleSelection({
    adminClient,
    userId: "user-1",
    profileSelect: "id, selected_title_key",
    titleKey: "boss_slayer",
  });

  const profileUpdate = adminClient.operations.find(
    (operation) => operation.table === "profiles" && operation.action === "update"
  );

  assert.deepEqual(profileUpdate.payload, { selected_title_key: "boss_slayer" });
  assert.equal(result.profile.selected_title_key, "boss_slayer");
});

test("processProfileUsernameRepair updates repairable usernames only", async () => {
  const adminClient = createMockAdminClient({
    maybeSingleByTable: {
      profiles: {
        data: { id: "user-1", username: "actualplayer", display_name: "actualplayer" },
        error: null,
      },
    },
  });

  const result = await processProfileUsernameRepair({
    adminClient,
    userId: "user-1",
    profileSelect: "id, username, display_name",
    currentUsername: "user_123456789abc",
    preferredUsername: "ActualPlayer",
    currentEmail: "fallback@example.com",
  });

  const profileUpdate = adminClient.operations.find(
    (operation) => operation.table === "profiles" && operation.action === "update"
  );

  assert.equal(profileUpdate.payload.username, "actualplayer");
  assert.equal(result.writePlan.result.repaired, true);
});

test("processContentVisibilityUpdate updates content, updates the flag, and inserts an audit row", async () => {
  const adminClient = createMockAdminClient();

  const result = await processContentVisibilityUpdate({
    adminClient,
    actorUserId: "admin-1",
    flagId: "flag-1",
    flagRow: {
      id: "flag-1",
      user_id: "target-1",
      content_type: "post",
      content_id: "post-1",
      igdb_game_id: 42,
      category: "abuse",
      origin: "automatic",
    },
    visibility: "hidden",
  });

  const postUpdate = adminClient.operations.find((operation) => operation.table === "posts");
  const flagUpdate = adminClient.operations.find(
    (operation) => operation.table === "moderation_flags" && operation.action === "update"
  );
  const actionInsert = adminClient.operations.find(
    (operation) => operation.table === "moderation_actions" && operation.action === "insert"
  );

  assert.deepEqual(postUpdate.payload, { moderation_state: "hidden" });
  assert.equal(flagUpdate.payload.status, "actioned");
  assert.equal(actionInsert.payload.actor_user_id, "admin-1");
  assert.equal(actionInsert.payload.action_type, "hide_content");
  assert.deepEqual(result, { visibility: "hidden", flagStatus: "actioned" });
});

test("processRetentionPrune calls the rpc and records the audit action", async () => {
  const adminClient = createMockAdminClient({
    rpcResults: {
      prune_old_integrity_data: {
        data: { deleted_integrity_events: 3, deleted_review_actions: 2 },
        error: null,
      },
    },
  });

  const result = await processRetentionPrune({
    adminClient,
    actorUserId: "owner-1",
    input: {
      integrityRetentionDays: 45,
      moderationActionRetentionDays: 120,
    },
  });

  const rpcCall = adminClient.operations.find((operation) => operation.type === "rpc");
  const actionInsert = adminClient.operations.find(
    (operation) => operation.table === "moderation_actions" && operation.action === "insert"
  );

  assert.equal(rpcCall.name, "prune_old_integrity_data");
  assert.deepEqual(rpcCall.args, {
    integrity_retention_days: 45,
    moderation_action_retention_days: 120,
  });
  assert.equal(actionInsert.payload.actor_user_id, "owner-1");
  assert.deepEqual(actionInsert.payload.metadata_json.result, {
    deleted_integrity_events: 3,
    deleted_review_actions: 2,
  });
  assert.deepEqual(result.retention, {
    integrityRetentionDays: 45,
    moderationActionRetentionDays: 120,
  });
});
