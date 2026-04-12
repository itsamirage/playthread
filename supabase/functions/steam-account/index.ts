import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STEAM_API_URL = "https://api.steampowered.com";
const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";
const STEAM_HEADER_IMAGE_URL = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";
const MAX_ACHIEVEMENT_SYNC_GAMES = 5;
const MAX_SHOWCASE_ITEMS = 3;
const OPENID_STATE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_ALLOWED_REDIRECT_PATTERNS = [
  "playthread://*",
  "exp://*",
  "exps://*",
  "http://localhost:*",
  "https://localhost:*",
  "http://127.0.0.1:*",
  "https://127.0.0.1:*",
  "http://[::1]:*",
  "https://[::1]:*",
];

type RequestBody = {
  action?: "start" | "sync" | "sync_game" | "unlink";
  redirectUrl?: string;
  appId?: string | number;
};

type JsonRecord = Record<string, unknown>;

type SteamProfile = {
  steamId64: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string;
  customUrl: string | null;
  visibilityState: string | null;
  memberSince: string | null;
};

type SteamOwnedGame = {
  appid: number;
  name?: string;
  playtime_forever?: number;
  playtime_windows_forever?: number;
  playtime_mac_forever?: number;
  playtime_linux_forever?: number;
  rtime_last_played?: number;
  img_icon_url?: string;
  has_community_visible_stats?: boolean;
};

type SteamAchievementSchemaEntry = {
  name?: string;
  defaultvalue?: number;
  displayName?: string;
  hidden?: number;
  description?: string;
  icon?: string;
  icongray?: string;
};

type SteamPlayerAchievement = {
  apiname?: string;
  achieved?: number;
  unlocktime?: number;
};

type NormalizedGame = {
  provider: "steam";
  provider_game_id: string;
  title: string;
  cover_url: string | null;
  platform: "steam";
  metadata_json: JsonRecord;
};

type NormalizedGameStat = {
  user_id: string;
  provider: "steam";
  provider_game_id: string;
  completion_percent: number | null;
  completed_achievement_count: number;
  total_achievement_count: number;
  last_synced_at: string;
  metadata_json: JsonRecord;
  updated_at: string;
};

type NormalizedAchievement = {
  user_id: string;
  provider: "steam";
  provider_game_id: string;
  provider_achievement_id: string;
  title: string;
  description: string | null;
  icon_url: string | null;
  is_unlocked: boolean;
  unlocked_at: string | null;
  rarity_percent: number | null;
  last_synced_at: string;
  metadata_json: JsonRecord;
  updated_at: string;
};

type ShowcaseItem = {
  user_id: string;
  kind: "game" | "achievement";
  provider: "steam";
  provider_game_id: string | null;
  provider_achievement_id: string | null;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  metadata_json: JsonRecord;
  position: number;
  updated_at: string;
};

type AchievementSyncResult = {
  game: SteamOwnedGame;
  stat: NormalizedGameStat;
  achievements: NormalizedAchievement[];
};

type OpenIdState = {
  userId: string;
  redirectUrl: string;
  issuedAt: number;
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

function readEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }

  return value;
}

function readOptionalEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  return value ? value : null;
}

function getAdminClient() {
  const supabaseUrl = readEnv("SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getTagValue(xml: string, tag: string) {
  const cdataMatch = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[(.*?)\\]\\]><\\/${tag}>`, "is"));

  if (cdataMatch?.[1]) {
    return cdataMatch[1].trim();
  }

  const tagMatch = xml.match(new RegExp(`<${tag}>(.*?)<\\/${tag}>`, "is"));
  return tagMatch?.[1]?.trim() ?? null;
}

function normalizeIdentifier(input: string) {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    throw new Error("Enter a Steam vanity URL, profile URL, or SteamID64.");
  }

  const profileMatch = trimmedInput.match(/steamcommunity\.com\/profiles\/(\d{17})/i);

  if (profileMatch?.[1]) {
    return {
      type: "steamid64" as const,
      value: profileMatch[1],
    };
  }

  const vanityMatch = trimmedInput.match(/steamcommunity\.com\/id\/([^/?#]+)/i);

  if (vanityMatch?.[1]) {
    return {
      type: "vanity" as const,
      value: vanityMatch[1],
    };
  }

  if (/^\d{17}$/.test(trimmedInput)) {
    return {
      type: "steamid64" as const,
      value: trimmedInput,
    };
  }

  const cleanedVanity = trimmedInput.replace(/^@/, "").replace(/^\/+|\/+$/g, "");

  if (!/^[A-Za-z0-9_-]{2,64}$/.test(cleanedVanity)) {
    throw new Error("That Steam identifier does not look valid.");
  }

  return {
    type: "vanity" as const,
    value: cleanedVanity,
  };
}

function toInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function roundPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function toIsoDateFromUnix(value: number | undefined) {
  if (!value || value <= 0) {
    return null;
  }

  return new Date(value * 1000).toISOString();
}

function buildSteamHeaderImageUrl(appId: number) {
  return `${STEAM_HEADER_IMAGE_URL}/${appId}/header.jpg`;
}

function buildSteamIconUrl(appId: number, iconHash: string | undefined) {
  if (!iconHash) {
    return null;
  }

  return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${iconHash}.jpg`;
}

function encodeBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return atob(`${normalized}${padding}`);
}

async function signValue(value: string) {
  const secret = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  const bytes = new Uint8Array(signature);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return encodeBase64Url(binary);
}

async function createSignedStateToken(state: OpenIdState) {
  const payload = encodeBase64Url(JSON.stringify(state));
  const signature = await signValue(payload);
  return `${payload}.${signature}`;
}

async function verifySignedStateToken(token: string | null) {
  if (!token) {
    throw new Error("Missing Steam OpenID state.");
  }

  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    throw new Error("Invalid Steam OpenID state.");
  }

  const expectedSignature = await signValue(payload);

  if (signature !== expectedSignature) {
    throw new Error("Steam OpenID state signature is invalid.");
  }

  const state = JSON.parse(decodeBase64Url(payload)) as OpenIdState;

  if (!state.userId || !state.redirectUrl || !state.issuedAt) {
    throw new Error("Steam OpenID state is incomplete.");
  }

  if (Date.now() - state.issuedAt > OPENID_STATE_TTL_MS) {
    throw new Error("Steam OpenID state expired. Start the link flow again.");
  }

  return state;
}

function parseConfiguredList(value: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function escapeRegExp(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function matchesWildcardPattern(value: string, pattern: string) {
  const expression = `^${escapeRegExp(pattern).replace(/\*/g, ".*")}$`;
  return new RegExp(expression, "i").test(value);
}

function normalizeUrlString(rawUrl: string) {
  const normalizedUrl = new URL(rawUrl.trim());
  normalizedUrl.hash = "";
  return normalizedUrl.toString();
}

function getAllowedRedirectPatterns() {
  return [
    ...DEFAULT_ALLOWED_REDIRECT_PATTERNS,
    ...parseConfiguredList(readOptionalEnv("STEAM_OPENID_ALLOWED_REDIRECTS")),
  ];
}

function assertAllowedRedirectUrl(redirectUrl: string) {
  let normalizedRedirectUrl: string;

  try {
    normalizedRedirectUrl = normalizeUrlString(redirectUrl);
  } catch (_error) {
    throw new Error("Steam OpenID redirect URL is invalid.");
  }

  const isAllowed = getAllowedRedirectPatterns().some((pattern) =>
    matchesWildcardPattern(normalizedRedirectUrl, pattern),
  );

  if (!isAllowed) {
    throw new Error("Steam OpenID redirect URL is not allowlisted.");
  }

  return normalizedRedirectUrl;
}

function getOpenIdCallbackBaseUrl() {
  const configuredCallbackUrl = readOptionalEnv("STEAM_OPENID_CALLBACK_URL");

  if (configuredCallbackUrl) {
    return normalizeUrlString(configuredCallbackUrl);
  }

  const supabaseUrl = readEnv("SUPABASE_URL");
  return normalizeUrlString(`${supabaseUrl}/functions/v1/steam-account`);
}

function getOpenIdRealmUrl() {
  const configuredRealmUrl = readOptionalEnv("STEAM_OPENID_REALM_URL");

  if (configuredRealmUrl) {
    return new URL(configuredRealmUrl).origin;
  }

  return new URL(getOpenIdCallbackBaseUrl()).origin;
}

function buildCallbackUrl(stateToken: string) {
  const callbackUrl = new URL(getOpenIdCallbackBaseUrl());
  callbackUrl.searchParams.set("state", stateToken);
  return callbackUrl.toString();
}

function buildSteamOpenIdUrl(callbackUrl: string) {
  const realm = getOpenIdRealmUrl();
  const authUrl = new URL(STEAM_OPENID_URL);

  authUrl.searchParams.set("openid.ns", "http://specs.openid.net/auth/2.0");
  authUrl.searchParams.set("openid.mode", "checkid_setup");
  authUrl.searchParams.set(
    "openid.claimed_id",
    "http://specs.openid.net/auth/2.0/identifier_select",
  );
  authUrl.searchParams.set(
    "openid.identity",
    "http://specs.openid.net/auth/2.0/identifier_select",
  );
  authUrl.searchParams.set("openid.return_to", callbackUrl);
  authUrl.searchParams.set("openid.realm", realm);

  return authUrl.toString();
}

async function verifySteamOpenIdAssertion(callbackRequestUrl: URL) {
  const verificationBody = new URLSearchParams();

  callbackRequestUrl.searchParams.forEach((value, key) => {
    if (key.startsWith("openid.")) {
      verificationBody.set(key, value);
    }
  });

  verificationBody.set("openid.mode", "check_authentication");

  const response = await fetch(STEAM_OPENID_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: verificationBody.toString(),
  });

  if (!response.ok) {
    throw new Error(`Steam OpenID verification failed (${response.status}).`);
  }

  const text = await response.text();

  if (!text.includes("is_valid:true")) {
    throw new Error("Steam OpenID verification was rejected.");
  }
}

function extractSteamIdFromClaimedId(callbackRequestUrl: URL) {
  const claimedId =
    callbackRequestUrl.searchParams.get("openid.claimed_id") ??
    callbackRequestUrl.searchParams.get("openid.identity");
  const match = claimedId?.match(/\/openid\/id\/(\d{17})$/);

  if (!match?.[1]) {
    throw new Error("Steam did not return a valid SteamID64.");
  }

  return match[1];
}

function buildClientRedirectUrl(
  redirectUrl: string,
  status: "success" | "error" | "cancel",
  error?: string,
) {
  const url = new URL(assertAllowedRedirectUrl(redirectUrl));
  url.searchParams.set("provider", "steam");
  url.searchParams.set("status", status);

  if (error) {
    url.searchParams.set("error", error);
  }

  return url.toString();
}

function assertExpectedOpenIdReturnTo(requestUrl: URL, stateToken: string) {
  const expectedReturnTo = buildCallbackUrl(stateToken);
  const actualReturnTo = requestUrl.searchParams.get("openid.return_to");

  if (!actualReturnTo) {
    throw new Error("Steam OpenID callback is missing its return URL.");
  }

  if (actualReturnTo !== expectedReturnTo) {
    throw new Error("Steam OpenID callback return URL did not match the expected callback.");
  }
}

async function fetchSteamProfile(identifier: string) {
  const normalized = normalizeIdentifier(identifier);
  const profileUrl =
    normalized.type === "steamid64"
      ? `https://steamcommunity.com/profiles/${normalized.value}/?xml=1`
      : `https://steamcommunity.com/id/${normalized.value}/?xml=1`;

  const response = await fetch(profileUrl, {
    headers: {
      "User-Agent": "PlayThread/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Steam profile lookup failed (${response.status}).`);
  }

  const xml = await response.text();
  const steamId64 = getTagValue(xml, "steamID64");
  const displayName = getTagValue(xml, "steamID");

  if (!steamId64 || !displayName) {
    throw new Error("Steam could not find a public profile for that identifier.");
  }

  return {
    steamId64,
    displayName,
    avatarUrl: getTagValue(xml, "avatarFull"),
    profileUrl: `https://steamcommunity.com/profiles/${steamId64}`,
    customUrl: getTagValue(xml, "customURL"),
    visibilityState: getTagValue(xml, "visibilityState"),
    memberSince: getTagValue(xml, "memberSince"),
  } satisfies SteamProfile;
}

async function fetchSteamApiJson<T>(path: string, searchParams: Record<string, string | number>) {
  const steamApiKey = readEnv("STEAM_WEB_API_KEY");
  const url = new URL(`${STEAM_API_URL}${path}`);

  url.searchParams.set("key", steamApiKey);

  Object.entries(searchParams).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "PlayThread/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Steam Web API request failed (${response.status}) for ${path}.`);
  }

  return (await response.json()) as T;
}

async function fetchOwnedGames(steamId64: string) {
  const response = await fetchSteamApiJson<{ response?: { games?: SteamOwnedGame[] } }>(
    "/IPlayerService/GetOwnedGames/v1/",
    {
      steamid: steamId64,
      include_appinfo: 1,
      include_played_free_games: 1,
      include_free_sub: 1,
    }
  );

  return response.response?.games ?? [];
}

async function fetchAchievementSchema(appId: number) {
  const response = await fetchSteamApiJson<{
    game?: { availableGameStats?: { achievements?: SteamAchievementSchemaEntry[] } };
  }>("/ISteamUserStats/GetSchemaForGame/v2/", {
    appid: appId,
    l: "english",
  });

  return response.game?.availableGameStats?.achievements ?? [];
}

async function fetchPlayerAchievements(appId: number, steamId64: string) {
  const response = await fetchSteamApiJson<{
    playerstats?: { success?: boolean; achievements?: SteamPlayerAchievement[] };
  }>("/ISteamUserStats/GetPlayerAchievements/v1/", {
    steamid: steamId64,
    appid: appId,
    l: "english",
  });

  if (response.playerstats?.success === false) {
    return [];
  }

  return response.playerstats?.achievements ?? [];
}

async function fetchGlobalAchievementPercentages(appId: number) {
  const response = await fetchSteamApiJson<{
    achievementpercentages?: { achievements?: Array<{ name?: string; percent?: number }> };
  }>("/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/", {
    gameid: appId,
  });

  return response.achievementpercentages?.achievements ?? [];
}

async function getAuthenticatedUser(request: Request) {
  const supabaseUrl = readEnv("SUPABASE_URL");
  const supabaseAnonKey = readEnv("SUPABASE_ANON_KEY");
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    throw new Error("Missing authorization header.");
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    throw new Error("You must be signed in to manage linked accounts.");
  }

  return user;
}

async function loadExistingSteamAccount(userId: string) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from("connected_accounts")
    .select("id, provider_user_id, profile_url, metadata_json")
    .eq("user_id", userId)
    .eq("provider", "steam")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load linked Steam account: ${error.message}`);
  }

  return data;
}

async function setSteamSyncState(
  userId: string,
  syncStatus: "linked" | "syncing" | "error",
  metadataPatch: JsonRecord = {},
  lastSyncedAt?: string,
) {
  const adminClient = getAdminClient();
  const existingAccount = await loadExistingSteamAccount(userId);

  if (!existingAccount?.id) {
    return;
  }

  const metadata = {
    ...(existingAccount.metadata_json ?? {}),
    ...metadataPatch,
  };

  const { error } = await adminClient
    .from("connected_accounts")
    .update({
      sync_status: syncStatus,
      last_synced_at: lastSyncedAt ?? null,
      metadata_json: metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existingAccount.id);

  if (error) {
    throw new Error(`Could not update Steam sync state: ${error.message}`);
  }
}

async function upsertSteamAccount(userId: string, steamProfile: SteamProfile) {
  const adminClient = getAdminClient();

  const now = new Date().toISOString();
  const { data: existingAccount } = await adminClient
    .from("connected_accounts")
    .select("metadata_json")
    .eq("user_id", userId)
    .eq("provider", "steam")
    .maybeSingle();

  const metadata = {
    ...(existingAccount?.metadata_json ?? {}),
    custom_url: steamProfile.customUrl,
    visibility_state: steamProfile.visibilityState,
    member_since: steamProfile.memberSince,
    link_method: "openid",
    verified_at: now,
    last_sync_error: null,
  };

  const { data, error } = await adminClient
    .from("connected_accounts")
    .upsert(
      {
        user_id: userId,
        provider: "steam",
        provider_user_id: steamProfile.steamId64,
        display_name: steamProfile.displayName,
        avatar_url: steamProfile.avatarUrl,
        profile_url: steamProfile.profileUrl,
        sync_status: "linked",
        last_synced_at: now,
        metadata_json: metadata,
        updated_at: now,
      },
      {
        onConflict: "user_id,provider",
      }
    )
    .select(
      "id, provider, provider_user_id, display_name, avatar_url, profile_url, sync_status, last_synced_at, metadata_json"
    )
    .single();

  if (error) {
    throw new Error(`Could not save Steam account: ${error.message}`);
  }

  const { data: existingProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("linked_platforms")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Could not update linked platforms: ${profileError.message}`);
  }

  const nextLinkedPlatforms = Array.from(
    new Set([...(existingProfile?.linked_platforms ?? []), "steam"])
  );

  const { error: updateProfileError } = await adminClient
    .from("profiles")
    .update({
      linked_platforms: nextLinkedPlatforms,
    })
    .eq("id", userId);

  if (updateProfileError) {
    throw new Error(`Could not update linked platforms: ${updateProfileError.message}`);
  }

  return data;
}

