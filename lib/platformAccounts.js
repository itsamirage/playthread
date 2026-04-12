import { useEffect, useMemo, useState } from "react";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { useAuth } from "./auth";
import { supabase } from "./supabase";

const FUNCTION_NAME = "steam-account";
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

WebBrowser.maybeCompleteAuthSession();

export const PLATFORM_PROVIDERS = {
  steam: {
    label: "Steam",
    description: "Import owned games, sync achievements, and feature showcase items.",
  },
  xbox: {
    label: "Xbox",
    description: "Reserved for the next provider adapter after Steam ships.",
  },
  psn: {
    label: "PlayStation",
    description: "Manual showcase support comes first while account import stays deferred.",
  },
};

const SYNC_STATUS_LABELS = {
  pending: "Ready to link",
  linked: "Linked",
  syncing: "Syncing",
  error: "Needs attention",
};

function isMissingConnectedAccountsTable(error) {
  return error?.code === "42P01" || error?.message?.toLowerCase().includes("connected_accounts");
}

function normalizeAccount(row) {
  return {
    id: row.id,
    provider: row.provider,
    providerUserId: row.provider_user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    profileUrl: row.profile_url,
    syncStatus: row.sync_status ?? "pending",
    lastSyncedAt: row.last_synced_at,
    metadata: row.metadata_json ?? {},
  };
}

export function getProviderLabel(provider) {
  return PLATFORM_PROVIDERS[provider]?.label ?? provider;
}

export function getSyncStatusLabel(syncStatus) {
  return SYNC_STATUS_LABELS[syncStatus] ?? SYNC_STATUS_LABELS.pending;
}

function toErrorMessage(error, fallbackMessage) {
  if (!error) {
    return fallbackMessage;
  }

  if (typeof error.message === "string" && error.message.length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return fallbackMessage;
}

async function toFunctionErrorMessage(error, fallbackMessage) {
  if (!error) {
    return fallbackMessage;
  }

  const baseMessage = toErrorMessage(error, fallbackMessage);

  if (typeof error.context?.json === "function") {
    try {
      const payload = await error.context.json();

      if (typeof payload?.error === "string" && payload.error.length > 0) {
        return payload.error;
      }

      if (typeof payload?.message === "string" && payload.message.length > 0) {
        return payload.message;
      }
    } catch (_contextError) {
      // Fall back to the base message when the response body is unavailable.
    }
  }

  if (typeof error.context?.text === "function") {
    try {
      const text = await error.context.text();

      if (typeof text === "string" && text.trim().length > 0) {
        return text.trim();
      }
    } catch (_contextError) {
      // Fall back to the base message when the response body is unavailable.
    }
  }

  return baseMessage;
}

async function toHttpErrorMessage(response, fallbackMessage) {
  try {
    const payload = await response.json();

    if (typeof payload?.error === "string" && payload.error.length > 0) {
      return payload.error;
    }

    if (typeof payload?.message === "string" && payload.message.length > 0) {
      return payload.message;
    }
  } catch (_jsonError) {
    try {
      const text = await response.text();

      if (typeof text === "string" && text.trim().length > 0) {
        return text.trim();
      }
    } catch (_textError) {
      // Fall back below.
    }
  }

  return fallbackMessage;
}

async function ensureValidSession() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error("Could not read your session. Sign in again and retry.");
  }

  if (!session) {
    throw new Error("You need to sign in again before linking Steam.");
  }

  const expiresAtSeconds =
    typeof session.expires_at === "number" ? session.expires_at : null;
  const shouldRefresh =
    !session.access_token ||
    (expiresAtSeconds !== null && expiresAtSeconds * 1000 <= Date.now() + 60_000);

  if (!shouldRefresh) {
    return session;
  }

  const {
    data: refreshedData,
    error: refreshError,
  } = await supabase.auth.refreshSession();

  if (refreshError || !refreshedData.session?.access_token) {
    throw new Error("Your session expired. Sign out, sign back in, and retry Steam linking.");
  }

  return refreshedData.session;
}

