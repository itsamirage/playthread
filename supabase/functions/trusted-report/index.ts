import {
  assertActiveProfile,
  corsHeaders,
  createModerationFlag,
  getAdminClient,
  getAuthenticatedUser,
  getRequestIpHash,
  jsonResponse,
  readJsonBody,
  requireProfile,
} from "../_shared/trusted.ts";

type RequestBody = {
  contentType?: "post" | "comment" | "profile";
  contentId?: string;
  reason?: string;
  category?: "hate" | "abuse" | "nudity" | "integrity";
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
    const profile = await requireProfile(adminClient, user.id);
    assertActiveProfile(profile);

    const body = await readJsonBody<RequestBody>(request);
    const contentType = body.contentType;
    const contentId = String(body.contentId ?? "").trim();
    const reason = String(body.reason ?? "").trim();
    const category = body.category ?? "abuse";

    if (!["post", "comment", "profile"].includes(String(contentType))) {
      throw new Error("Choose a valid report type.");
    }

    if (!contentId) {
      throw new Error("Report target is required.");
    }

    if (reason.length < 6) {
      throw new Error("Add a short reason for the report.");
    }

    let targetUserId: string | null = null;
    let excerpt = "";
    let gameId: number | null = null;
    let gameTitle: string | null = null;

    if (contentType === "post") {
      const { data, error } = await adminClient
        .from("posts")
        .select("id, user_id, title, body, igdb_game_id, game_title")
        .eq("id", contentId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) throw new Error("That post no longer exists.");

      targetUserId = data.user_id;
      excerpt = `${data.title ?? ""} ${data.body ?? ""}`.trim();
      gameId = data.igdb_game_id ?? null;
      gameTitle = data.game_title ?? null;
    } else if (contentType === "comment") {
      const { data, error } = await adminClient
        .from("post_comments")
        .select("id, user_id, body, posts(igdb_game_id, game_title)")
        .eq("id", contentId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) throw new Error("That comment no longer exists.");

      targetUserId = data.user_id;
      excerpt = data.body ?? "";
      gameId = data.posts?.igdb_game_id ?? null;
      gameTitle = data.posts?.game_title ?? null;
    } else {
      const { data, error } = await adminClient
        .from("profiles")
        .select("id, username, display_name, bio")
        .eq("id", contentId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) throw new Error("That profile no longer exists.");

      targetUserId = data.id;
      excerpt = `${data.display_name ?? data.username ?? ""} ${data.bio ?? ""}`.trim();
    }

    if (!targetUserId) {
      throw new Error("Report target is missing an owner.");
    }

    const requestIpHash = await getRequestIpHash(request);

    await createModerationFlag(adminClient, {
      contentType,
      contentId,
      userId: targetUserId,
      category,
      labels: ["user report"],
      reason,
      contentExcerpt: excerpt,
      igdbGameId: gameId,
      gameTitle,
      origin: "manual",
      evidence: {
        reporter_user_id: user.id,
        request_ip_hash: requestIpHash,
      },
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
