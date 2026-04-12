import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SMOKE_EMAIL = process.env.SMOKE_EMAIL;
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD;

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }

  return value;
}

function createSmokeClient() {
  return createClient(
    requireEnv("EXPO_PUBLIC_SUPABASE_URL", SUPABASE_URL),
    requireEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

async function signIn(client) {
  const { data, error } = await client.auth.signInWithPassword({
    email: requireEnv("SMOKE_EMAIL", SMOKE_EMAIL),
    password: requireEnv("SMOKE_PASSWORD", SMOKE_PASSWORD),
  });

  if (error || !data.session?.access_token) {
    throw new Error(`Sign-in failed: ${JSON.stringify(error ?? data)}`);
  }

  return data;
}

async function invokeFunction(client, functionName, body) {
  const { data, error } = await client.functions.invoke(functionName, {
    body,
  });

  if (error) {
    throw new Error(`${functionName} failed: ${error.message}`);
  }

  if (data?.error) {
    throw new Error(`${functionName} failed: ${data.error}`);
  }

  return data;
}

async function main() {
  requireEnv("EXPO_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  requireEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);
  requireEnv("SMOKE_EMAIL", SMOKE_EMAIL);
  requireEnv("SMOKE_PASSWORD", SMOKE_PASSWORD);

  const client = createSmokeClient();
  const signInResult = await signIn(client);

  const profileResult = await invokeFunction(client, "trusted-profile", {
    action: "update_identity",
    displayName: "player1",
    bio: "Smoke check from deployed function harness.",
    avatarUrl: "",
  });

  let reportResult = null;
  let trustedAdminError = null;

  try {
    reportResult = await invokeFunction(client, "trusted-admin", {
      action: "get_integrity_report",
      days: 14,
    });
  } catch (error) {
    trustedAdminError = error instanceof Error ? error.message : String(error);
  }

  console.log(JSON.stringify({
    signedInUserId: signInResult.user?.id ?? null,
    trustedProfile: {
      success: Boolean(profileResult?.success),
      profileId: profileResult?.profile?.id ?? null,
      moderation: profileResult?.moderation ?? null,
    },
    trustedAdmin: {
      success: Boolean(reportResult?.success),
      error: trustedAdminError,
      days: reportResult?.report?.days ?? null,
      dailySummaryRows: Array.isArray(reportResult?.report?.dailySummary)
        ? reportResult.report.dailySummary.length
        : null,
      blockedSummaryRows: Array.isArray(reportResult?.report?.blockedSummary)
        ? reportResult.report.blockedSummary.length
        : null,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
