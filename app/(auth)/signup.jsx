import { useState } from "react";
import { Link } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import PasswordStrength from "../../components/PasswordStrength";
import {
  isValidEmail,
  isValidPassword,
  isValidUsername,
  signupUser,
} from "../../lib/auth";
import { theme } from "../../lib/theme";

export default function SignupScreen() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();

    if (!isValidEmail(cleanEmail)) {
      Alert.alert("Invalid email", "Enter a real email address.");
      return;
    }

    if (!isValidUsername(cleanUsername)) {
      Alert.alert(
        "Invalid username",
        "Use 3 to 20 lowercase characters. Spaces and punctuation are allowed."
      );
      return;
    }

    if (!isValidPassword(password)) {
      Alert.alert(
        "Weak password",
        "Use at least 8 characters, one uppercase letter, one number, and one special character."
      );
      return;
    }

    try {
      setLoading(true);

      const { error, profileReason } = await signupUser({
        email: cleanEmail,
        username: cleanUsername,
        password,
      });

      if (error) {
        Alert.alert("Signup failed", error.message);
        return;
      }

      if (profileReason === "missing-user-id") {
        Alert.alert(
          "Account created",
          "Your account was made. Check your email to confirm it, then return to the Playthread login screen."
        );
        return;
      }

      if (profileReason === "username-taken") {
        Alert.alert(
          "Username taken",
          "That username is already in use. Pick a different one."
        );
        return;
      }

      if (profileReason === "profile-update-failed") {
        Alert.alert(
          "Account created",
          "Your account was made, but your profile username still needs to be updated later."
        );
        return;
      }

      Alert.alert(
        "Account created",
        "Check your email to confirm your Playthread account, then return to the login screen."
      );
    } catch (error) {
      Alert.alert("Error", "Something went wrong while signing up.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>PlayThread</Text>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>
          Make your PlayThread login with email, username, and a strong password.
        </Text>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={email}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setUsername}
              placeholder="pants.pants!pants?"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={username}
            />
            <Text style={styles.helper}>
              Use 3 to 20 lowercase characters. Spaces and punctuation are allowed.
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              autoCapitalize="none"
              onChangeText={setPassword}
              placeholder="Create a strong password"
              placeholderTextColor={theme.colors.textMuted}
              secureTextEntry
              style={styles.input}
              value={password}
            />
            <PasswordStrength password={password} />
          </View>

          <Pressable
            disabled={loading}
            onPress={handleSignup}
            style={({ pressed }) => [
              styles.button,
              pressed && !loading ? styles.buttonPressed : null,
              loading ? styles.buttonDisabled : null,
            ]}
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.background} />
            ) : (
              <Text style={styles.buttonText}>Create account</Text>
            )}
          </Pressable>

          <Text style={styles.footerText}>
            Already have an account?{" "}
            <Link href="/(auth)/login" style={styles.footerLink}>
              Log in
            </Link>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: theme.layout.screenPadding,
    paddingVertical: theme.spacing.xxl,
    backgroundColor: theme.colors.background,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
    textTransform: "uppercase",
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
    marginBottom: theme.spacing.xl,
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
  helper: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
    lineHeight: 18,
  },
  button: {
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    marginTop: theme.spacing.sm,
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
  footerText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    textAlign: "center",
  },
  footerLink: {
    color: theme.colors.accent,
    fontWeight: theme.fontWeights.bold,
  },
});
