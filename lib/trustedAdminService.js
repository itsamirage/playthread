import { buildContentVisibilityWritePlan, buildRetentionPruneWritePlan } from "./trustedWritePlans.js";

export async function processContentVisibilityUpdate({
  adminClient,
  actorUserId,
  flagId,
  flagRow,
  visibility,
}) {
  const writePlan = buildContentVisibilityWritePlan(flagRow, visibility);

  const { error: contentError } = await adminClient
    .from(writePlan.targetTable)
    .update(writePlan.contentUpdate)
    .eq("id", flagRow.content_id);

  if (contentError) {
    throw new Error(contentError.message);
  }

  const { error: flagStatusError } = await adminClient
    .from("moderation_flags")
    .update({
      status: writePlan.flagUpdate.status,
      reviewed_by: actorUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", flagId);

  if (flagStatusError) {
    throw new Error(flagStatusError.message);
  }

  const { error: actionError } = await adminClient.from("moderation_actions").insert({
    target_user_id: flagRow.user_id,
    actor_user_id: actorUserId,
    ...writePlan.actionInsert,
  });

  if (actionError) {
    throw new Error(actionError.message);
  }

  return writePlan.result;
}

export async function processRetentionPrune({
  adminClient,
  actorUserId,
  input,
}) {
  const rpcPlan = buildRetentionPruneWritePlan(input, null, actorUserId);
  const { data, error } = await adminClient.rpc("prune_old_integrity_data", rpcPlan.rpcArgs);

  if (error) {
    throw new Error(error.message);
  }

  const finalPlan = buildRetentionPruneWritePlan(input, data ?? null, actorUserId);
  const { error: actionError } = await adminClient.from("moderation_actions").insert(finalPlan.actionInsert);

  if (actionError) {
    throw new Error(actionError.message);
  }

  return {
    retention: finalPlan.result,
    result: data ?? null,
    writePlan: finalPlan,
  };
}
