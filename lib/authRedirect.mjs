export function getEmailRedirectUrl({
  platform = "native",
  origin = null,
  createUrl = (path) => `playthread://${path}`,
} = {}) {
  if (platform === "web" && origin) {
    return new URL("/login", origin).toString();
  }

  return createUrl("login");
}
