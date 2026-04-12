import * as Linking from "expo-linking";
import { Platform } from "react-native";

export function getEmailRedirectUrl() {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    return new URL("/login", window.location.origin).toString();
  }

  return Linking.createURL("login");
}
