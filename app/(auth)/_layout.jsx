import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text } from "react-native";

import { useAuth } from "../../lib/auth";
import { useFollows } from "../../lib/follows";
import { useOnboardingStatus } from "../../lib/onboarding";
import { theme } from "../../lib/theme";

export default function AuthLayout() {
  const { isLoading, session } = useAuth();
  const { isLoading: followsLoading, followedCount } = useFollows();
  const { isLoading: onboardingLoading, hasSeenOnboarding } =
    useOnboardingStatus(session?.user?.id);

  if (isLoading || followsLoading || onboardingLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
        <Text style={styles.text}>Checking your login...</Text>
      </SafeAreaView>
    );
  }

  if (session) {
    if (followedCount === 0 && !hasSeenOnboarding) {
      return <Redirect href="/onboarding" />;
    }

    return <Redirect href="/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  text: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
  },
});
