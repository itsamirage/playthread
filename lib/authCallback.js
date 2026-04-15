function readUrlParams(url) {
  const nextUrl = new URL(url);
  const params = new URLSearchParams(nextUrl.search);
  const hash = nextUrl.hash.startsWith("#") ? nextUrl.hash.slice(1) : nextUrl.hash;

  if (hash) {
    const hashParams = new URLSearchParams(hash);

    for (const [key, value] of hashParams.entries()) {
      if (!params.has(key)) {
        params.set(key, value);
      }
    }
  }

  return {
    pathname: nextUrl.pathname,
    params,
  };
}

export function parseSupabaseAuthCallback(url) {
  if (!url) {
    return null;
  }

  try {
    const { pathname, params } = readUrlParams(url);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");
    const code = params.get("code");
    const errorCode = params.get("error_code");
    const errorDescription = params.get("error_description");

    if (!accessToken && !refreshToken && !type && !code && !errorCode && !errorDescription) {
      return null;
    }

    return {
      pathname,
      accessToken,
      refreshToken,
      type,
      code,
      errorCode,
      errorDescription: errorDescription ? decodeURIComponent(errorDescription) : null,
    };
  } catch {
    return null;
  }
}
