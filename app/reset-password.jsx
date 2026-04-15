import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getPasswordChecks, logoutUser, updatePassword, useAuth } from "../lib/auth";
import { theme } from "../lib/theme";

function isStrongEnough(password) {
  return Object.values(getPasswordChecks(password)).every(Boolean);
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { session, isLoading, isPasswordRecovery, recoveryError, clearRecoveryState } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => {
      clearRecoveryState();
    };
  }, [clearRecoveryState]);

  const handleSavePassword = async () => {
    if (!password || !confirmPassword) {
      Alert.alert("Missing info", "Enter and confirm your new password.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Passwords do not match", "Enter the same password twice.");
      return;
    }

    if (!isStrongEnough(password)) {
      Alert.alert(
        "Weak password",
        "Use at least 8 characters, one uppercase letter, one number, and one special character.",
      );
      return;
    }

    try {
      setSaving(true);
      const { error } = await updatePassword(password);

      if (error) {
        Alert.alert("Reset failed", error.message);
        return;
      }

      await logoutUser();
      clearRecoveryState();
      Alert.alert("Password updated", "Log in with your new password.");
      router.replace("/(auth)/login");
    } finally {
      setSaving(false);
    }
  };

  const canReset = Boolean(session) || isPasswordRecovery;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>PlayThread</Text>
        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>
          Open the recovery link from your email, then set a new password here.
        </Text>

        {isLoading ? (
          <View style={styles.infoCard}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.infoText}>Checking recovery session...</Text>
          </View>
        ) : !canReset ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              No recovery session is active yet. Open the latest password reset email on this device.
            </Text>
            {recoveryError ? <Text style={styles.errorText}>{recoveryError}</Text> : null}
          </View>
        ) : (
          <View style={styles.form}>
            {recoveryError ? <Text style={styles.errorText}>{recoveryError}</Text> : null}
            <View style={styles.field}>
              <Text style={styles.label}>New password</Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={setPassword}
                placeholder="Enter a new password"
                placeholderTextColor={theme.colors.textMuted}
                secureTextEntry
                style={styles.input}
                value={password}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Confirm password</Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={setConfirmPassword}
                placeholder="Enter it again"
                placeholderTextColor={theme.colors.textMuted}
                secureTextEntry
                style={styles.input}
                value={confirmPassword}
              />
            </View>

            <Pressable
              disabled={saving}
              onPress={handleSavePassword}
              style={({ pressed }) => [
                styles.button,
                pressed && !saving ? styles.buttonPressed : null,
                saving ? styles.buttonDisabled : null,
              ]}
            >
              {saving ? (
                <ActivityIndicator color={theme.colors.background} />
              ) : (
                <Text style={styles.buttonText}>Save new password</Text>
              )}
            </Pressable>
          </View>
        )}

        <Pressable onPress={() => router.replace("/(auth)/login")} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Back to login</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: theme.layout.screenPadding,
    gap: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  infoCard: {
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.lg,
  },
  infoText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  form: {
    gap: theme.spacing.lg,
  },
  field: {
    gap: theme.spacing.sm,
  },
  label: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.semibold,
  },
  input: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  button: {
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.lg,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.md,
  },
  secondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  errorText: {
    color: "#ff7b7b",
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
});
