import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAggregatedNotificationUpdate,
  getNotificationPushCooldownMinutes,
  shouldSendPushNotification,
  shouldStoreNotification,
} from "../notificationDeliveryLogic.mjs";

test("notification delivery defaults to enabled when no preferences exist", () => {
  assert.equal(shouldStoreNotification(null, "post_comment"), true);
  assert.equal(shouldSendPushNotification(null, "post_comment"), true);
});

test("notification storage respects per-kind disable flags", () => {
  const preferences = {
    post_comment_enabled: false,
    coin_gift_received_enabled: true,
  };

  assert.equal(shouldStoreNotification(preferences, "post_comment"), false);
  assert.equal(shouldStoreNotification(preferences, "coin_gift_received"), true);
});

test("push delivery requires both master push and per-kind enablement", () => {
  const pushDisabled = {
    push_enabled: false,
    new_follower_enabled: true,
  };
  const kindDisabled = {
    push_enabled: true,
    new_follower_enabled: false,
  };

  assert.equal(shouldSendPushNotification(pushDisabled, "new_follower"), false);
  assert.equal(shouldSendPushNotification(kindDisabled, "new_follower"), false);
  assert.equal(
    shouldSendPushNotification(
      {
        push_enabled: true,
        new_follower_enabled: true,
      },
      "new_follower",
    ),
    true,
  );
});

test("noise control only applies cooldowns to follower and followed-game activity", () => {
  assert.equal(
    getNotificationPushCooldownMinutes(
      {
        activity_noise_control_enabled: true,
        activity_push_cooldown_minutes: 45,
      },
      "followed_game_post",
    ),
    45,
  );
  assert.equal(
    getNotificationPushCooldownMinutes(
      {
        activity_noise_control_enabled: true,
        activity_push_cooldown_minutes: 45,
      },
      "post_comment",
    ),
    0,
  );
  assert.equal(
    getNotificationPushCooldownMinutes(
      {
        activity_noise_control_enabled: false,
        activity_push_cooldown_minutes: 45,
      },
      "new_follower",
    ),
    0,
  );
});

test("followed-game notifications aggregate into a single game update", () => {
  const update = buildAggregatedNotificationUpdate(
    {
      metadata_json: {
        gameId: 123,
        gameTitle: "Hollow Knight: Silksong",
        aggregatedCount: 1,
      },
    },
    {
      kind: "followed_game_post",
      entityId: "post-2",
      metadata: {
        gameId: 123,
        gameTitle: "Hollow Knight: Silksong",
        actorName: "player2",
      },
    },
  );

  assert.equal(update.title, "Hollow Knight: Silksong has 2 new posts");
  assert.equal(update.entityType, "game");
  assert.equal(update.entityId, "123");
  assert.equal(update.metadata.aggregatedCount, 2);
  assert.equal(update.metadata.latestPostId, "post-2");
});

test("new follower notifications aggregate recent follower names", () => {
  const update = buildAggregatedNotificationUpdate(
    {
      entity_id: "older-follower",
      metadata_json: {
        aggregatedCount: 1,
        recentFollowerNames: ["player1"],
      },
    },
    {
      kind: "new_follower",
      entityId: "latest-follower",
      title: "You have a new follower",
      metadata: {
        followerName: "player2",
      },
    },
  );

  assert.equal(update.title, "You have new followers");
  assert.equal(update.entityType, "profile");
  assert.equal(update.entityId, "latest-follower");
  assert.deepEqual(update.metadata.recentFollowerNames, ["player2", "player1"]);
});
