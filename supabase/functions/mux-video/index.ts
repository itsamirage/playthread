import {
  assertActiveProfile,
  corsHeaders,
  getAdminClient,
  getAuthenticatedUser,
  hashValue,
  jsonResponse,
  getRequestIpHash,
  readJsonBody,
  recordIntegrityEvent,
  requireProfile,
} from "../_shared/trusted.ts";
import { createMuxDirectUpload } from "../_shared/mux.ts";

type RequestBody = {
  action?: "create_upload";
};

const DEFAULT_CLIP_UPLOADS_DISABLED = false;
const DEFAULT_CLIP_UPLOAD_COOLDOWN_MINUTES = 15;
const DEFAULT_CLIP_UPLOADS_PER_DAY = 4;
const DEFAULT_CLIP_UPLOADS_PER_30_DAYS = 12;

function createUploadToken() {
  return crypto.randomUUID();
}

function readBooleanEnv(name: string, fallback: boolean) {
  const rawValue = Deno.env.get(name);

  if (rawValue == null) {
    return fallback;
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalizedValue);
}

function readNumberEnv(name: string, fallback: number, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const rawValue = Deno.env.get(name);
  const parsedValue = Number(rawValue ?? fallback);

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsedValue)));
}

async function enforceClipUploadLimits({
  adminClient,
  userId,
}: {
  adminClient: ReturnType<typeof getAdminClient>;
  userId: string;
}) {
  if (readBooleanEnv("MUX_UPLOADS_DISABLED", DEFAULT_CLIP_UPLOADS_DISABLED)) {
    throw new Error("Clip uploads are temporarily disabled.");
  }

  const cooldownMinutes = readNumberEnv(
    "MUX_UPLOAD_COOLDOWN_MINUTES",
    DEFAULT_CLIP_UPLOAD_COOLDOWN_MINUTES,
    { min: 0, max: 24 * 60 },
  );
  const maxUploadsPerDay = readNumberEnv(
    "MUX_MAX_UPLOADS_PER_DAY",
    DEFAULT_CLIP_UPLOADS_PER_DAY,
    { min: 1, max: 100 },
  );
  const maxUploadsPer30Days = readNumberEnv(
    "MUX_MAX_UPLOADS_PER_30_DAYS",
    DEFAULT_CLIP_UPLOADS_PER_30_DAYS,
    { min: 1, max: 1000 },
  );

  const now = Date.now();
  const cooldownWindowStart = new Date(now - cooldownMinutes * 60 * 1000).toISOString();
  const dayWindowStart = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const monthWindowStart = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [cooldownResult, dailyResult, monthlyResult] = await Promise.all([
    adminClient
      .from("integrity_events")
      .select("created_at")
      .eq("user_id", userId)
      .eq("event_type", "clip_upload")
      .gte("created_at", cooldownWindowStart)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    adminClient
      .from("integrity_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "clip_upload")
      .gte("created_at", dayWindowStart),
    adminClient
      .from("integrity_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "clip_upload")
      .gte("created_at", monthWindowStart),
  ]);

  if (cooldownResult.error) {
    throw new Error(`Could not verify clip upload cooldown: ${cooldownResult.error.message}`);
  }

  if (dailyResult.error) {
    throw new Error(`Could not verify daily clip uploads: ${dailyResult.error.message}`);
  }

  if (monthlyResult.error) {
    throw new Error(`Could not verify monthly clip uploads: ${monthlyResult.error.message}`);
  }

  if (cooldownMinutes > 0 && cooldownResult.data?.created_at) {
    throw new Error(
      `Wait ${cooldownMinutes} minutes between clip uploads.`,
    );
  }

  if ((dailyResult.count ?? 0) >= maxUploadsPerDay) {
    throw new Error(`You have reached the limit of ${maxUploadsPerDay} clip uploads in 24 hours.`);
  }

  if ((monthlyResult.count ?? 0) >= maxUploadsPer30Days) {
    throw new Error(`You have reached the limit of ${maxUploadsPer30Days} clip uploads in 30 days.`);
  }

  return {
    cooldownMinutes,
    maxUploadsPerDay,
    maxUploadsPer30Days,
    uploadsToday: dailyResult.count ?? 0,
    uploadsLast30Days: monthlyResult.count ?? 0,
  };
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
    const body = await readJsonBody<RequestBody>(request);

    if ((body.action ?? "create_upload") !== "create_upload") {
      throw new Error("Unsupported video action.");
    }

    const limitSnapshot = await enforceClipUploadLimits({
      adminClient,
      userId: user.id,
    });

    const uploadToken = createUploadToken();
    const upload = await createMuxDirectUpload({
      passthrough: JSON.stringify({
        uploadToken,
        userId: user.id,
      }),
    });

    const requestIpHash =
      (await getRequestIpHash(request)) ?? (await hashValue(`clip-upload:${user.id}`));

    await recordIntegrityEvent(adminClient, {
      user_id: user.id,
      event_type: "clip_upload",
      request_ip_hash: requestIpHash,
      is_positive: false,
      metadata_json: {
        mux_upload_id: upload?.id ?? null,
        cooldown_minutes: limitSnapshot.cooldownMinutes,
        max_uploads_per_day: limitSnapshot.maxUploadsPerDay,
        max_uploads_per_30_days: limitSnapshot.maxUploadsPer30Days,
        uploads_today_before_create: limitSnapshot.uploadsToday,
        uploads_last_30_days_before_create: limitSnapshot.uploadsLast30Days,
      },
    });

    return jsonResponse({
      success: true,
      upload: {
        id: upload?.id ?? null,
        url: upload?.url ?? null,
        timeout: upload?.timeout ?? null,
        uploadToken,
      },
      limits: {
        cooldownMinutes: limitSnapshot.cooldownMinutes,
        maxUploadsPerDay: limitSnapshot.maxUploadsPerDay,
        maxUploadsPer30Days: limitSnapshot.maxUploadsPer30Days,
      },
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
