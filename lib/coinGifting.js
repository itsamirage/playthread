export const DAILY_GIFT_LIMIT = 200;

export function getSentGiftCoinsToday(transactions) {
  return (transactions ?? []).reduce(
    (sum, tx) => sum + Math.abs(Number(tx?.amount ?? 0)),
    0,
  );
}

export function wouldExceedDailyGiftLimit({ sentToday, amount, limit = DAILY_GIFT_LIMIT }) {
  return Number(sentToday ?? 0) + Math.max(0, Number(amount ?? 0)) > limit;
}
