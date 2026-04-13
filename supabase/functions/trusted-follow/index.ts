import {
  assertActiveProfile,
  corsHeaders,
  getAdminClient,
  getAuthenticatedUser,
  insertNotification,
  jsonResponse,
  readJsonBody,
  requireProfile,
} from "../_shared/trusted.ts";

type RequestBody = {
  action?: "follow" | "unfollow";
  targetUserId?: string;
};

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
    const actorProfile = await requireProfile(adminClient, user.id);
    assertActiveProfile(actorProfile);

    const body = await readJsonBody<RequestBody>(request);
    const action = body.action ?? "follow";
    const targetUserId = String(body.targetUserId ?? "").trim();

    if (!targetUserId) {
      throw new Error("Target user is required.");
    }

    if (targetUserId === user.id) {
      throw new Error("You cannot follow yourself.");
    }

    const targetProfile = await requireProfile(adminClient, targetUserId);

    if (action === "follow") {
      const { error } = await adminClient.from("user_follows").upsert(
        {
          follower_user_id: user.id,
          target_user_id: targetUserId,
        },
        {
          onConflict: "follower_user_id,target_user_id",
          ignoreDuplicates: true,
        },
      );

      if (error) {
        throw new Error(error.message);
      }

      const actorName =
        actorProfile.username ??
        "player";

      await insertNotification(adminClient, {
        userId: targetUserId,
        actorUserId: user.id,
        kind: "new_follower",
        title: "You have a new follower",
        body: `${actorName} followed your profile.`,
        entityType: "profile",
        entityId: user.id,
        metadata: {
          followerUserId: user.id,
          followerName: actorName,
        },
      });

      return jsonResponse({
        success: true,
        following: true,
        targetUserId: targetProfile.id,
      });
    }

    if (action === "unfollow") {
      const { error } = await adminClient
        .from("user_follows")
        .delete()
        .eq("follower_user_id", user.id)
        .eq("target_user_id", targetUserId);

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({
        success: true,
        following: false,
        targetUserId: targetProfile.id,
      });
    }

    throw new Error("Unsupported follow action.");
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
