const usernamePattern = /^[\x20-\x7E]{3,20}$/;

export function isValidUsername(username) {
  const rawUsername = String(username ?? "");
  const trimmedUsername = rawUsername.trim();

  return (
    rawUsername === trimmedUsername &&
    trimmedUsername.length >= 3 &&
    trimmedUsername.length <= 20 &&
    usernamePattern.test(trimmedUsername)
  );
}
