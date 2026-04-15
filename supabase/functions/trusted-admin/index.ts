import {
  assertAdmin,
  assertOwner,
  assertStaff,
  canAdministerTarget,
  corsHeaders,
  getAdminClient,
  getAuthenticatedUser,
  jsonResponse,
  readJsonBody,
  requireProfile,
} from "../_shared/trusted.ts";
import {
  assertCanModerateGameScope,
  clampIntegrityReportDays,
  sanitizeGameIds,
} from "../../../lib/adminModerationLogic.js";
import {
  processContentVisibilityUpdate,
  processRetentionPrune,
} from "../../../lib/trustedAdminService.js";

type RequestBody =
  | {
      action?: "set_flag_status";
      flagId?: string;
      status?: "open" | "reviewed" | "dismissed" | "actioned";
    }
  | {
      action?: "update_member_role";
      targetUserId?: string;
      accountRole?: "member" | "moderator" | "admin" | "owner";
      moderationScope?: "all" | "games";
      moderationGameIds?: number[];
    }
  | {
      action?: "set_ban_state";
      targetUserId?: string;
      isBanned?: boolean;
      bannedReason?: string | null;
    }
  | {
      action?: "update_integrity_settings";
      lookbackDays?: number;
      maxDistinctAccountsPerIp?: number;
      maxDistinctPositiveAccountsPerPost?: number;
      maxDistinctPositiveAccountsPerComment?: number;
      maxDistinctPositiveAccountsPerTarget?: number;
    }
  | {
      action?: "get_integrity_report";
      days?: number;
    }
  | {
      action?: "prune_integrity_data";
      integrityRetentionDays?: number;
      moderationActionRetentionDays?: number;
    }
  | {
      action?: "set_content_visibility";
      flagId?: string;
      visibility?: "clean" | "hidden";
    }
  | {
      action?: "update_post_metadata";
      postId?: string;
      type?: "discussion" | "review" | "screenshot" | "guide" | "tip" | "clip";
      pinnedHours?: number | null;
    }
  | {
      action?: "set_developer_games";
      targetUserId?: string;
      developerGameIds?: number[];
    };

