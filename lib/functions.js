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
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, functionName));
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}
