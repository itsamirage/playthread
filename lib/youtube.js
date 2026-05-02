const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const TRAILING_URL_PUNCTUATION_PATTERN = /[),.;!?]+$/;
const URL_CANDIDATE_PATTERN = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube(?:-nocookie)?\.com|youtu\.be)\/[^\s<>"']+/gi;

function normalizeCandidateUrl(value) {
  const trimmedValue = String(value ?? "").trim().replace(TRAILING_URL_PUNCTUATION_PATTERN, "");

  if (!trimmedValue) {
    return null;
  }

  return /^https?:\/\//i.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`;
}

function isYouTubeHost(hostname) {
  const normalizedHost = String(hostname ?? "").toLowerCase();

  return (
    normalizedHost === "youtu.be" ||
    normalizedHost === "youtube.com" ||
    normalizedHost.endsWith(".youtube.com") ||
    normalizedHost === "youtube-nocookie.com" ||
    normalizedHost.endsWith(".youtube-nocookie.com")
  );
}

function normalizeVideoId(value) {
  const videoId = String(value ?? "").trim();
  return YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
}

function extractFromPath(pathname) {
  const segments = String(pathname ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  const [firstSegment, secondSegment] = segments;

  if (["embed", "shorts", "live", "v"].includes(firstSegment)) {
    return normalizeVideoId(secondSegment);
  }

  return null;
}

export function extractYouTubeVideoId(value) {
  const normalizedUrl = normalizeCandidateUrl(value);

  if (!normalizedUrl) {
    return null;
  }

  try {
    const url = new URL(normalizedUrl);

    if (!isYouTubeHost(url.hostname)) {
      return null;
    }

    if (url.hostname.toLowerCase() === "youtu.be") {
      return normalizeVideoId(url.pathname.split("/").filter(Boolean)[0]);
    }

    const watchVideoId = normalizeVideoId(url.searchParams.get("v"));
    if (watchVideoId) {
      return watchVideoId;
    }

    const attributionTarget = url.searchParams.get("u");
    if (attributionTarget) {
      const decodedTarget = decodeURIComponent(attributionTarget);
      const nestedId = extractYouTubeVideoId(
        decodedTarget.startsWith("http") ? decodedTarget : `https://www.youtube.com${decodedTarget}`,
      );

      if (nestedId) {
        return nestedId;
      }
    }

    return extractFromPath(url.pathname);
  } catch {
    return null;
  }
}

export function isYouTubeVideoUrl(value) {
  return Boolean(extractYouTubeVideoId(value));
}

export function buildYouTubeWatchUrl(videoId) {
  const normalizedVideoId = normalizeVideoId(videoId);

  if (!normalizedVideoId) {
    return null;
  }

  return `https://www.youtube.com/watch?v=${normalizedVideoId}`;
}

export function buildYouTubeEmbedUrl(videoId, params = {}) {
  const normalizedVideoId = normalizeVideoId(videoId);

  if (!normalizedVideoId) {
    return null;
  }

  const url = new URL(`https://www.youtube-nocookie.com/embed/${normalizedVideoId}`);

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export function parseYouTubeVideoUrl(value) {
  const videoId = extractYouTubeVideoId(value);

  if (!videoId) {
    return null;
  }

  return {
    provider: "youtube",
    videoId,
    watchUrl: buildYouTubeWatchUrl(videoId),
    embedUrl: buildYouTubeEmbedUrl(videoId),
  };
}

export function findYouTubeVideoInText(value) {
  const text = String(value ?? "");
  const matches = text.match(URL_CANDIDATE_PATTERN) ?? [];

  for (const match of matches) {
    const parsedVideo = parseYouTubeVideoUrl(match);

    if (parsedVideo) {
      return parsedVideo;
    }
  }

  return null;
}
