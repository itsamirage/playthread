const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_COMMENT_LINK_LABEL_LENGTH = 80;
const MAX_COMMENT_LINK_URL_LENGTH = 500;
const PLAYTHREAD_HOSTS = new Set(["playthread.app", "www.playthread.app"]);

function parseCandidateUrl(value) {
  const rawValue = String(value ?? "").trim();

  if (!rawValue) {
    return null;
  }

  if (rawValue.startsWith("/")) {
    return new URL(rawValue, "https://playthread.app");
  }

  return new URL(rawValue);
}

function normalizePathname(pathname) {
  return `/${String(pathname ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/")}`;
}

export function parsePlayThreadCommentLink(value) {
  let url;

  try {
    url = parseCandidateUrl(value);
  } catch {
    return null;
  }

  if (!url) {
    return null;
  }

  if (url.protocol !== "https:" || !PLAYTHREAD_HOSTS.has(url.hostname.toLowerCase())) {
    return null;
  }

  const pathname = normalizePathname(url.pathname);
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "post" || !UUID_PATTERN.test(segments[1] ?? "") || segments.length !== 2) {
    return null;
  }

  const postId = segments[1];
  const commentId = url.searchParams.get("comment");

  if (commentId && !UUID_PATTERN.test(commentId)) {
    return null;
  }

  const normalizedUrl = new URL(`https://playthread.app/post/${postId}`);
  if (commentId) {
    normalizedUrl.searchParams.set("comment", commentId);
  }

  return {
    postId,
    commentId: commentId || null,
    url: normalizedUrl.toString(),
  };
}

export function normalizeCommentLink({ url, label } = {}) {
  const cleanUrl = String(url ?? "").trim();
  const cleanLabel = String(label ?? "").replace(/\s+/g, " ").trim();

  if (!cleanUrl && !cleanLabel) {
    return null;
  }

  if (!cleanUrl || !cleanLabel) {
    throw new Error("Add both link text and a PlayThread post or comment URL.");
  }

  if (cleanUrl.length > MAX_COMMENT_LINK_URL_LENGTH) {
    throw new Error(`Links must be ${MAX_COMMENT_LINK_URL_LENGTH} characters or fewer.`);
  }

  if (cleanLabel.length > MAX_COMMENT_LINK_LABEL_LENGTH) {
    throw new Error(`Link text must be ${MAX_COMMENT_LINK_LABEL_LENGTH} characters or fewer.`);
  }

  const parsedLink = parsePlayThreadCommentLink(cleanUrl);

  if (!parsedLink) {
    throw new Error("Only PlayThread post and comment links can be shared in comments.");
  }

  return {
    label: cleanLabel,
    url: parsedLink.url,
    postId: parsedLink.postId,
    commentId: parsedLink.commentId,
  };
}
