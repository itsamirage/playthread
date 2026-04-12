import { buildProfileIdentityWritePlan } from "./trustedWritePlans.mjs";

export async function processProfileIdentityUpdate({
  adminClient,
  userId,
  profileSelect,
  input,
  requestIpHash = null,
  createModerationFlag,
}) {
  const writePlan = buildProfileIdentityWritePlan(input, requestIpHash);

  const { data, error } = await adminClient
    .from("profiles")
    .update(writePlan.profileUpdate)
    .eq("id", userId)
    .select(profileSelect)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not update profile.");
  }

  for (const flag of writePlan.flags) {
    await createModerationFlag(adminClient, {
      contentType: flag.contentType,
      contentId: flag.contentId,
      userId,
      category: flag.category,
      labels: flag.labels,
      reason: flag.reason,
      contentExcerpt: flag.contentExcerpt,
      evidence: flag.evidence,
    });
  }

  return {
    profile: data,
    moderation: writePlan.moderation,
    writePlan,
  };
}
