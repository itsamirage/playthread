import test from "node:test";
import assert from "node:assert/strict";

import { getEmailRedirectUrl, getPasswordResetRedirectUrl } from "../authRedirect.mjs";

test("getEmailRedirectUrl uses hosted login route on web", () => {
  assert.equal(
    getEmailRedirectUrl({ platform: "web", origin: "https://playthread.app" }),
    "https://playthread.app/login"
  );
});

test("getEmailRedirectUrl uses native deep link outside web", () => {
  assert.equal(
    getEmailRedirectUrl({ platform: "ios", createUrl: (path) => `playthread://${path}` }),
    "playthread://login"
  );
});

test("getPasswordResetRedirectUrl uses reset-password route", () => {
  assert.equal(
    getPasswordResetRedirectUrl({ platform: "web", origin: "https://playthread.app" }),
    "https://playthread.app/reset-password"
  );
});
