import assert from "node:assert/strict";
import test from "node:test";

import { evaluateModerationText } from "../moderation.mjs";

test("evaluateModerationText leaves ordinary game discussion clean", () => {
  const result = evaluateModerationText("Resident Evil Requiem looks intense, but I like the lighting.");

  assert.equal(result.moderationState, "clean");
  assert.equal(result.category, null);
  assert.deepEqual(result.labels, []);
});

test("evaluateModerationText catches obfuscated self-harm abuse", () => {
  const result = evaluateModerationText("k!ll y0ur$elf");

  assert.equal(result.moderationState, "warning");
  assert.equal(result.category, "abuse");
  assert.deepEqual(result.labels, ["abusive language"]);
});

test("evaluateModerationText catches protected-class slurs", () => {
  const result = evaluateModerationText("f@g");

  assert.equal(result.moderationState, "warning");
  assert.equal(result.category, "hate");
  assert.deepEqual(result.labels, ["hateful speech"]);
});

test("evaluateModerationText catches sexual content and solicitation", () => {
  const result = evaluateModerationText("drop explicit pics");

  assert.equal(result.moderationState, "warning");
  assert.equal(result.category, "nudity");
  assert.deepEqual(result.labels, ["sexual content"]);
});

test("evaluateModerationText preserves extremist phrase detection", () => {
  const result = evaluateModerationText("white power garbage");

  assert.equal(result.moderationState, "warning");
  assert.equal(result.category, "hate");
  assert.deepEqual(result.labels, ["hateful speech"]);
});
