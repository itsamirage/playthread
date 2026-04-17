import {
  assertActiveProfile,
  assertAdmin,
  corsHeaders,
  enforceIntegrityCheck,
  getAdminClient,
  getAuthenticatedUser,
  getAvailableCoins,
  getRequestIpHash,
  insertNotification,
  jsonResponse,
  readJsonBody,
  recordIntegrityEvent,
  requireProfile,
} from "../_shared/trusted.ts";

type RequestBody = {
  action?: "gift" | "adjust" | "redeem_store_item";
  toUserId?: string;
  targetUserId?: string;
  amount?: number;
  isAnonymous?: boolean;
  note?: string | null;
  itemId?: string;
  itemType?: "name_color" | "banner_style";
  itemValue?: string;
  itemCost?: number;
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
    const action = body.action;
    const ipHash = await getRequestIpHash(request);

    if (action === "gift") {
      const toUserId = String(body.toUserId ?? "").trim();
      const amount = Math.max(1, Math.floor(Number(body.amount ?? 0)));
      const note = String(body.note ?? "").trim() || null;

      if (!toUserId) {
        throw new Error("Recipient is required.");
      }

      if (toUserId === user.id) {
        throw new Error("You cannot gift coins to yourself.");
      }

      if (getAvailableCoins(actorProfile) < amount) {
        throw new Error("Not enough coins to send that gift.");
      }

      // Daily gift cap — prevent spam gifting
      const DAILY_GIFT_LIMIT = 500;
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const { data: todayGifts } = await adminClient
        .from("coin_transactions")
        .select("amount")
        .eq("user_id", user.id)
        .eq("entry_type", "gift_sent")
        .gte("created_at", todayStart.toISOString());

      const sentToday = (todayGifts ?? []).reduce((sum: number, tx: { amount: number }) => sum + Math.abs(tx.amount), 0);
      if (sentToday + amount > DAILY_GIFT_LIMIT) {
        throw new Error(`Daily gift limit of ${DAILY_GIFT_LIMIT} coins reached. You've sent ${sentToday} coins today.`);
      }

      await requireProfile(adminClient, toUserId);

      const { requestIpHash } = await enforceIntegrityCheck({
        request,
        adminClient,
        profile: actorProfile,
        eventType: "coin_gift",
        targetUserId: toUserId,
        metadata: {
          amount,
          is_anonymous: Boolean(body.isAnonymous),
        },
      });

      const giftId = crypto.randomUUID();
      const { error } = await adminClient.from("coin_transactions").insert([
        {
          user_id: user.id,
          actor_user_id: user.id,
          counterparty_user_id: toUserId,
          entry_type: "gift_sent",
          amount: -amount,
          source_key: `gift:sent:${giftId}`,
          is_anonymous: Boolean(body.isAnonymous),
          note,
          metadata_json: {
            giftId,
            request_ip_hash: requestIpHash ?? ipHash,
          },
        },
        {
          user_id: toUserId,
          actor_user_id: user.id,
          counterparty_user_id: user.id,
          entry_type: "gift_received",
          amount,
          source_key: `gift:received:${giftId}`,
          is_anonymous: Boolean(body.isAnonymous),
          note,
          metadata_json: {
            giftId,
            request_ip_hash: requestIpHash ?? ipHash,
          },
        },
      ]);

      if (error) {
        throw new Error(error.message);
      }

      if (requestIpHash) {
        await recordIntegrityEvent(adminClient, {
          user_id: user.id,
          event_type: "coin_gift",
          target_user_id: toUserId,
          request_ip_hash: requestIpHash,
          is_positive: false,
          metadata_json: {
            amount,
            is_anonymous: Boolean(body.isAnonymous),
          },
        });
      }

      await insertNotification(adminClient, {
        userId: toUserId,
        actorUserId: user.id,
        kind: "coin_gift_received",
        title: "You received coins",
        body: `${amount} coins${note ? ` • ${note}` : ""}`,
        entityType: "coin_gift",
        entityId: giftId,
        metadata: {
          amount,
          isAnonymous: Boolean(body.isAnonymous),
        },
      });

      return jsonResponse({ success: true });
    }

    if (action === "adjust") {
      assertAdmin(actorProfile);

      const targetUserId = String(body.targetUserId ?? "").trim();
      const amount = Math.trunc(Number(body.amount ?? 0));
      const note = String(body.note ?? "").trim() || null;

      if (!targetUserId) {
        throw new Error("Target user is required.");
      }

      if (!amount) {
        throw new Error("Adjustment amount must not be zero.");
      }

      await requireProfile(adminClient, targetUserId);

      const { error } = await adminClient.from("coin_transactions").insert({
        user_id: targetUserId,
        actor_user_id: user.id,
        counterparty_user_id: user.id,
        entry_type: "admin_adjustment",
        amount,
        source_key: `admin-adjustment:${crypto.randomUUID()}`,
        note,
        metadata_json: {
          adjustment: amount,
          request_ip_hash: ipHash,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (ipHash) {
        await recordIntegrityEvent(adminClient, {
          user_id: user.id,
          event_type: "coin_adjustment",
          target_user_id: targetUserId,
          request_ip_hash: ipHash,
          is_positive: false,
          metadata_json: {
            adjustment: amount,
          },
        });
      }

      return jsonResponse({ success: true });
    }

    if (action === "redeem_store_item") {
      const itemId = String(body.itemId ?? "").trim();
      const itemType = String(body.itemType ?? "").trim();
      const itemValue = String(body.itemValue ?? "").trim();
      const itemCost = Math.max(1, Math.floor(Number(body.itemCost ?? 0)));
      const note = String(body.note ?? "").trim() || null;

      if (!itemId || !itemType || !itemValue || !itemCost) {
        throw new Error("Store item details are required.");
      }

      if (!["name_color", "banner_style"].includes(itemType)) {
        throw new Error("Unsupported store item.");
      }

      if (getAvailableCoins(actorProfile) < itemCost) {
        throw new Error("Not enough coins.");
      }

      const updatePayload =
        itemType === "name_color"
          ? { selected_name_color: itemValue }
          : { selected_banner_style: itemValue };

      const spendId = crypto.randomUUID();
      const { error: transactionError } = await adminClient.from("coin_transactions").insert({
        user_id: user.id,
        actor_user_id: user.id,
        counterparty_user_id: null,
        entry_type: "store_spend",
        amount: -Math.abs(itemCost),
        source_key: `store:${itemId}:${spendId}`,
        note,
        metadata_json: {
          itemId,
          itemType,
          itemValue,
          request_ip_hash: ipHash,
        },
      });

      if (transactionError) {
        throw new Error(transactionError.message);
      }

      const { data: profileRow, error } = await adminClient
        .from("profiles")
        .update(updatePayload)
        .eq("id", user.id)
        .select(
          "id, username, display_name, created_at, account_role, moderation_scope, moderation_game_ids, is_banned, banned_reason, integrity_exempt, coins_from_posts, coins_from_comments, coins_from_gifts, coins_from_adjustments, coins_spent, selected_name_color, selected_banner_style, selected_title_key",
        )
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (ipHash) {
        await recordIntegrityEvent(adminClient, {
          user_id: user.id,
          event_type: "store_spend",
          request_ip_hash: ipHash,
          is_positive: false,
          metadata_json: {
            itemId,
            itemType,
            itemValue,
            itemCost,
          },
        });
      }

      return jsonResponse({
        success: true,
        profile: profileRow,
      });
    }

    throw new Error("Unsupported coin action.");
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
