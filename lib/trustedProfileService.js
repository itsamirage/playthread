import { createModerationFlag } from "../supabase/functions/_shared/trusted.ts";
import {
  buildProfileIdentityWritePlan,
  buildProfileTitleSelectionWritePlan,
  buildProfileUsernameRepairWritePlan,
} from "./trustedWritePlans.js";

export async function processProfileIdentityUpdate({
  adminClient,
  userId,
  profileSelect,
  input,
  requestIpHash = null,
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

export async function processProfileTitleSelection({
  adminClient,
  userId,
  profileSelect,
  titleKey,
}) {
  const writePlan = buildProfileTitleSelectionWritePlan(titleKey);

  const { data, error } = await adminClient
    .from("profiles")
    .update(writePlan.profileUpdate)
    .eq("id", userId)
    .select(profileSelect)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not update title.");
  }

  return {
    profile: data,
    writePlan,
  };
}

export async function processProfileUsernameRepair({
  adminClient,
  userId,
  profileSelect,
  currentUsername,
  preferredUsername,
  currentEmail,
}) {
  const writePlan = buildProfileUsernameRepairWritePlan({
    currentUsername,
    preferredUsername,
    currentEmail,
  });

  if (!writePlan.shouldUpdate) {
    return {
      profile: null,
      writePlan,
    };
  }

  const { data, error } = await adminClient
    .from("profiles")
    .update(writePlan.profileUpdate)
    .eq("id", userId)
    .select(profileSelect)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not repair username.");
  }

  return {
    profile: data,
    writePlan,
  };
}

function normalizeShowcasePayload(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.slice(0, 3).map((item, index) => {
    const title = String(item?.title ?? "").trim();
    const kind = String(item?.kind ?? "").trim();
    const provider = String(item?.provider ?? "").trim();

    if (!title) {
      throw new Error("Each showcase item needs a title.");
    }

    if (!kind || !provider) {
      throw new Error("Each showcase item needs a kind and provider.");
    }

    return {
      user_id: null,
      kind,
      provider,
      provider_game_id: item?.providerGameId ?? null,
      provider_achievement_id: item?.providerAchievementId ?? null,
      title,
      subtitle: String(item?.subtitle ?? "").trim() || null,
      image_url: String(item?.imageUrl ?? "").trim() || null,
      position: index,
      metadata_json: {
        ...(item?.metadata && typeof item.metadata === "object" ? item.metadata : {}),
        source: "manual",
        pinned_by_user: true,
      },
    };
  });
}

export async function processProfileShowcaseUpdate({
  adminClient,
  userId,
  items,
}) {
  const sanitizedItems = normalizeShowcasePayload(items).map((item) => ({
    ...item,
    user_id: userId,
  }));

  const { error: deleteError } = await adminClient
    .from("profile_showcase_items")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    throw new Error(deleteError.message ?? "Could not clear showcase items.");
  }

  if (sanitizedItems.length === 0) {
    return {
      count: 0,
    };
  }

  const { error: insertError } = await adminClient
    .from("profile_showcase_items")
    .insert(sanitizedItems);

  if (insertError) {
    throw new Error(insertError.message ?? "Could not save showcase items.");
  }

  return {
    count: sanitizedItems.length,
  };
}
