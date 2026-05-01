export const REPORT_AUTO_HIDE_THRESHOLD = 3;

export function countDistinctReporters(reportRows) {
  const reporters = new Set();

  for (const row of reportRows ?? []) {
    const reporterId = row?.flagged_by ?? row?.evidence_json?.reporter_user_id ?? null;
    if (reporterId) {
      reporters.add(reporterId);
    }
  }

  return reporters.size;
}

export function shouldAutoHideReportedContent(reportRows, threshold = REPORT_AUTO_HIDE_THRESHOLD) {
  return countDistinctReporters(reportRows) >= threshold;
}
