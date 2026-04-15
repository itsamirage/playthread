import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRouteFromNotification,
  groupNotificationsByDay,
} from "../notificationRouting.mjs";

test("buildRouteFromNotification routes aggregated game notifications to the game screen", () => {
  assert.equal(
    buildRouteFromNotification({
      entityType: "game",
      entityId: "123",
      metadata: {
        latestPostId: "post-2",
      },
    }),
    "/game/123",
  );
});

test("buildRouteFromNotification routes comment notifications through their parent post", () => {
  assert.equal(
    buildRouteFromNotification({
      entityType: "comment",
      entityId: "comment-1",
      metadata: {
        postId: "post-9",
      },
    }),
    "/post/post-9",
  );
});

test("groupNotificationsByDay labels today and yesterday clearly", () => {
  const now = new Date("2026-04-13T15:00:00Z");
  const groups = groupNotificationsByDay(
    [
      { id: "a", createdAt: "2026-04-13T12:00:00Z" },
      { id: "b", createdAt: "2026-04-12T12:00:00Z" },
    ],
    now,
  );

  assert.deepEqual(groups.map((group) => group.dayLabel), ["Today", "Yesterday"]);
});
