import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BottomNavBar from "../components/BottomNavBar";
import SectionCard from "../components/SectionCard";
import { isValidEmail, logoutUser, requestPasswordReset, updateEmail, useAuth } from "../lib/auth";
import { useContentPreferences } from "../lib/contentPreferences";
import { goBackOrFallback } from "../lib/navigation";
import { bindRouteToTab } from "../lib/tabState";
import { theme } from "../lib/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { preferences, savePreferences } = useContentPreferences();
  const [emailDraft, setEmailDraft] = useState("");
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    setEmailDraft(session?.user?.email ?? "");
  }, [session?.user?.email]);

  useEffect(() => {
    bindRouteToTab("profile", "/settings");
  }, []);

  const handleSaveEmail = async () => {
    if (!emailDraft.trim()) {
      Alert.alert("Missing email", "Enter the email address you want to use.");
      return;
    }

    if (!isValidEmail(emailDraft)) {
      Alert.alert("Invalid email", "Enter a valid email address.");
      return;
    }

    try {
      setIsSavingEmail(true);
      const { error } = await updateEmail(emailDraft);

      if (error) {
        throw error;
      }

      Alert.alert(
        "Email update started",
        "Check your inbox for the confirmation email to finish changing your address.",
      );
    } catch (error) {
      Alert.alert("Email update failed", error instanceof Error ? error.message : "Could not update your email.");
    } finally {
      setIsSavingEmail(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!session?.user?.email) {
      Alert.alert("Missing email", "No account email is available for this session.");
      return;
    }

    try {
      const { error } = await requestPasswordReset(session.user.email);

      if (error) {
        throw error;
      }

      Alert.alert("Reset email sent", `A password reset link was sent to ${session.user.email}.`);
    } catch (error) {
      Alert.alert("Reset failed", error instanceof Error ? error.message : "Could not send the reset email.");
    }
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      const { error } = await logoutUser();

      if (error) {
        throw error;
      }
    } catch (error) {
      Alert.alert("Logout failed", error instanceof Error ? error.message : "Could not log out.");
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={[styles.header, { paddingTop: insets.top + theme.spacing.md }]}>
          <Pressable onPress={() => goBackOrFallback(router, "/(tabs)/profile")} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Account, visibility, and session controls.</Text>
        </View>

        <SectionCard title="Account" eyebrow="Security">
          <Text style={styles.bodyText}>Update your account email or send yourself a password reset link.</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmailDraft}
            placeholder="Email address"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.textInput}
            value={emailDraft}
          />
          <Pressable
            disabled={isSavingEmail}
            onPress={handleSaveEmail}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.buttonPressed : null,
              isSavingEmail ? styles.buttonDisabled : null,
            ]}
          >
            {isSavingEmail ? <ActivityIndicator color={theme.colors.background} /> : <Text style={styles.primaryButtonText}>Save email</Text>}
          </Pressable>
          <Pressable onPress={handlePasswordReset} style={({ pressed }) => [styles.secondaryButton, pressed ? styles.buttonPressed : null]}>
            <Text style={styles.secondaryButtonText}>Send password reset</Text>
          </Pressable>
        </SectionCard>

        <SectionCard title="Content" eyebrow="Visibility">
          <Text style={styles.bodyText}>
            NSFW games stay hidden by default. Adult-only titles are filtered from Browse, Catalog, and search when this is enabled.
          </Text>
          <View style={styles.toggleRow}>
            <Pressable
              onPress={() => savePreferences({ ...preferences, hideMatureGames: true })}
              style={[styles.toggleOption, preferences.hideMatureGames ? styles.toggleOptionActive : null]}
            >
              <Text style={[styles.toggleText, preferences.hideMatureGames ? styles.toggleTextActive : null]}>Hide NSFW</Text>
            </Pressable>
            <Pressable
              onPress={() => savePreferences({ ...preferences, hideMatureGames: false })}
              style={[styles.toggleOption, !preferences.hideMatureGames ? styles.toggleOptionMuted : null]}
            >
              <Text style={[styles.toggleText, !preferences.hideMatureGames ? styles.toggleTextMuted : null]}>Show NSFW</Text>
            </Pressable>
          </View>
        </SectionCard>

        <SectionCard title="Session" eyebrow="Device">
          <Text style={styles.bodyText}>Sign out on this device without changing your saved profile data.</Text>
          <Pressable
            disabled={isLoggingOut}
            onPress={handleLogout}
            style={({ pressed }) => [
              styles.secondaryButton,
              styles.dangerButton,
              pressed ? styles.buttonPressed : null,
              isLoggingOut ? styles.buttonDisabled : null,
            ]}
          >
            {isLoggingOut ? <ActivityIndicator color={theme.colors.text} /> : <Text style={styles.dangerButtonText}>Log out</Text>}
          </Pressable>
        </SectionCard>
      </ScrollView>
      <BottomNavBar />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.layout.screenPadding,
    gap: theme.spacing.lg,
    paddingBottom: 96,
  },
  header: {
    gap: theme.spacing.sm,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  backButtonText: {
    color: theme.colors.text,
    fontWeight: "700",
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  bodyText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  textInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  primaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: theme.spacing.lg,
  },
  primaryButtonText: {
    color: theme.colors.background,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    paddingHorizontal: theme.spacing.lg,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontWeight: "700",
  },
  dangerButton: {
    borderColor: theme.colors.danger,
    backgroundColor: "rgba(220, 72, 72, 0.08)",
  },
  dangerButtonText: {
    color: theme.colors.danger,
    fontWeight: "800",
  },
  toggleRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  toggleOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  toggleOptionActive: {
    backgroundColor: "rgba(78, 187, 138, 0.18)",
    borderColor: theme.colors.accent,
  },
  toggleOptionMuted: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  toggleText: {
    color: theme.colors.text,
    fontWeight: "700",
  },
  toggleTextActive: {
    color: theme.colors.accent,
  },
  toggleTextMuted: {
    color: theme.colors.textMuted,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
