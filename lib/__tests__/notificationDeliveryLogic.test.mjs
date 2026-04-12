import test from "node:test";
import assert from "node:assert/strict";

import {
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
