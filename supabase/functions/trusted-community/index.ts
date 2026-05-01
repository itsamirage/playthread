import {
  assertActiveProfile,
  assertNoBannedSignals,
  assertStaff,
  corsHeaders,
  getAdminClient,
  getAuthenticatedUser,
  jsonResponse,
  readJsonBody,
  requireProfile,
} from "../_shared/trusted.ts";

type RequestBody = {
  action?: "create" | "update" | "hide" | "ban_user" | "unban_user";
  communityId?: number;
  title?: string;
  subtitle?: string;
  body?: string;
  targetUserId?: string;
  reason?: string | null;
};

const COMMUNITY_SELECT =
  "id, community_game_id, slug, title, subtitle, body, creator_user_id, moderation_state, created_at, updated_at";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function normalizeTitle(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeBody(value: unknown, maxLength: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function isStaff(profile: { account_role: string | null }) {
  return ["moderator", "admin", "owner"].includes(profile.account_role ?? "");
}

async function getCommunity(adminClient: ReturnType<typeof getAdminClient>, communityId: number) {
  const { data, error } = await adminClient
    .from("custom_communities")
    .select(COMMUNITY_SELECT)
    .eq("community_game_id", communityId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("That community no longer exists.");
  }

  return data;
}

function assertCanManageCommunity(
  community: { creator_user_id: string | null },
  actorUserId: string,
  actorProfile: { account_role: string | null },
) {
  if (community.creator_user_id === actorUserId || isStaff(actorProfile)) {
    return;
  }

  throw new Error("You cannot manage that community.");
}

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
    await assertNoBannedSignals(adminClient, request, user.id);

    const body = await readJsonBody<RequestBody>(request);
    const action = String(body.action ?? "create").trim();

    if (action === "create") {
      const title = normalizeTitle(body.title);
      const subtitle = normalizeBody(body.subtitle, 140);
      const communityBody = normalizeBody(body.body, 600);

      if (title.length < 3 || title.length > 60) {
        throw new Error("Community name must be 3-60 characters.");
      }

      if (subtitle.length < 10) {
        throw new Error("Add a short description for the community.");
      }

      if (communityBody.length < 10) {
        throw new Error("Add community details before creating it.");
      }

      const baseSlug = slugify(title);
      if (!baseSlug) {
        throw new Error("Community name needs letters or numbers.");
      }

      const { data: inserted, error: insertError } = await adminClient
        .from("custom_communities")
        .insert({
          slug: `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`,
          title,
          subtitle,
          body: communityBody,
          creator_user_id: user.id,
        })
        .select(COMMUNITY_SELECT)
        .single();

      if (insertError || !inserted) {
        throw new Error(insertError?.message ?? "Could not create community.");
      }

      return jsonResponse({ success: true, community: inserted });
    }

    const communityId = Number(body.communityId);
    if (!communityId || Number.isNaN(communityId)) {
      throw new Error("Community id is required.");
    }

    const community = await getCommunity(adminClient, communityId);

    if (action === "update") {
      assertCanManageCommunity(community, user.id, profile);

      const title = normalizeTitle(body.title);
      const subtitle = normalizeBody(body.subtitle, 140);
      const communityBody = normalizeBody(body.body, 600);

      if (title.length < 3 || title.length > 60 || subtitle.length < 10 || communityBody.length < 10) {
        throw new Error("Community name, description, and details are required.");
      }

      const { data, error } = await adminClient
        .from("custom_communities")
        .update({
          title,
          subtitle,
          body: communityBody,
          updated_at: new Date().toISOString(),
        })
        .eq("community_game_id", communityId)
        .select(COMMUNITY_SELECT)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({ success: true, community: data });
    }

    if (action === "hide") {
      if (!isStaff(profile)) {
        assertCanManageCommunity(community, user.id, profile);
      } else {
        assertStaff(profile);
      }

      const { error } = await adminClient
        .from("custom_communities")
        .update({
          moderation_state: "hidden",
          updated_at: new Date().toISOString(),
        })
        .eq("community_game_id", communityId);

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({ success: true });
    }

    if (action === "ban_user" || action === "unban_user") {
      assertCanManageCommunity(community, user.id, profile);

      const targetUserId = String(body.targetUserId ?? "").trim();
      if (!targetUserId) {
        throw new Error("Target user is required.");
      }

      if (targetUserId === community.creator_user_id) {
        throw new Error("The community creator cannot be banned from their community.");
      }

      if (action === "unban_user") {
        const { error } = await adminClient
          .from("custom_community_bans")
          .delete()
          .eq("community_id", community.id)
          .eq("user_id", targetUserId);

        if (error) {
          throw new Error(error.message);
        }

        return jsonResponse({ success: true });
      }

      const reason = normalizeBody(body.reason, 240) || null;
      const { error } = await adminClient.from("custom_community_bans").upsert({
        community_id: community.id,
        user_id: targetUserId,
        banned_by: user.id,
        reason,
      }, {
        onConflict: "community_id,user_id",
      });

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({ success: true });
    }

    throw new Error("Unsupported community action.");
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
