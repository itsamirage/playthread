import {
  assertActiveProfile,
  assertNoBannedSignals,
  corsHeaders,
  createModerationFlag,
  getAdminClient,
  getAuthenticatedUser,
  getRequestIpHash,
  jsonResponse,
  readJsonBody,
  requireProfile,
} from "../_shared/trusted.ts";
import { shouldAutoHideReportedContent } from "../../../lib/reportModeration.js";

const REPORT_AUTO_HIDE_LABEL = "multiple user reports";

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
    await assertNoBannedSignals(adminClient, request, user.id);

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
        .select("id, user_id, title, body, igdb_game_id, game_title, moderation_state, moderation_labels")
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
        .select("id, user_id, body, moderation_state, moderation_labels, posts(igdb_game_id, game_title)")
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
      flaggedByUserId: user.id,
      evidence: {
        reporter_user_id: user.id,
        request_ip_hash: requestIpHash,
      },
    });

    let autoHidden = false;

    if (contentType === "post" || contentType === "comment") {
      const { data: openReportRows, error: reportCountError } = await adminClient
        .from("moderation_flags")
        .select("flagged_by, evidence_json")
        .eq("content_type", contentType)
        .eq("content_id", contentId)
        .eq("origin", "manual")
        .eq("status", "open");

      if (reportCountError) {
        throw new Error(reportCountError.message);
      }

      if (shouldAutoHideReportedContent(openReportRows ?? [])) {
        const table = contentType === "post" ? "posts" : "post_comments";
        const { data: currentContent, error: currentContentError } = await adminClient
          .from(table)
          .select("moderation_state, moderation_labels")
          .eq("id", contentId)
          .maybeSingle();

        if (currentContentError) {
          throw new Error(currentContentError.message);
        }

        const labels = Array.isArray(currentContent?.moderation_labels)
          ? currentContent.moderation_labels
          : [];
        const nextLabels = labels.includes(REPORT_AUTO_HIDE_LABEL)
          ? labels
          : [...labels, REPORT_AUTO_HIDE_LABEL];

        if (currentContent?.moderation_state !== "hidden") {
          const { error: hideError } = await adminClient
            .from(table)
            .update({
              moderation_state: "hidden",
              moderation_labels: nextLabels,
            })
            .eq("id", contentId);

          if (hideError) {
            throw new Error(hideError.message);
          }

          const { error: actionError } = await adminClient.from("moderation_actions").insert({
            target_user_id: targetUserId,
            actor_user_id: user.id,
            action_type: "hide_content",
            reason: "Content was hidden pending moderator review after multiple user reports.",
            metadata_json: {
              contentType,
              contentId,
              reportThreshold: openReportRows?.length ?? 0,
              automatic: true,
            },
          });

          if (actionError) {
            throw new Error(actionError.message);
          }
        }

        autoHidden = true;
      }
    }

    return jsonResponse({ success: true, autoHidden });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
