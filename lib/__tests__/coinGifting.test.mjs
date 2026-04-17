import test from "node:test";
import assert from "node:assert/strict";

import {
  DAILY_GIFT_LIMIT,
  getSentGiftCoinsToday,
  wouldExceedDailyGiftLimit,
} from "../coinGifting.js";

test("daily gift limit is 200 coins", () => {
  assert.equal(DAILY_GIFT_LIMIT, 200);
});

test("getSentGiftCoinsToday sums absolute sent amounts", () => {
  assert.equal(
    getSentGiftCoinsToday([{ amount: -25 }, { amount: -75 }, { amount: 50 }]),
    150,
  );
});

test("wouldExceedDailyGiftLimit blocks gifts above the cap", () => {
  assert.equal(wouldExceedDailyGiftLimit({ sentToday: 150, amount: 40 }), false);
  assert.equal(wouldExceedDailyGiftLimit({ sentToday: 150, amount: 50 }), false);
  assert.equal(wouldExceedDailyGiftLimit({ sentToday: 150, amount: 51 }), true);
});
