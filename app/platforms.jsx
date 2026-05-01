import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BottomNavBar from "../components/BottomNavBar";
import SectionCard from "../components/SectionCard";
import { PLATFORM_COMMUNITIES, PLATFORM_FAMILIES, searchCommunities, searchPlatformCommunities } from "../lib/communityHubs";
import { createCustomCommunity, useCustomCommunities } from "../lib/customCommunities";
import { goBackOrFallback } from "../lib/navigation";
import { bindRouteToTab } from "../lib/tabState";
import { theme } from "../lib/theme";

export default function PlatformsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const query = String(params.q ?? "");
  const [draftQuery, setDraftQuery] = useState(query);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSubtitle, setNewSubtitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const { communities: customCommunities, isLoading: customCommunitiesLoading, reload: reloadCustomCommunities } = useCustomCommunities();
  const platforms = searchPlatformCommunities(query);
  const customResults = searchCommunities(customCommunities, query);
  const groupedPlatforms = useMemo(
    () =>
      PLATFORM_FAMILIES.filter((family) => family !== "All").map((family) => ({
        family,
        items: PLATFORM_COMMUNITIES.filter((platform) => platform.family === family),
      })),
    [],
  );

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  useEffect(() => {
    bindRouteToTab("browse", query.trim() ? `/platforms?q=${encodeURIComponent(query.trim())}` : "/platforms");
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

  const handleCreateCommunity = async () => {
    if (!newTitle.trim() || !newSubtitle.trim() || !newBody.trim()) {
      Alert.alert("Missing details", "Add a name, short description, and community details.");
      return;
    }

    try {
      setIsCreating(true);
      const community = await createCustomCommunity({
        title: newTitle,
        subtitle: newSubtitle,
        body: newBody,
      });
      setNewTitle("");
      setNewSubtitle("");
      setNewBody("");
      setIsCreateOpen(false);
      await reloadCustomCommunities();
      if (community?.slug) {
        router.push(`/community/${community.slug}`);
      }
    } catch (error) {
      Alert.alert("Community not created", error instanceof Error ? error.message : "Could not create that community.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <View style={styles.screen}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={{ paddingTop: insets.top + theme.spacing.md }} />
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

      <SectionCard title="Create community" eyebrow="User communities">
        {isCreateOpen ? (
          <View style={styles.form}>
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Community name"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={newSubtitle}
              onChangeText={setNewSubtitle}
              placeholder="Short description"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={newBody}
              onChangeText={setNewBody}
              multiline
              placeholder="What belongs in this community?"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, styles.textArea]}
            />
            <View style={styles.actionRow}>
              <Pressable onPress={() => setIsCreateOpen(false)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleCreateCommunity} disabled={isCreating} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{isCreating ? "Creating..." : "Create"}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setIsCreateOpen(true)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Start a community</Text>
          </Pressable>
        )}
      </SectionCard>

      {query ? (
        <View style={styles.list}>
          {customResults.map((community) => (
            <Pressable
              key={community.slug}
              onPress={() => router.push(`/community/${community.slug}`)}
              style={styles.card}
            >
              <Text style={styles.cardEyebrow}>Custom community</Text>
              <Text style={styles.cardTitle}>{community.title}</Text>
              <Text style={styles.cardBody}>{community.subtitle}</Text>
            </Pressable>
          ))}
          {platforms.map((platform) => (
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
      ) : (
        <View style={styles.familySections}>
          <SectionCard title="Custom" eyebrow={`${customCommunities.length} communities`}>
            {customCommunitiesLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.colors.accent} />
                <Text style={styles.cardBody}>Loading communities...</Text>
              </View>
            ) : customCommunities.length > 0 ? (
              <View style={styles.list}>
                {customCommunities.map((community) => (
                  <Pressable
                    key={community.slug}
                    onPress={() => router.push(`/community/${community.slug}`)}
                    style={styles.card}
                  >
                    <Text style={styles.cardEyebrow}>Created by @{community.creatorName}</Text>
                    <Text style={styles.cardTitle}>{community.title}</Text>
                    <Text style={styles.cardBody}>{community.subtitle}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.cardBody}>No custom communities yet.</Text>
            )}
          </SectionCard>
          {groupedPlatforms.map((group) => (
            <SectionCard key={group.family} title={group.family} eyebrow={`${group.items.length} communities`}>
              <View style={styles.list}>
                {group.items.map((platform) => (
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
            </SectionCard>
          ))}
        </View>
      )}
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
  hero: {
    gap: theme.spacing.sm,
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
  form: {
    gap: theme.spacing.md,
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    flex: 1,
    paddingVertical: theme.spacing.md,
  },
  primaryButtonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    flex: 1,
    paddingVertical: theme.spacing.md,
  },
  secondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  loadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  familySections: {
    gap: theme.spacing.lg,
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
