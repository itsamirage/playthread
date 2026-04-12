import { supabase } from "./supabase";

export async function invokeEdgeFunction(functionName, body) {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });

  if (error) {
    throw new Error(error.message || `Could not call ${functionName}.`);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}
