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

async function readJson(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

async function signIn() {
  const response = await fetch(`${requireEnv("EXPO_PUBLIC_SUPABASE_URL", SUPABASE_URL)}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: requireEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: requireEnv("SMOKE_EMAIL", SMOKE_EMAIL),
      password: requireEnv("SMOKE_PASSWORD", SMOKE_PASSWORD),
    }),
  });

  const payload = await readJson(response);

  if (!response.ok || !payload?.access_token) {
    throw new Error(`Sign-in failed: ${JSON.stringify(payload)}`);
  }

  return payload.access_token;
}

async function invokeFunction(functionName, accessToken, body) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(`${functionName} failed: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function main() {
  requireEnv("EXPO_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  requireEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);
  requireEnv("SMOKE_EMAIL", SMOKE_EMAIL);
  requireEnv("SMOKE_PASSWORD", SMOKE_PASSWORD);

  const accessToken = await signIn();

  const profileResult = await invokeFunction("trusted-profile", accessToken, {
    action: "update_identity",
    displayName: "player1",
    bio: "Smoke check from deployed function harness.",
    avatarUrl: "",
  });

  const reportResult = await invokeFunction("trusted-admin", accessToken, {
    action: "get_integrity_report",
    days: 14,
  });

  console.log(JSON.stringify({
    trustedProfile: {
      success: Boolean(profileResult?.success),
      profileId: profileResult?.profile?.id ?? null,
      moderation: profileResult?.moderation ?? null,
    },
    trustedAdmin: {
      success: Boolean(reportResult?.success),
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