async function invokeSteamAccount(action, payload = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase environment variables are missing.");
  }

  let session = await ensureValidSession();

  const callFunction = async (accessToken) => {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        ...payload,
      }),
    });

    if (!response.ok) {
      const message = await toHttpErrorMessage(
        response,
        "Steam account request failed.",
      );
      throw new Error(message);
    }

    return response.json();
  };

  let data;

  try {
    data = await callFunction(session.access_token);
  } catch (error) {
    const message = toErrorMessage(error, "Steam account request failed.");

    if (!message.toLowerCase().includes("invalid jwt")) {
      throw error;
    }

    const {
      data: refreshedData,
      error: refreshError,
    } = await supabase.auth.refreshSession();

    if (refreshError || !refreshedData.session?.access_token) {
      throw new Error("Your session expired. Sign out, sign back in, and retry Steam linking.");
    }

    session = refreshedData.session;
    data = await callFunction(session.access_token);
  }

  if (!data) {
    throw new Error("Steam account function returned no data.");
  }

  if (data.error) {
    throw new Error(toErrorMessage(data.error, "Steam account function returned an error."));
  }

  return data;
}

function parseSteamLinkRedirect(url) {
  const parsed = Linking.parse(url);
  const status = parsed.queryParams?.status;
  const error = parsed.queryParams?.error;

  if (typeof error === "string" && error.length > 0) {
    return {
      status: typeof status === "string" ? status : "error",
      error,
    };
  }

  return {
    status: typeof status === "string" ? status : null,
    error: null,
  };
}

export async function linkSteamAccount() {
  const redirectUrl = Linking.createURL("steam-link");
  const data = await invokeSteamAccount("start", { redirectUrl });
  const authUrl = data.authUrl;

  if (typeof authUrl !== "string" || authUrl.length === 0) {
    throw new Error("Steam account function did not return an OpenID URL.");
  }

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);

  if (result.type === "success" && result.url) {
    const parsedResult = parseSteamLinkRedirect(result.url);

    if (parsedResult.status === "success") {
      return { linked: true };
    }

    if (parsedResult.status === "cancel") {
      throw new Error("Steam linking was canceled.");
    }

    throw new Error(parsedResult.error ?? "Steam linking failed.");
  }

  if (result.type === "cancel" || result.type === "dismiss") {
    throw new Error("Steam linking was canceled.");
  }

  throw new Error("Steam linking did not complete.");
}

export async function syncSteamAccount() {
  const data = await invokeSteamAccount("sync");
  return {
    account: data.account ?? null,
    summary: data.summary ?? null,
  };
}

export async function syncSteamGame(appId) {
  const data = await invokeSteamAccount("sync_game", { appId });
  return {
    account: data.account ?? null,
    summary: data.summary ?? null,
  };
}

export async function unlinkSteamAccount() {
  const data = await invokeSteamAccount("unlink");
  return {
    success: Boolean(data.success),
  };
}

export function useConnectedAccounts() {
  const { session, isLoading: authLoading } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const loadAccounts = async () => {
      if (authLoading) {
        return;
      }

      if (!session?.user?.id) {
        setAccounts([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);

        const { data, error } = await supabase
          .from("connected_accounts")
          .select(
            "id, provider, provider_user_id, display_name, avatar_url, profile_url, sync_status, last_synced_at, metadata_json"
          )
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: true });

        if (error) {
          if (isMissingConnectedAccountsTable(error)) {
            setAccounts([]);
            return;
          }

          throw error;
        }

        setAccounts((data ?? []).map(normalizeAccount));
      } catch (error) {
        console.warn("Could not load connected accounts:", error?.message ?? error);
        setAccounts([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadAccounts();
  }, [authLoading, session?.user?.id, reloadKey]);

  const accountsByProvider = useMemo(
    () => new Map(accounts.map((account) => [account.provider, account])),
    [accounts]
  );

  return {
    accounts,
    accountsByProvider,
    isLoading,
    reloadAccounts: () => setReloadKey((currentValue) => currentValue + 1),
  };
}
