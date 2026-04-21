import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retention-secret",
};

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
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service credentials are not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function readRetentionDays(name: string, fallback: number, minimum: number) {
  const value = Number(Deno.env.get(name) ?? fallback);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(minimum, Math.round(value));
}

async function assertRetentionSecret(request: Request) {
  const expectedSecret = Deno.env.get("RETENTION_CRON_SECRET");

  if (!expectedSecret) {
    throw new Error("RETENTION_CRON_SECRET must be configured before scheduled retention can run.");
  }

  const providedSecret = request.headers.get("x-retention-secret") ?? "";

  if (providedSecret !== expectedSecret) {
    throw new Error("Invalid retention secret.");
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
    await assertRetentionSecret(request);

    const adminClient = getAdminClient();
    const integrityRetentionDays = readRetentionDays("INTEGRITY_RETENTION_DAYS", 90, 30);
    const moderationActionRetentionDays = readRetentionDays(
      "MODERATION_ACTION_RETENTION_DAYS",
      365,
      90,
    );
    const reportDays = readRetentionDays("INTEGRITY_REPORT_DAYS", 14, 1);

    const { data: retention, error: retentionError } = await adminClient.rpc(
      "prune_old_integrity_data",
      {
        integrity_retention_days: integrityRetentionDays,
        moderation_action_retention_days: moderationActionRetentionDays,
      },
    );

    if (retentionError) {
      throw new Error(retentionError.message);
    }

    const since = new Date(Date.now() - reportDays * 24 * 60 * 60 * 1000).toISOString();
    const { data: dailySummary, error: summaryError } = await adminClient
      .from("integrity_daily_summary")
      .select("summary_day, event_type, event_count")
      .gte("summary_day", since.slice(0, 10))
      .order("summary_day", { ascending: false });

    if (summaryError) {
      throw new Error(summaryError.message);
    }

    return jsonResponse({
      success: true,
      retention,
      settings: {
        integrityRetentionDays,
        moderationActionRetentionDays,
        reportDays,
      },
      dailySummary: dailySummary ?? [],
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
