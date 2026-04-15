import { supabase } from "./supabase";

async function getFunctionErrorMessage(error, functionName) {
  const fallbackMessage = error?.message || `Could not call ${functionName}.`;
  const response = error?.context;

  if (!response || typeof response.clone !== "function") {
    return fallbackMessage;
  }

  try {
    const payload = await response.clone().json();

    if (typeof payload?.error === "string" && payload.error.trim()) {
      return payload.error;
    }

    if (typeof payload?.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    try {
      const text = await response.clone().text();

      if (text.trim()) {
        return text.trim();
      }
    } catch {
      return fallbackMessage;
    }
  }

  return fallbackMessage;
}

export async function invokeEdgeFunction(functionName, body) {
  let {
    data: { session },
  } = await supabase.auth.getSession();

  // If the token is expired or expiring within 60 seconds, force a refresh
  if (session && (!session.expires_at || session.expires_at * 1000 < Date.now() + 60000)) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshed?.session) {
      session = refreshed.session;
    } else {
      // Refresh token is expired — clear the dead session and ask user to sign in again
      await supabase.auth.signOut();
      throw new Error("Your session has expired. Please sign in again.");
    }
  }

  if (!session?.access_token) {
    throw new Error("You must be signed in to perform this action.");
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, functionName));
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}
