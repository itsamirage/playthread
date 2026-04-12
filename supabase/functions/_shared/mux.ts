type MuxDirectUploadInput = {
  passthrough: string;
  corsOrigin?: string;
};

function readEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }

  return value;
}

function getMuxAuthHeader() {
  const tokenId = readEnv("MUX_TOKEN_ID");
  const tokenSecret = readEnv("MUX_TOKEN_SECRET");
  const credentials = btoa(`${tokenId}:${tokenSecret}`);

  return `Basic ${credentials}`;
}

async function readMuxJson(response: Response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

async function muxRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.mux.com/video/v1${path}`, {
    ...init,
    headers: {
      Authorization: getMuxAuthHeader(),
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const payload = await readMuxJson(response);

  if (!response.ok) {
    throw new Error(
      payload?.error?.messages?.[0]
        ? String(payload.error.messages[0])
        : payload?.message
          ? String(payload.message)
          : "Mux API request failed.",
    );
  }

  return payload;
}

export async function createMuxDirectUpload(input: MuxDirectUploadInput) {
  const payload = await muxRequest("/uploads", {
    method: "POST",
    body: JSON.stringify({
      cors_origin: input.corsOrigin ?? "*",
      new_asset_settings: {
        playback_policy: ["public"],
        passthrough: input.passthrough,
      },
    }),
  });

  return payload?.data ?? null;
}

export async function getMuxDirectUpload(uploadId: string) {
  const payload = await muxRequest(`/uploads/${uploadId}`, {
    method: "GET",
  });

  return payload?.data ?? null;
}

export async function deleteMuxAsset(assetId: string) {
  await muxRequest(`/assets/${assetId}`, {
    method: "DELETE",
  });
}

export function buildMuxPlaybackUrl(playbackId: string) {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

export function buildMuxThumbnailUrl(playbackId: string) {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?width=960`;
}
