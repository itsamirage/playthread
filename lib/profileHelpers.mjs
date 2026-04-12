export function isGeneratedPlaceholderUsername(username) {
  return /^user_[a-z0-9]{12}$/i.test(String(username ?? "").trim());
}