async function unlinkSteamAccount(userId: string) {
  const adminClient = getAdminClient();

  const { error: deleteShowcaseError } = await adminClient
    .from("profile_showcase_items")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "steam");

  if (deleteShowcaseError && deleteShowcaseError.code !== "PGRST116") {
    throw new Error(`Could not remove Steam showcase items: ${deleteShowcaseError.message}`);
  }

  const { error: deleteAchievementsError } = await adminClient
    .from("user_achievements")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "steam");

  if (deleteAchievementsError && deleteAchievementsError.code !== "PGRST116") {
    throw new Error(`Could not remove Steam achievements: ${deleteAchievementsError.message}`);
  }

  const { error: deleteGameStatsError } = await adminClient
    .from("user_game_stats")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "steam");

  if (deleteGameStatsError && deleteGameStatsError.code !== "PGRST116") {
    throw new Error(`Could not remove Steam game stats: ${deleteGameStatsError.message}`);
  }

  const { error: deleteConnectedAccountError } = await adminClient
    .from("connected_accounts")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "steam");

  if (deleteConnectedAccountError && deleteConnectedAccountError.code !== "PGRST116") {
    throw new Error(`Could not remove linked Steam account: ${deleteConnectedAccountError.message}`);
  }

  const { data: existingProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("linked_platforms")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Could not load linked platforms: ${profileError.message}`);
  }

  const nextLinkedPlatforms = (existingProfile?.linked_platforms ?? []).filter(
    (platform) => platform !== "steam",
  );

  const { error: updateProfileError } = await adminClient
    .from("profiles")
    .update({
      linked_platforms: nextLinkedPlatforms,
    })
    .eq("id", userId);

  if (updateProfileError) {
    throw new Error(`Could not update linked platforms: ${updateProfileError.message}`);
  }
}

function normalizeOwnedGame(game: SteamOwnedGame) {
  const appId = toInteger(game.appid);
  const providerGameId = String(appId);

  return {
    provider: "steam" as const,
    provider_game_id: providerGameId,
    title: game.name?.trim() || `Steam App ${providerGameId}`,
    cover_url: buildSteamHeaderImageUrl(appId),
    platform: "steam" as const,
    metadata_json: {
      icon_url: buildSteamIconUrl(appId, game.img_icon_url),
      playtime_forever_minutes: toInteger(game.playtime_forever),
      playtime_windows_minutes: toInteger(game.playtime_windows_forever),
      playtime_mac_minutes: toInteger(game.playtime_mac_forever),
      playtime_linux_minutes: toInteger(game.playtime_linux_forever),
      has_community_visible_stats: Boolean(game.has_community_visible_stats),
      last_played_at: toIsoDateFromUnix(game.rtime_last_played),
    },
  } satisfies NormalizedGame;
}

function normalizeOwnedGameStat(userId: string, game: SteamOwnedGame, now: string) {
  return {
    user_id: userId,
    provider: "steam" as const,
    provider_game_id: String(toInteger(game.appid)),
    completion_percent: null,
    completed_achievement_count: 0,
    total_achievement_count: 0,
    last_synced_at: now,
    metadata_json: {
      title: game.name?.trim() || `Steam App ${game.appid}`,
      playtime_forever_minutes: toInteger(game.playtime_forever),
      playtime_hours: roundPercent(toInteger(game.playtime_forever) / 60),
      playtime_windows_minutes: toInteger(game.playtime_windows_forever),
      playtime_mac_minutes: toInteger(game.playtime_mac_forever),
      playtime_linux_minutes: toInteger(game.playtime_linux_forever),
      last_played_at: toIsoDateFromUnix(game.rtime_last_played),
      has_community_visible_stats: Boolean(game.has_community_visible_stats),
    },
    updated_at: now,
  } satisfies NormalizedGameStat;
}

function pickAchievementCandidates(games: SteamOwnedGame[]) {
  return [...games]
    .filter((game) => Boolean(game.has_community_visible_stats) || toInteger(game.playtime_forever) > 0)
    .sort((a, b) => toInteger(b.playtime_forever) - toInteger(a.playtime_forever))
    .slice(0, MAX_ACHIEVEMENT_SYNC_GAMES);
}

async function syncAchievementsForGame(
  userId: string,
  game: SteamOwnedGame,
  steamId64: string,
  now: string,
): Promise<AchievementSyncResult | null> {
  const appId = toInteger(game.appid);
  const baseStat = normalizeOwnedGameStat(userId, game, now);
  const [schema, playerAchievements, globalPercentages] = await Promise.all([
    fetchAchievementSchema(appId),
    fetchPlayerAchievements(appId, steamId64),
    fetchGlobalAchievementPercentages(appId),
  ]);

  if (schema.length === 0) {
    return null;
  }

  const schemaByName = new Map(
    schema
      .filter((achievement) => typeof achievement.name === "string" && achievement.name.length > 0)
      .map((achievement) => [achievement.name as string, achievement]),
  );

  const rarityByName = new Map(
    globalPercentages
      .filter((achievement) => typeof achievement.name === "string")
      .map((achievement) => [achievement.name as string, toNullableNumber(achievement.percent)]),
  );

  const mergedAchievements = playerAchievements
    .filter((achievement) => typeof achievement.apiname === "string" && schemaByName.has(achievement.apiname))
    .map((achievement) => {
      const schemaEntry = schemaByName.get(achievement.apiname as string)!;
      const isUnlocked = toInteger(achievement.achieved) === 1;

      return {
        user_id: userId,
        provider: "steam" as const,
        provider_game_id: String(appId),
        provider_achievement_id: achievement.apiname as string,
        title: schemaEntry.displayName?.trim() || (achievement.apiname as string),
        description: schemaEntry.description?.trim() || null,
        icon_url: schemaEntry.icon ?? schemaEntry.icongray ?? null,
        is_unlocked: isUnlocked,
        unlocked_at: isUnlocked ? toIsoDateFromUnix(toInteger(achievement.unlocktime)) : null,
        rarity_percent: roundPercent(rarityByName.get(achievement.apiname as string) ?? null),
        last_synced_at: now,
        metadata_json: {
          game_title: game.name?.trim() || `Steam App ${appId}`,
          hidden: toInteger(schemaEntry.hidden) === 1,
          default_value: toInteger(schemaEntry.defaultvalue),
        },
        updated_at: now,
      } satisfies NormalizedAchievement;
    });

  const totalAchievementCount = schema.length;
  const completedAchievementCount = mergedAchievements.filter((achievement) => achievement.is_unlocked).length;
  const completionPercent =
    totalAchievementCount > 0 ? roundPercent((completedAchievementCount / totalAchievementCount) * 100) : null;

  return {
    game,
    stat: {
      ...baseStat,
      completion_percent: completionPercent,
      completed_achievement_count: completedAchievementCount,
      total_achievement_count: totalAchievementCount,
      metadata_json: {
        ...baseStat.metadata_json,
        achievement_sync_limited: true,
        achievements_unlocked: completedAchievementCount,
        achievements_total: totalAchievementCount,
      },
    },
    achievements: mergedAchievements,
  };
}

async function persistSteamSync(
  userId: string,
  ownedGames: SteamOwnedGame[],
  achievementResults: AchievementSyncResult[],
  now: string,
) {
  const adminClient = getAdminClient();
  const normalizedOwnedGames = ownedGames.map(normalizeOwnedGame);
  const baseStatsByGameId = new Map(
    ownedGames.map((game) => [String(toInteger(game.appid)), normalizeOwnedGameStat(userId, game, now)]),
  );

  achievementResults.forEach((result) => {
    baseStatsByGameId.set(result.stat.provider_game_id, result.stat);
  });

  const normalizedStats = Array.from(baseStatsByGameId.values());
  const normalizedAchievements = achievementResults.flatMap((result) => result.achievements);
  const ownedGameIds = normalizedOwnedGames.map((game) => game.provider_game_id);

  if (normalizedOwnedGames.length > 0) {
    const { error } = await adminClient.from("external_games").upsert(
      normalizedOwnedGames.map((game) => ({
        ...game,
        updated_at: now,
      })),
      {
        onConflict: "provider,provider_game_id",
      },
    );

    if (error) {
      throw new Error(`Could not save Steam games: ${error.message}`);
    }
  }

  if (normalizedStats.length > 0) {
    const { error } = await adminClient.from("user_game_stats").upsert(normalizedStats, {
      onConflict: "user_id,provider,provider_game_id",
    });

    if (error) {
      throw new Error(`Could not save Steam game stats: ${error.message}`);
    }
  }

  const { error: deleteGameStatsError } = ownedGameIds.length
    ? await adminClient
        .from("user_game_stats")
        .delete()
        .eq("user_id", userId)
        .eq("provider", "steam")
        .not("provider_game_id", "in", `(${ownedGameIds.map((id) => `"${id}"`).join(",")})`)
    : await adminClient
        .from("user_game_stats")
        .delete()
        .eq("user_id", userId)
        .eq("provider", "steam");

  if (deleteGameStatsError && deleteGameStatsError.code !== "PGRST116") {
    throw new Error(`Could not prune stale Steam game stats: ${deleteGameStatsError.message}`);
  }

  const { error: deleteAchievementsError } = await adminClient
    .from("user_achievements")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "steam");

  if (deleteAchievementsError && deleteAchievementsError.code !== "PGRST116") {
    throw new Error(`Could not reset Steam achievements: ${deleteAchievementsError.message}`);
  }

  if (normalizedAchievements.length > 0) {
    const { error } = await adminClient.from("user_achievements").upsert(normalizedAchievements, {
      onConflict: "user_id,provider,provider_game_id,provider_achievement_id",
    });

    if (error) {
      throw new Error(`Could not save Steam achievements: ${error.message}`);
    }
  }
}

async function persistSingleGameSync(
  userId: string,
  game: SteamOwnedGame,
  achievementResult: AchievementSyncResult | null,
  now: string,
) {
  const adminClient = getAdminClient();
  const normalizedGame = normalizeOwnedGame(game);
  const normalizedStat = achievementResult?.stat ?? normalizeOwnedGameStat(userId, game, now);
  const normalizedAchievements = achievementResult?.achievements ?? [];

  const { error: gameError } = await adminClient.from("external_games").upsert(
    {
      ...normalizedGame,
      updated_at: now,
    },
    {
      onConflict: "provider,provider_game_id",
    },
  );

  if (gameError) {
    throw new Error(`Could not save Steam game: ${gameError.message}`);
  }

  const { error: statError } = await adminClient.from("user_game_stats").upsert(normalizedStat, {
    onConflict: "user_id,provider,provider_game_id",
  });

  if (statError) {
    throw new Error(`Could not save Steam game stats: ${statError.message}`);
  }

  const { error: deleteAchievementsError } = await adminClient
    .from("user_achievements")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "steam")
    .eq("provider_game_id", String(toInteger(game.appid)));

  if (deleteAchievementsError && deleteAchievementsError.code !== "PGRST116") {
    throw new Error(`Could not reset Steam achievements for game: ${deleteAchievementsError.message}`);
  }

  if (normalizedAchievements.length > 0) {
    const { error: achievementsError } = await adminClient
      .from("user_achievements")
      .upsert(normalizedAchievements, {
        onConflict: "user_id,provider,provider_game_id,provider_achievement_id",
      });

    if (achievementsError) {
      throw new Error(`Could not save Steam achievements for game: ${achievementsError.message}`);
    }
  }
}

function buildShowcaseItems(achievementResults: AchievementSyncResult[], ownedGames: SteamOwnedGame[], userId: string, now: string) {
  const rareAchievements = achievementResults
    .flatMap((result) =>
      result.achievements
        .filter((achievement) => achievement.is_unlocked)
        .map((achievement) => ({
          achievement,
          game: result.game,
        })),
    )
    .sort((left, right) => {
      const leftRarity = left.achievement.rarity_percent ?? Number.POSITIVE_INFINITY;
      const rightRarity = right.achievement.rarity_percent ?? Number.POSITIVE_INFINITY;

      if (leftRarity !== rightRarity) {
        return leftRarity - rightRarity;
      }

      const leftUnlocked = left.achievement.unlocked_at ? new Date(left.achievement.unlocked_at).getTime() : 0;
      const rightUnlocked = right.achievement.unlocked_at ? new Date(right.achievement.unlocked_at).getTime() : 0;
      return rightUnlocked - leftUnlocked;
    });

  const items: ShowcaseItem[] = [];

  rareAchievements.slice(0, MAX_SHOWCASE_ITEMS).forEach(({ achievement, game }, index) => {
    items.push({
      user_id: userId,
      kind: "achievement",
      provider: "steam",
      provider_game_id: achievement.provider_game_id,
      provider_achievement_id: achievement.provider_achievement_id,
      title: achievement.title,
      subtitle:
        achievement.rarity_percent !== null
          ? `${game.name ?? `Steam App ${achievement.provider_game_id}`} • ${achievement.rarity_percent.toFixed(2)}% unlocked`
          : `${game.name ?? `Steam App ${achievement.provider_game_id}`} • Achievement unlocked`,
      image_url: achievement.icon_url,
      metadata_json: {
        source: "steam_sync",
        game_title: game.name ?? `Steam App ${achievement.provider_game_id}`,
        rarity_percent: achievement.rarity_percent,
      },
      position: index,
      updated_at: now,
    });
  });

  if (items.length < MAX_SHOWCASE_ITEMS) {
    const basePosition = items.length;
    const gameItems = [...ownedGames]
      .sort((left, right) => toInteger(right.playtime_forever) - toInteger(left.playtime_forever))
      .slice(0, MAX_SHOWCASE_ITEMS)
      .filter((game) => !items.some((item) => item.provider_game_id === String(toInteger(game.appid))))
      .slice(0, MAX_SHOWCASE_ITEMS - items.length);

    gameItems.forEach((game, index) => {
      const playtimeHours = roundPercent(toInteger(game.playtime_forever) / 60);
      items.push({
        user_id: userId,
        kind: "game",
        provider: "steam",
        provider_game_id: String(toInteger(game.appid)),
        provider_achievement_id: null,
        title: game.name?.trim() || `Steam App ${game.appid}`,
        subtitle:
          playtimeHours !== null
            ? `${playtimeHours.toFixed(2)} hours played`
            : "Synced from Steam library",
        image_url: buildSteamHeaderImageUrl(toInteger(game.appid)),
        metadata_json: {
          source: "steam_sync",
          playtime_forever_minutes: toInteger(game.playtime_forever),
        },
        position: basePosition + index,
        updated_at: now,
      });
    });
  }

  return items.slice(0, MAX_SHOWCASE_ITEMS);
}

async function persistShowcaseItems(userId: string, showcaseItems: ShowcaseItem[]) {
  const adminClient = getAdminClient();

  const { error: deleteError } = await adminClient
    .from("profile_showcase_items")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    throw new Error(`Could not replace showcase items: ${deleteError.message}`);
  }

  if (showcaseItems.length === 0) {
    return;
  }

  const { error: insertError } = await adminClient.from("profile_showcase_items").insert(showcaseItems);

  if (insertError) {
    throw new Error(`Could not save showcase items: ${insertError.message}`);
  }
}

async function hasManualShowcaseItems(userId: string) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from("profile_showcase_items")
    .select("metadata_json")
    .eq("user_id", userId)
    .eq("provider", "steam");

  if (error) {
    throw new Error(`Could not inspect existing showcase items: ${error.message}`);
  }

  return (data ?? []).some((item) => {
    const source = item.metadata_json?.source;
    const pinnedByUser = item.metadata_json?.pinned_by_user;
    return source === "manual" || pinnedByUser === true;
  });
}

async function runSteamSync(userId: string, steamId64: string) {
  const now = new Date().toISOString();
  const ownedGames = await fetchOwnedGames(steamId64);
  const achievementCandidates = pickAchievementCandidates(ownedGames);
  const achievementResults = (
    await Promise.all(
      achievementCandidates.map(async (game) => {
        try {
          return await syncAchievementsForGame(userId, game, steamId64, now);
        } catch (error) {
          console.warn(`Steam achievement sync skipped for ${game.appid}:`, error);
          return null;
        }
      }),
    )
  ).filter((result): result is AchievementSyncResult => result !== null);

  await persistSteamSync(userId, ownedGames, achievementResults, now);
  const preserveManualShowcase = await hasManualShowcaseItems(userId);
  let showcaseItems: ShowcaseItem[] = [];

  if (!preserveManualShowcase) {
    showcaseItems = buildShowcaseItems(achievementResults, ownedGames, userId, now);
    await persistShowcaseItems(userId, showcaseItems);
  }

  const unlockedAchievementCount = achievementResults.reduce(
    (count, result) => count + result.achievements.filter((achievement) => achievement.is_unlocked).length,
    0,
  );

  return {
    syncedOwnedGames: ownedGames.length,
    syncedAchievementGames: achievementResults.length,
    syncedAchievements: unlockedAchievementCount,
    showcaseItems: showcaseItems.length,
    preservedManualShowcase: preserveManualShowcase,
    syncedAt: now,
  };
}

async function runSingleGameSync(userId: string, steamId64: string, appIdInput: string | number) {
  const targetAppId = String(toInteger(appIdInput));

  if (!targetAppId || targetAppId === "0") {
    throw new Error("Missing Steam app id for game sync.");
  }

  const now = new Date().toISOString();
  const ownedGames = await fetchOwnedGames(steamId64);
  const targetGame = ownedGames.find((game) => String(toInteger(game.appid)) === targetAppId);

  if (!targetGame) {
    throw new Error("That game was not found in your Steam library.");
  }

  const achievementResult = await syncAchievementsForGame(userId, targetGame, steamId64, now);
  await persistSingleGameSync(userId, targetGame, achievementResult, now);

  return {
    appId: targetAppId,
    syncedAchievements: achievementResult?.achievements.filter((achievement) => achievement.is_unlocked)
      .length ?? 0,
    totalAchievements: achievementResult?.stat.total_achievement_count ?? 0,
    completionPercent: achievementResult?.stat.completion_percent ?? null,
    syncedAt: now,
  };
}

async function handleOpenIdCallback(requestUrl: URL) {
  const stateToken = requestUrl.searchParams.get("state");
  let redirectUrl = readEnv("SUPABASE_URL");

  try {
    const state = await verifySignedStateToken(stateToken);
    redirectUrl = assertAllowedRedirectUrl(state.redirectUrl);

    if (requestUrl.searchParams.get("openid.mode") === "cancel") {
      return Response.redirect(buildClientRedirectUrl(redirectUrl, "cancel"), 302);
    }

    assertExpectedOpenIdReturnTo(requestUrl, stateToken ?? "");
    await verifySteamOpenIdAssertion(requestUrl);
    const steamId64 = extractSteamIdFromClaimedId(requestUrl);
    const steamProfile = await fetchSteamProfile(steamId64);
    await upsertSteamAccount(state.userId, steamProfile);

    return Response.redirect(buildClientRedirectUrl(redirectUrl, "success"), 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Steam link failed.";
    return Response.redirect(buildClientRedirectUrl(redirectUrl, "error", message), 302);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method === "GET") {
    return handleOpenIdCallback(new URL(request.url));
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const user = await getAuthenticatedUser(request);
    const body = (await request.json()) as RequestBody;
    const action = body.action;

    if (action === "start") {
      const redirectUrlInput = String(body.redirectUrl ?? "").trim();

      if (!redirectUrlInput) {
        throw new Error("Missing Steam OpenID redirect URL.");
      }

      const redirectUrl = assertAllowedRedirectUrl(redirectUrlInput);

      const stateToken = await createSignedStateToken({
        userId: user.id,
        redirectUrl,
        issuedAt: Date.now(),
      });

      return jsonResponse({
        authUrl: buildSteamOpenIdUrl(buildCallbackUrl(stateToken)),
      });
    }

    if (action === "sync") {
      const existingAccount = await loadExistingSteamAccount(user.id);

      if (!existingAccount?.provider_user_id) {
        throw new Error("Link Steam first before syncing.");
      }

      await setSteamSyncState(user.id, "syncing", {
        last_sync_error: null,
      });

      try {
        const steamProfile = await fetchSteamProfile(existingAccount.provider_user_id);
        const summary = await runSteamSync(user.id, steamProfile.steamId64);
        const account = await upsertSteamAccount(user.id, steamProfile);

        await setSteamSyncState(
          user.id,
          "linked",
          {
            last_sync_error: null,
            last_library_sync_summary: summary,
          },
          summary.syncedAt,
        );

        return jsonResponse({ account, summary });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Steam sync failed.";
        await setSteamSyncState(user.id, "error", {
          last_sync_error: message,
        });
        throw error;
      }
    }

    if (action === "sync_game") {
      const existingAccount = await loadExistingSteamAccount(user.id);

      if (!existingAccount?.provider_user_id) {
        throw new Error("Link Steam first before syncing.");
      }

      const appId = body.appId;
      const steamProfile = await fetchSteamProfile(existingAccount.provider_user_id);
      const summary = await runSingleGameSync(user.id, steamProfile.steamId64, String(appId ?? ""));
      const account = await upsertSteamAccount(user.id, steamProfile);

      await setSteamSyncState(
        user.id,
        "linked",
        {
          last_sync_error: null,
          last_game_sync_summary: summary,
        },
        summary.syncedAt,
      );

      return jsonResponse({ account, summary });
    }

    if (action === "unlink") {
      await unlinkSteamAccount(user.id);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Unsupported action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown function error.";
    return jsonResponse({ error: message }, 500);
  }
});