const PROFILE_SELECT =
  "id, username, display_name, created_at, account_role, moderation_scope, moderation_game_ids, developer_game_ids, is_banned, banned_reason, integrity_exempt, coins_from_posts, coins_from_comments, coins_from_gifts, coins_from_adjustments, coins_spent, selected_name_color, selected_banner_style, selected_title_key";

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
    const body = await readJsonBody<RequestBody>(request);
    const action = body.action;

    if (action === "set_flag_status") {
      assertStaff(actorProfile);

      const flagId = String(body.flagId ?? "").trim();
      const status = String(body.status ?? "").trim();

      if (!flagId || !["open", "reviewed", "dismissed", "actioned"].includes(status)) {
        throw new Error("A valid flag id and status are required.");
      }

      const { data: flagRow, error: flagError } = await adminClient
        .from("moderation_flags")
        .select("id, user_id, status, category, origin, content_type, content_id, igdb_game_id")
        .eq("id", flagId)
        .maybeSingle();

      if (flagError) {
        throw new Error(flagError.message);
      }

      if (!flagRow) {
        throw new Error("That flag no longer exists.");
      }

      assertCanModerateGameScope(actorProfile, flagRow.igdb_game_id ?? null);

      const { error } = await adminClient
        .from("moderation_flags")
        .update({
          status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", flagId);

      if (error) {
        throw new Error(error.message);
      }

      const { error: actionError } = await adminClient.from("moderation_actions").insert({
        target_user_id: flagRow.user_id,
        actor_user_id: user.id,
        action_type: "review_flag",
        reason: `Flag moved from ${flagRow.status} to ${status}.`,
        metadata_json: {
          flagId,
          previousStatus: flagRow.status,
          nextStatus: status,
          category: flagRow.category,
          origin: flagRow.origin,
          contentType: flagRow.content_type,
          contentId: flagRow.content_id,
        },
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      return jsonResponse({ success: true });
    }

    if (action === "set_content_visibility") {
      assertStaff(actorProfile);

      const flagId = String(body.flagId ?? "").trim();
      if (!flagId) {
        throw new Error("A valid flag id and visibility are required.");
      }

      const { data: flagRow, error: flagError } = await adminClient
        .from("moderation_flags")
        .select("id, user_id, status, category, origin, content_type, content_id, igdb_game_id")
        .eq("id", flagId)
        .maybeSingle();

      if (flagError) {
        throw new Error(flagError.message);
      }

      if (!flagRow) {
        throw new Error("That flag no longer exists.");
      }

      assertCanModerateGameScope(actorProfile, flagRow.igdb_game_id ?? null);

      if (!flagRow.content_id) {
        throw new Error("That flagged item no longer has a target record.");
      }

      const result = await processContentVisibilityUpdate({
        adminClient,
        actorUserId: user.id,
        flagId,
        flagRow,
        visibility: body.visibility,
      });

      return jsonResponse({
        success: true,
        visibility: result.visibility,
        flagStatus: result.flagStatus,
      });
    }

    if (action === "update_member_role") {
      assertAdmin(actorProfile);

      const targetUserId = String(body.targetUserId ?? "").trim();
      const accountRole = String(body.accountRole ?? "").trim();
      const moderationScope = String(body.moderationScope ?? "all").trim();
      const moderationGameIds = moderationScope === "games" ? sanitizeGameIds(body.moderationGameIds) : [];

      if (!targetUserId) {
        throw new Error("Target user is required.");
      }

      if (!["member", "moderator", "admin", "owner"].includes(accountRole)) {
        throw new Error("Invalid account role.");
      }

      if (!["all", "games"].includes(moderationScope)) {
        throw new Error("Invalid moderation scope.");
      }

      if (accountRole === "owner") {
        assertOwner(actorProfile);
      }

      const targetProfile = await requireProfile(adminClient, targetUserId);

      if (!canAdministerTarget(actorProfile, targetProfile)) {
        throw new Error("You cannot manage that account.");
      }

      if (accountRole === "admin" && actorProfile.account_role !== "owner") {
        throw new Error("Only the owner can promote admins.");
      }

      const { data, error } = await adminClient
        .from("profiles")
        .update({
          account_role: accountRole,
          moderation_scope: moderationScope,
          moderation_game_ids: moderationGameIds,
        })
        .eq("id", targetUserId)
        .select(PROFILE_SELECT)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      const { error: actionError } = await adminClient.from("moderation_actions").insert({
        target_user_id: targetUserId,
        actor_user_id: user.id,
        action_type:
          accountRole === "admin"
            ? "promote_admin"
            : accountRole === "moderator" && targetProfile.account_role !== "moderator"
              ? "promote_moderator"
              : accountRole === targetProfile.account_role
                ? "set_scope"
                : "demote_moderator",
        metadata_json: {
          previousAccountRole: targetProfile.account_role,
          nextAccountRole: accountRole,
          previousModerationScope: targetProfile.moderation_scope ?? "all",
          nextModerationScope: moderationScope,
          previousModerationGameIds: targetProfile.moderation_game_ids ?? [],
          nextModerationGameIds: moderationGameIds,
        },
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      return jsonResponse({ success: true, profile: data });
    }

    if (action === "set_developer_games") {
      assertAdmin(actorProfile);

      const targetUserId = String(body.targetUserId ?? "").trim();
      const developerGameIds = sanitizeGameIds(body.developerGameIds);

      if (!targetUserId) {
        throw new Error("Target user is required.");
      }

      const targetProfile = await requireProfile(adminClient, targetUserId);

      if (!canAdministerTarget(actorProfile, targetProfile)) {
        throw new Error("You cannot manage that account.");
      }

      const { data, error } = await adminClient
        .from("profiles")
        .update({
          developer_game_ids: developerGameIds,
        })
        .eq("id", targetUserId)
        .select(PROFILE_SELECT)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      const { error: actionError } = await adminClient.from("moderation_actions").insert({
        target_user_id: targetUserId,
        actor_user_id: user.id,
        action_type: "set_developer_games",
        reason: developerGameIds.length > 0 ? "Updated developer-tag game assignments." : "Removed developer-tag game assignments.",
        metadata_json: {
          previousDeveloperGameIds: targetProfile.developer_game_ids ?? [],
          nextDeveloperGameIds: developerGameIds,
        },
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      return jsonResponse({ success: true, profile: data });
    }

    if (action === "set_ban_state") {
      assertAdmin(actorProfile);

      const targetUserId = String(body.targetUserId ?? "").trim();
      const isBanned = Boolean(body.isBanned);
      const bannedReason = String(body.bannedReason ?? "").trim() || null;

      if (!targetUserId) {
        throw new Error("Target user is required.");
      }

      const targetProfile = await requireProfile(adminClient, targetUserId);

      if (!canAdministerTarget(actorProfile, targetProfile)) {
        throw new Error("You cannot manage that account.");
      }

      const { data, error } = await adminClient
        .from("profiles")
        .update({
          is_banned: isBanned,
          banned_at: isBanned ? new Date().toISOString() : null,
          banned_reason: isBanned ? bannedReason : null,
        })
        .eq("id", targetUserId)
        .select(PROFILE_SELECT)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      const { error: actionError } = await adminClient.from("moderation_actions").insert({
        target_user_id: targetUserId,
        actor_user_id: user.id,
        action_type: isBanned ? "ban" : "restore",
        reason: bannedReason,
        metadata_json: {
          previousIsBanned: Boolean(targetProfile.is_banned),
          nextIsBanned: isBanned,
          previousReason: targetProfile.banned_reason ?? null,
          nextReason: bannedReason,
          targetAccountRole: targetProfile.account_role ?? "member",
        },
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      return jsonResponse({ success: true, profile: data });
    }

    if (action === "update_integrity_settings") {
      assertOwner(actorProfile);

      const { data: existingSettings } = await adminClient
        .from("integrity_settings")
        .select(
          "lookback_days, max_distinct_accounts_per_ip, max_distinct_positive_accounts_per_post, max_distinct_positive_accounts_per_comment, max_distinct_positive_accounts_per_target",
        )
        .eq("id", true)
        .maybeSingle();

      const lookbackDays = Math.max(1, Math.floor(Number(body.lookbackDays ?? 7)));
      const maxDistinctAccountsPerIp = Math.max(
        1,
        Math.floor(Number(body.maxDistinctAccountsPerIp ?? 5)),
      );
      const maxDistinctPositiveAccountsPerPost = Math.max(
        1,
        Math.floor(Number(body.maxDistinctPositiveAccountsPerPost ?? 3)),
      );
      const maxDistinctPositiveAccountsPerComment = Math.max(
        1,
        Math.floor(Number(body.maxDistinctPositiveAccountsPerComment ?? 3)),
      );
      const maxDistinctPositiveAccountsPerTarget = Math.max(
        1,
        Math.floor(Number(body.maxDistinctPositiveAccountsPerTarget ?? 4)),
      );

      const { data, error } = await adminClient
        .from("integrity_settings")
        .upsert({
          id: true,
          lookback_days: lookbackDays,
          max_distinct_accounts_per_ip: maxDistinctAccountsPerIp,
          max_distinct_positive_accounts_per_post: maxDistinctPositiveAccountsPerPost,
          max_distinct_positive_accounts_per_comment: maxDistinctPositiveAccountsPerComment,
          max_distinct_positive_accounts_per_target: maxDistinctPositiveAccountsPerTarget,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .select(
          "lookback_days, max_distinct_accounts_per_ip, max_distinct_positive_accounts_per_post, max_distinct_positive_accounts_per_comment, max_distinct_positive_accounts_per_target, updated_at",
        )
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      const { error: actionError } = await adminClient.from("moderation_actions").insert({
        target_user_id: user.id,
        actor_user_id: user.id,
        action_type: "update_integrity_settings",
        reason: "Updated integrity enforcement thresholds.",
        metadata_json: {
          previous: existingSettings ?? null,
          next: {
            lookback_days: lookbackDays,
            max_distinct_accounts_per_ip: maxDistinctAccountsPerIp,
            max_distinct_positive_accounts_per_post: maxDistinctPositiveAccountsPerPost,
            max_distinct_positive_accounts_per_comment: maxDistinctPositiveAccountsPerComment,
            max_distinct_positive_accounts_per_target: maxDistinctPositiveAccountsPerTarget,
          },
        },
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      return jsonResponse({ success: true, settings: data });
    }

    if (action === "update_post_metadata") {
      assertStaff(actorProfile);

      const postId = String(body.postId ?? "").trim();
      const nextType = String(body.type ?? "").trim();
      const pinnedHoursValue = body.pinnedHours == null ? null : Number(body.pinnedHours);

      if (!postId) {
        throw new Error("Post id is required.");
      }

      if (!["discussion", "review", "screenshot", "guide", "tip", "clip"].includes(nextType)) {
        throw new Error("Invalid post type.");
      }

      const { data: postRow, error: postError } = await adminClient
        .from("posts")
        .select("id, user_id, igdb_game_id, type, pinned_until")
        .eq("id", postId)
        .maybeSingle();

      if (postError) {
        throw new Error(postError.message);
      }

      if (!postRow) {
        throw new Error("That post no longer exists.");
      }

      assertCanModerateGameScope(actorProfile, postRow.igdb_game_id ?? null);

      const pinnedUntil =
        pinnedHoursValue && pinnedHoursValue > 0
          ? new Date(Date.now() + pinnedHoursValue * 60 * 60 * 1000).toISOString()
          : null;

      const { error: updateError } = await adminClient
        .from("posts")
        .update({
          type: nextType,
          pinned_until: pinnedUntil,
        })
        .eq("id", postId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      const actionType =
        nextType !== postRow.type ? "retag_post" : "pin_post";

      const { error: actionError } = await adminClient.from("moderation_actions").insert({
        target_user_id: postRow.user_id,
        actor_user_id: user.id,
        action_type: actionType,
        reason: nextType !== postRow.type ? "Moderator updated the thread tag." : "Moderator updated post pin state.",
        metadata_json: {
          postId,
          previousType: postRow.type,
          nextType,
          previousPinnedUntil: postRow.pinned_until ?? null,
          nextPinnedUntil: pinnedUntil,
        },
      });

      if (actionError) {
        throw new Error(actionError.message);
      }

      return jsonResponse({
        success: true,
        postId,
        type: nextType,
        pinnedUntil,
      });
    }

    if (action === "get_integrity_report") {
      assertStaff(actorProfile);

      const days = clampIntegrityReportDays(body.days);
      const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const [
        { data: dailySummary, error: dailyError },
        { data: blockedSummary, error: blockedError },
      ] = await Promise.all([
        adminClient
          .from("integrity_daily_summary")
          .select(
            "summary_day, event_type, event_count, positive_count, distinct_actor_count, distinct_target_count, distinct_network_count",
          )
          .gte("summary_day", windowStart)
          .order("summary_day", { ascending: false }),
        adminClient
          .from("integrity_blocked_daily_summary")
          .select(
            "summary_day, blocked_event_type, blocked_count, distinct_actor_count, distinct_network_count",
          )
          .gte("summary_day", windowStart)
          .order("summary_day", { ascending: false }),
      ]);

      if (dailyError) {
        throw new Error(dailyError.message);
      }

      if (blockedError) {
        throw new Error(blockedError.message);
      }

      return jsonResponse({
        success: true,
        report: {
          days,
          dailySummary: dailySummary ?? [],
          blockedSummary: blockedSummary ?? [],
        },
      });
    }

    if (action === "prune_integrity_data") {
      assertOwner(actorProfile);

      const result = await processRetentionPrune({
        adminClient,
        actorUserId: user.id,
        input: {
          integrityRetentionDays: body.integrityRetentionDays,
          moderationActionRetentionDays: body.moderationActionRetentionDays,
        },
      });

      return jsonResponse({
        success: true,
        retention: result.retention,
        result: result.result,
      });
    }

    throw new Error("Unsupported admin action.");
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
