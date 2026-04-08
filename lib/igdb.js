import { supabase } from "./supabase";

const FUNCTION_NAME = "igdb-proxy";

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

async function invokeIgdbProxy(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: {
      action,
      ...payload,
    },
  });

  if (error) {
    throw new Error(toErrorMessage(error, "IGDB proxy request failed."));
  }

  if (!data) {
    throw new Error("IGDB proxy returned no data.");
  }

  if (data.error) {
    throw new Error(toErrorMessage(data.error, "IGDB proxy returned an error."));
  }

  return data;
}

export function isIgdbConfigured() {
  return true;
}

export async function fetchDiscoverGames({ limit = 60 } = {}) {
  const data = await invokeIgdbProxy("discover", { limit });
  return data.games ?? [];
}

export async function fetchStarterGames({ limit = 10 } = {}) {
  const data = await invokeIgdbProxy("starter", { limit });
  return data.games ?? [];
}

export async function fetchGameById(gameId) {
  const data = await invokeIgdbProxy("detail", { gameId });
  return data.game ?? null;
}

export async function searchGames(query, { limit = 20 } = {}) {
  const data = await invokeIgdbProxy("search", { query, limit });
  return data.games ?? [];
}

export async function fetchGameCovers(gameIds) {
  const data = await invokeIgdbProxy("covers", { gameIds });
  return data.covers ?? [];
}

export async function fetchCatalogGames({ facet, value, sortBy = "score_desc", limit = 100 }) {
  const data = await invokeIgdbProxy("catalog", { facet, value, sortBy, limit });
  return data.games ?? [];
}
