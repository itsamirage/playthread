function buildRedirectUrl(path, {
  platform = "native",
  origin = null,
  createUrl = (path) => `playthread://${path}`,
} = {}) {
  if (platform === "web" && origin) {
    return new URL(`/${path}`, origin).toString();
  }

  return createUrl(path);
}

export function getEmailRedirectUrl(options = {}) {
  return buildRedirectUrl("login", options);
}

export function getPasswordResetRedirectUrl(options = {}) {
  return buildRedirectUrl("reset-password", options);
}
