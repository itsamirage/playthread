import FontAwesome from "@expo/vector-icons/FontAwesome";
import { usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { emitTabReselect } from "../lib/tabReselect";
import { theme } from "../lib/theme";

const TABS = [
  { key: "home", label: "Hot", icon: "home", href: "/(tabs)" },
  { key: "all", label: "All", icon: "fire", href: "/(tabs)/popular" },
  { key: "browse", label: "Browse", icon: "search", href: "/(tabs)/browse" },
  { key: "profile", label: "Profile", icon: "user", href: "/(tabs)/profile" },
];

export default function BottomNavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((tab) => (
        (() => {
          const isActive =
            tab.href === "/(tabs)"
              ? pathname === "/" || pathname === "/(tabs)" || pathname === "/(tabs)/index"
              : pathname === tab.href;

          return (
            <Pressable
              key={tab.key}
              onPress={() => {
                if (isActive) {
                  emitTabReselect(tab.key);
                  return;
                }

                router.navigate(tab.href);
              }}
              style={({ pressed }) => [styles.tab, pressed ? styles.tabPressed : null]}
            >
              <FontAwesome
                name={tab.icon}
                size={22}
                color={isActive ? theme.colors.accent : theme.colors.textMuted}
              />
              <Text style={[styles.label, isActive ? styles.labelActive : null]}>{tab.label}</Text>
            </Pressable>
          );
        })()
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    backgroundColor: theme.colors.card,
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingBottom: 4,
  },
  tabPressed: {
    opacity: 0.6,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: "600",
  },
  labelActive: {
    color: theme.colors.accent,
  },
});
