import { invokeEdgeFunction } from "./functions";

export async function reportContent({ contentType, contentId, reason, category = "abuse" }) {
  return invokeEdgeFunction("trusted-report", {
    contentType,
    contentId,
    reason,
    category,
  });
}
