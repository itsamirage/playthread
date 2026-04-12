import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIntegrityOverview,
  buildIntegritySignals,
  canModerateFlagContent,
  filterFlags,
  filterIntegrityEvents,
  formatActionType,
  paginateItems,
} from "../adminInsights.mjs";

test("filterFlags narrows by status, origin, and text", () => {
  const flags = [
    { status: "open", origin: "integrity", author: "player1", reason: "Blocked", gameTitle: "Halo", category: "integrity" },
    { status: "reviewed", origin: "automatic", author: "other", reason: "Abuse", gameTitle: "Portal", category: "abuse" },
  ];

  const result = filterFlags(flags, {
    status: "open",
    origin: "integrity",
    search: "halo",
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].author, "player1");
});

test("filterIntegrityEvents searches across actor, target, and metadata", () => {
  const events = [
    {
      actor: "player1",
      target: "friend",
      requestIpHash: "abc123",
      eventType: "post_reaction",
      metadata: { reaction_type: "like" },
    },
    {
      actor: "guest",
      target: null,
      requestIpHash: "zzz999",
      eventType: "comment_create",
      metadata: { game_id: 1 },
    },
  ];

  const result = filterIntegrityEvents(events, {
    eventType: "post_reaction",
    search: "friend",
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].actor, "player1");
});

test("paginateItems clamps pages safely", () => {
  const result = paginateItems([1, 2, 3, 4, 5], 9, 2);

  assert.equal(result.page, 3);
  assert.equal(result.pageCount, 3);
  assert.deepEqual(result.items, [5]);
});

test("buildIntegritySignals ranks blocked repeated patterns highest", () => {
  const events = [
    {
      requestIpHash: "hash1",
      targetUserId: "target-1",
      eventType: "post_reaction",
      createdAt: "2026-04-11T10:00:00.000Z",
      isPositive: true,
      actor: "a",
      target: "target",
    },
    {
      requestIpHash: "hash1",
      targetUserId: "target-1",
      eventType: "post_reaction",
      createdAt: "2026-04-11T11:00:00.000Z",
      isPositive: true,
      actor: "b",
      target: "target",
    },
  ];
  const flags = [
    {
      origin: "integrity",
      evidence: { request_ip_hash: "hash1", event_type: "post_reaction" },
      userId: "target-1",
      createdAt: "2026-04-11T12:00:00.000Z",
      author: "a",
    },
  ];

  const [topSignal] = buildIntegritySignals(events, flags);

  assert.equal(topSignal.eventType, "post_reaction");
  assert.equal(topSignal.blockedCount, 1);
  assert.equal(topSignal.actorCount, 2);
});

test("buildIntegrityOverview totals summary rows for reporting cards", () => {
  const result = buildIntegrityOverview(
    [
      {
        summaryDay: "2026-04-10T00:00:00.000Z",
        eventType: "post_reaction",
        eventCount: 4,
        positiveCount: 3,
        distinctActorCount: 2,
        distinctNetworkCount: 1,
      },
      {
        summaryDay: "2026-04-11T00:00:00.000Z",
        eventType: "comment_create",
        eventCount: 2,
        positiveCount: 0,
        distinctActorCount: 2,
        distinctNetworkCount: 2,
      },
    ],
    [
      {
        summaryDay: "2026-04-11T00:00:00.000Z",
        blockedEventType: "post_reaction",
        blockedCount: 2,
        distinctActorCount: 2,
        distinctNetworkCount: 1,
      },
    ]
  );

  assert.equal(result.totalEvents, 6);
  assert.equal(result.totalPositiveEvents, 3);
  assert.equal(result.totalBlockedEvents, 2);
  assert.equal(result.distinctNetworks, 3);
  assert.equal(result.distinctActors, 3);
});

test("canModerateFlagContent only allows post and comment flags", () => {
  assert.equal(canModerateFlagContent({ id: "1", contentType: "post" }), true);
  assert.equal(canModerateFlagContent({ id: "2", contentType: "comment" }), true);
  assert.equal(canModerateFlagContent({ id: "3", contentType: "profile" }), false);
  assert.equal(canModerateFlagContent({ id: null, contentType: "post" }), false);
});

test("formatActionType converts snake case to title case", () => {
  assert.equal(formatActionType("update_integrity_settings"), "Update Integrity Settings");
});
