import * as Linking from "expo-linking";
import { Platform } from "react-native";

function buildRedirectUrl(path) {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    return new URL(`/${path}`, window.location.origin).toString();
  }

  return Linking.createURL(path);
}

export function getEmailRedirectUrl() {
  return buildRedirectUrl("login");
}

export function getPasswordResetRedirectUrl() {
  return buildRedirectUrl("reset-password");
}
