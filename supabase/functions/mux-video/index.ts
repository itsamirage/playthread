import {
  corsHeaders,
  getAuthenticatedUser,
  jsonResponse,
  readJsonBody,
} from "../_shared/trusted.ts";
import { createMuxDirectUpload } from "../_shared/mux.ts";

type RequestBody = {
  action?: "create_upload";
};

function createUploadToken() {
  return crypto.randomUUID();
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
    const body = await readJsonBody<RequestBody>(request);

    if ((body.action ?? "create_upload") !== "create_upload") {
      throw new Error("Unsupported video action.");
    }

    const uploadToken = createUploadToken();
    const upload = await createMuxDirectUpload({
      passthrough: JSON.stringify({
        uploadToken,
        userId: user.id,
      }),
    });

    return jsonResponse({
      success: true,
      upload: {
        id: upload?.id ?? null,
        url: upload?.url ?? null,
        timeout: upload?.timeout ?? null,
        uploadToken,
      },
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown function error." },
      400,
    );
  }
});
