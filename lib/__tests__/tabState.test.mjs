import assert from "node:assert/strict";
import test from "node:test";

import {
  bindRouteToTab,
  getRememberedTabRoute,
  rememberTabRoute,
  resolveTabKeyFromPath,
  setActiveTab,
} from "../tabState.js";

test("resolveTabKeyFromPath recognizes grouped and public tab paths", () => {
  assert.equal(resolveTabKeyFromPath("/"), "home");
  assert.equal(resolveTabKeyFromPath("/(tabs)"), "home");
  assert.equal(resolveTabKeyFromPath("/popular"), "all");
  assert.equal(resolveTabKeyFromPath("/(tabs)/popular"), "all");
  assert.equal(resolveTabKeyFromPath("/browse"), "browse");
  assert.equal(resolveTabKeyFromPath("/(tabs)/browse"), "browse");
  assert.equal(resolveTabKeyFromPath("/friends"), "friends");
  assert.equal(resolveTabKeyFromPath("/(tabs)/friends"), "friends");
  assert.equal(resolveTabKeyFromPath("/profile"), "profile");
  assert.equal(resolveTabKeyFromPath("/(tabs)/profile"), "profile");
  assert.equal(resolveTabKeyFromPath("/post/abc"), null);
});

test("remembered tab routes can preserve an off-tab post detail route", () => {
  setActiveTab("home");
  rememberTabRoute("home", "/post/resident-evil");
  bindRouteToTab("browse", "/browse");

  assert.equal(getRememberedTabRoute("home"), "/post/resident-evil");
  assert.equal(getRememberedTabRoute("browse"), "/browse");
});
