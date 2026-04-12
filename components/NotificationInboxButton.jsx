import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useNotifications } from "../lib/notifications";
import { theme } from "../lib/theme";

export default function NotificationInboxButton() {
  const router = useRouter();
  const { unreadCount } = useNotifications(20);

  return (
    <Pressable
      onPress={() => router.push("/notifications")}
      style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
    >
      <FontAwesome name="bell-o" size={18} color={theme.colors.textPrimary} />
      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : String(unreadCount)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  badge: {
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ff5b5b",
    borderRadius: theme.radius.pill,
    paddingHorizontal: 4,
    position: "absolute",
    top: -4,
    right: -4,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: theme.fontWeights.bold,
  },
});
