import { createClient } from "jsr:@supabase/supabase-js@2";

import { buildMuxThumbnailUrl } from "../_shared/mux.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function readEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }

  return value;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getAdminClient() {
  return createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function assertWebhookToken(request: Request) {
  const expected = readEnv("MUX_WEBHOOK_TOKEN");
  const received = new URL(request.url).searchParams.get("token");

  if (!received || received !== expected) {
    throw new Error("Invalid webhook token.");
  }
}

function parsePassthrough(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    assertWebhookToken(request);
    const payload = await request.json();
    const eventType = String(payload?.type ?? "").trim();
    const data = payload?.data ?? {};
    const passthrough = parsePassthrough(data?.passthrough);
    const uploadToken = String(passthrough?.uploadToken ?? "").trim();

    if (!uploadToken) {
      return jsonResponse({ success: true, ignored: true });
    }

    const adminClient = getAdminClient();
    const playbackId = Array.isArray(data?.playback_ids) ? data.playback_ids[0]?.id ?? null : null;
    const assetId = String(data?.id ?? "").trim() || null;

    if (eventType === "video.asset.created") {
      const { error } = await adminClient
        .from("posts")
        .update({
          video_asset_id: assetId,
          video_playback_id: playbackId,
          video_status: playbackId ? "processing" : "uploading",
        })
        .eq("video_upload_token", uploadToken);

      if (error) {
        throw new Error(error.message);
      }
    }

    if (eventType === "video.asset.ready") {
      const { error } = await adminClient
        .from("posts")
        .update({
          video_asset_id: assetId,
          video_playback_id: playbackId,
          video_status: playbackId ? "ready" : "errored",
          video_thumbnail_url: playbackId ? buildMuxThumbnailUrl(playbackId) : null,
          video_duration_seconds: data?.duration ? Math.round(Number(data.duration)) : null,
        })
        .eq("video_upload_token", uploadToken);

      if (error) {
        throw new Error(error.message);
      }
    }

    if (eventType === "video.asset.errored") {
      const { error } = await adminClient
        .from("posts")
        .update({
          video_asset_id: assetId,
          video_status: "errored",
        })
        .eq("video_upload_token", uploadToken);

      if (error) {
        throw new Error(error.message);
      }
    }

    return jsonResponse({ success: true });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
