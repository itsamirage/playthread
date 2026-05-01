import assert from "node:assert/strict";
import test from "node:test";

import {
  countDistinctReporters,
  shouldAutoHideReportedContent,
} from "../reportModeration.mjs";

test("countDistinctReporters ignores duplicate reports from the same user", () => {
  const rows = [
    { flagged_by: "user-a" },
    { flagged_by: "user-a" },
    { flagged_by: "user-b" },
    { flagged_by: null, evidence_json: { reporter_user_id: "user-c" } },
  ];

  assert.equal(countDistinctReporters(rows), 3);
});

test("shouldAutoHideReportedContent requires the configured distinct reporter threshold", () => {
  assert.equal(shouldAutoHideReportedContent([{ flagged_by: "a" }, { flagged_by: "b" }]), false);
  assert.equal(
    shouldAutoHideReportedContent([{ flagged_by: "a" }, { flagged_by: "b" }, { flagged_by: "c" }]),
    true,
  );
});
