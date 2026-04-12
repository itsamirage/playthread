import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import SectionCard from "../components/SectionCard";
import { theme } from "../lib/theme";

export default function SteamPrivacyScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Steam Settings</Text>
        <Text style={styles.title}>How Steam data works on PlayThread</Text>
        <Text style={styles.subtitle}>
          Steam linking uses Steam sign-in to confirm account ownership. PlayThread only stores the
          public profile, library, and achievement data needed for profile features.
        </Text>
      </View>

      <SectionCard title="What PlayThread stores" eyebrow="Imported data">
        <View style={styles.list}>
          <Text style={styles.bodyText}>Public Steam profile details like display name and avatar.</Text>
          <Text style={styles.bodyText}>Owned Steam games and playtime used for your profile and showcase.</Text>
          <Text style={styles.bodyText}>Public achievement progress and unlocked achievements for synced games.</Text>
        </View>
      </SectionCard>

      <SectionCard title="What PlayThread does not store" eyebrow="Limits">
        <View style={styles.list}>
          <Text style={styles.bodyText}>Your Steam password, email, payment data, or private account settings.</Text>
          <Text style={styles.bodyText}>Private library or achievement data that Steam does not expose publicly.</Text>
          <Text style={styles.bodyText}>Anything outside the Steam profile, owned-games, and achievement sync flow.</Text>
        </View>
      </SectionCard>

      <SectionCard title="How sync behaves" eyebrow="Current product behavior">
        <View style={styles.list}>
          <Text style={styles.bodyText}>
            Full library sync imports owned Steam games, but initial achievement sync is intentionally
            limited to a small set of games.
          </Text>
          <Text style={styles.bodyText}>
            When you open a Steam game inside the showcase editor, PlayThread can sync that game's
            achievements on demand.
          </Text>
          <Text style={styles.bodyText}>
            Manual showcase picks are saved separately and future Steam syncs keep those choices instead
            of overwriting them.
          </Text>
        </View>
      </SectionCard>

      <SectionCard title="Unlinking Steam" eyebrow="Data removal">
        <View style={styles.list}>
          <Text style={styles.bodyText}>
            Unlinking removes the linked Steam account record from PlayThread.
          </Text>
          <Text style={styles.bodyText}>
            It also deletes synced Steam showcase items, Steam game stats, and Steam achievements from
            PlayThread.
          </Text>
          <Text style={styles.bodyText}>
            If you link again later, PlayThread will resync from Steam rather than restoring old sync data.
          </Text>
        </View>
      </SectionCard>

      <SectionCard title="Why Steam shows a Supabase domain" eyebrow="Branding note">
        <Text style={styles.bodyText}>
          Steam sign-in currently returns through PlayThread's Supabase backend domain because a custom
          PlayThread auth domain is not configured yet. Ownership verification is still enforced in the
          callback flow.
        </Text>
      </SectionCard>

      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
      >
        <Text style={styles.buttonText}>Back</Text>
      </Pressable>
    </ScrollView>
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
  },
  hero: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xl,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.xs,
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
  list: {
    gap: theme.spacing.sm,
  },
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  button: {
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
});
