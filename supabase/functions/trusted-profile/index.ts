import {
  assertActiveProfile,
  corsHeaders,
  getAdminClient,
  getAuthenticatedUser,
  getRequestIpHash,
  insertNotification,
  jsonResponse,
  readJsonBody,
  requireProfile,
} from "../_shared/trusted.ts";
import {
  processProfileIdentityUpdate,
  processProfileTitleSelection,
  processProfileShowcaseUpdate,
  processProfileUsernameRepair,
} from "../../../lib/trustedProfileService.js";

type RequestBody = {
  action?: "update_identity" | "select_title" | "repair_username" | "update_showcase";
  displayName?: string;
  bio?: string;
  avatarUrl?: string | null;
  titleKey?: string;
  currentUsername?: string;
  preferredUsername?: string;
  currentEmail?: string | null;
  items?: Array<{
    kind?: string;
    provider?: string;
    providerGameId?: string | number | null;
    providerAchievementId?: string | number | null;
    title?: string;
    subtitle?: string | null;
    imageUrl?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
};

const PROFILE_SELECT =
  "id, username, display_name, avatar_url, bio, created_at, account_role, moderation_scope, moderation_game_ids, developer_game_ids, is_banned, banned_reason, integrity_exempt, coins_from_posts, coins_from_comments, coins_from_gifts, coins_from_adjustments, coins_spent, selected_name_color, selected_banner_style, selected_title_key, profile_moderation_state, profile_moderation_labels, avatar_moderation_state, avatar_moderation_labels";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const user = await getAuthenticatedUser(request);
    const adminClient = getAdminClient();
    const profile = await requireProfile(adminClient, user.id);
    assertActiveProfile(profile);

    const body = await readJsonBody<RequestBody>(request);

    const action = body.action ?? "update_identity";
    let result;

    if (action === "update_identity") {
      result = await processProfileIdentityUpdate({
        adminClient,
        userId: user.id,
        profileSelect: PROFILE_SELECT,
        input: {
          displayName: body.displayName,
          bio: body.bio,
          avatarUrl: body.avatarUrl,
        },
        requestIpHash: await getRequestIpHash(request),
      });
    } else if (action === "select_title") {
      result = await processProfileTitleSelection({
        adminClient,
        userId: user.id,
        profileSelect: PROFILE_SELECT,
        titleKey: body.titleKey,
      });
    } else if (action === "repair_username") {
      result = await processProfileUsernameRepair({
        adminClient,
        userId: user.id,
        profileSelect: PROFILE_SELECT,
        currentUsername: body.currentUsername,
        preferredUsername: body.preferredUsername,
        currentEmail: body.currentEmail,
      });
    } else if (action === "update_showcase") {
      result = await processProfileShowcaseUpdate({
        adminClient,
        userId: user.id,
        items: body.items ?? [],
      });
    } else {
      throw new Error("Unsupported profile action.");
    }

    if (
      result.moderation?.profile?.moderationState === "warning" ||
      result.moderation?.avatar?.moderationState === "warning"
    ) {
      await insertNotification(adminClient, {
        userId: user.id,
        actorUserId: user.id,
        kind: "moderation_warning",
        title: "Your profile update was flagged for review",
        body:
          result.moderation?.profile?.reason ??
          result.moderation?.avatar?.reason ??
          "A profile field needs review.",
        entityType: "profile",
        entityId: user.id,
        metadata: {
          textLabels: result.moderation?.profile?.labels ?? [],
          avatarLabels: result.moderation?.avatar?.labels ?? [],
        },
      });
    }

    return jsonResponse({
      success: true,
      profile: result.profile,
      moderation: result.moderation,
      repaired: result.writePlan?.result?.repaired ?? false,
      count: result.count ?? null,
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
