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
  action?: "request" | "cancel" | "accept" | "decline" | "remove";
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
    const action = body.action ?? "request";
    const targetUserId = String(body.targetUserId ?? "").trim();

    if (!targetUserId) {
      throw new Error("Target user is required.");
    }

    if (targetUserId === user.id) {
      throw new Error("You cannot add yourself as a friend.");
    }

    const targetProfile = await requireProfile(adminClient, targetUserId);
    const actorName = actorProfile.username ?? "player";
    const targetName = targetProfile.username ?? "player";

    const { data: existingFriendship, error: existingFriendshipError } = await adminClient
      .from("user_friendships")
      .select("id, requester_user_id, addressee_user_id, status")
      .or(
        `and(requester_user_id.eq.${user.id},addressee_user_id.eq.${targetUserId}),and(requester_user_id.eq.${targetUserId},addressee_user_id.eq.${user.id})`,
      )
      .maybeSingle();

    if (existingFriendshipError) {
      throw new Error(existingFriendshipError.message);
    }

    if (action === "request") {
      if (existingFriendship?.status === "accepted") {
        return jsonResponse({
          success: true,
          friendshipStatus: "friends",
          targetUserId: targetProfile.id,
        });
      }

      if (
        existingFriendship?.status === "pending" &&
        existingFriendship.requester_user_id === user.id
      ) {
        return jsonResponse({
          success: true,
          friendshipStatus: "outgoing",
          targetUserId: targetProfile.id,
        });
      }

      if (
        existingFriendship?.status === "pending" &&
        existingFriendship.requester_user_id === targetUserId &&
        existingFriendship.addressee_user_id === user.id
      ) {
        const { error } = await adminClient
          .from("user_friendships")
          .update({
            status: "accepted",
          })
          .eq("id", existingFriendship.id);

        if (error) {
          throw new Error(error.message);
        }

        await insertNotification(adminClient, {
          userId: targetUserId,
          actorUserId: user.id,
          kind: "friend_accept",
          title: "Friend request accepted",
          body: `${actorName} accepted your friend request.`,
          entityType: "profile",
          entityId: user.id,
          metadata: {
            friendUserId: user.id,
            friendName: actorName,
          },
        });

        return jsonResponse({
          success: true,
          friendshipStatus: "friends",
          targetUserId: targetProfile.id,
        });
      }

      const { error } = await adminClient.from("user_friendships").insert({
        requester_user_id: user.id,
        addressee_user_id: targetUserId,
        status: "pending",
      });

      if (error) {
        throw new Error(error.message);
      }

      await insertNotification(adminClient, {
        userId: targetUserId,
        actorUserId: user.id,
        kind: "friend_request",
        title: "New friend request",
        body: `${actorName} wants to be your friend.`,
        entityType: "profile",
        entityId: user.id,
        metadata: {
          requesterUserId: user.id,
          requesterName: actorName,
        },
      });

      return jsonResponse({
        success: true,
        friendshipStatus: "outgoing",
        targetUserId: targetProfile.id,
      });
    }

    if (action === "cancel") {
      if (
        existingFriendship?.status !== "pending" ||
        existingFriendship.requester_user_id !== user.id
      ) {
        return jsonResponse({
          success: true,
          friendshipStatus: existingFriendship?.status === "accepted" ? "friends" : "none",
          targetUserId: targetProfile.id,
        });
      }

      const { error } = await adminClient.from("user_friendships").delete().eq("id", existingFriendship.id);

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({
        success: true,
        friendshipStatus: "none",
        targetUserId: targetProfile.id,
      });
    }

    if (action === "decline") {
      if (
        existingFriendship?.status !== "pending" ||
        existingFriendship.requester_user_id !== targetUserId ||
        existingFriendship.addressee_user_id !== user.id
      ) {
        return jsonResponse({
          success: true,
          friendshipStatus: existingFriendship?.status === "accepted" ? "friends" : "none",
          targetUserId: targetProfile.id,
        });
      }

      const { error } = await adminClient.from("user_friendships").delete().eq("id", existingFriendship.id);

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({
        success: true,
        friendshipStatus: "none",
        targetUserId: targetProfile.id,
      });
    }

    if (action === "accept") {
      if (
        existingFriendship?.status !== "pending" ||
        existingFriendship.requester_user_id !== targetUserId ||
        existingFriendship.addressee_user_id !== user.id
      ) {
        throw new Error("That friend request is no longer available.");
      }

      const { error } = await adminClient
        .from("user_friendships")
        .update({
          status: "accepted",
        })
        .eq("id", existingFriendship.id);

      if (error) {
        throw new Error(error.message);
      }

      await insertNotification(adminClient, {
        userId: targetUserId,
        actorUserId: user.id,
        kind: "friend_accept",
        title: "Friend request accepted",
        body: `${actorName} accepted your friend request.`,
        entityType: "profile",
        entityId: user.id,
        metadata: {
          friendUserId: user.id,
          friendName: actorName,
        },
      });

      return jsonResponse({
        success: true,
        friendshipStatus: "friends",
        targetUserId: targetProfile.id,
      });
    }

    if (action === "remove") {
      if (!existingFriendship) {
        return jsonResponse({
          success: true,
          friendshipStatus: "none",
          targetUserId: targetProfile.id,
        });
      }

      const { error } = await adminClient
        .from("user_friendships")
        .delete()
        .eq("id", existingFriendship.id);

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({
        success: true,
        friendshipStatus: "none",
        targetUserId: targetProfile.id,
      });
    }

    throw new Error(`Unsupported friendship action for ${targetName}.`);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
