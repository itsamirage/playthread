import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import SectionCard from "../components/SectionCard";
import { PLATFORM_COMMUNITIES, searchPlatformCommunities } from "../lib/communityHubs";
import { goBackOrFallback } from "../lib/navigation";
import { theme } from "../lib/theme";

export default function PlatformsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const query = String(params.q ?? "");
  const [draftQuery, setDraftQuery] = useState(query);
  const platforms = searchPlatformCommunities(query);

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const normalizedDraft = draftQuery.trim();
      const normalizedQuery = query.trim();

      if (normalizedDraft === normalizedQuery) {
        return;
      }

      router.replace({ pathname: "/platforms", params: normalizedDraft ? { q: normalizedDraft } : {} });
    }, 250);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [draftQuery, query, router]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Pressable onPress={() => goBackOrFallback(router, "/(tabs)/browse")} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>PlayThread</Text>
        <Text style={styles.title}>Platforms</Text>
        <Text style={styles.subtitle}>
          Platform communities are user-driven. No Metacritic scores here, just follows, reviews, discussions, and community posts.
        </Text>
      </View>

      <SectionCard title="Search" eyebrow="Browse platforms">
        <TextInput
          value={draftQuery}
          onChangeText={setDraftQuery}
          placeholder="Search Nintendo, Switch, N64, PSP, Steam Deck..."
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
        />
      </SectionCard>

      <View style={styles.list}>
        {(query ? platforms : PLATFORM_COMMUNITIES).map((platform) => (
          <Pressable
            key={platform.slug}
            onPress={() => router.push(`/community/${platform.slug}`)}
            style={styles.card}
          >
            <Text style={styles.cardEyebrow}>{platform.family}</Text>
            <Text style={styles.cardTitle}>{platform.title}</Text>
            <Text style={styles.cardBody}>{platform.subtitle}</Text>
          </Pressable>
        ))}
      </View>
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
    paddingBottom: theme.spacing.xxl,
  },
  hero: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xl,
  },
  backButton: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  backButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
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
  input: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  list: {
    gap: theme.spacing.md,
  },
  card: {
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.lg,
  },
  cardEyebrow: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
    textTransform: "uppercase",
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },
  cardBody: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
});
