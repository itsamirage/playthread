import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import SectionCard from "../components/SectionCard";
import {
  adjustCoins,
  formatAccountAge,
  formatCoinCount,
  getAvailableCoins,
  getLifetimeCoins,
  isAdminRole,
  isStaffRole,
  pruneIntegrityData,
  setContentVisibility,
  setBanState,
  setFlagStatus,
  updateIntegritySettings,
  updateMemberRole,
  useAdminProfiles,
  useIntegrityEvents,
  useIntegrityReport,
  useIntegritySettings,
  useModerationActions,
  useModerationFlags,
  useMyAdminProfile,
} from "../lib/admin";
import {
  buildIntegrityOverview,
  buildIntegritySignals,
  canModerateFlagContent,
  filterFlags,
  filterIntegrityEvents,
  formatActionType,
  paginateItems,
} from "../lib/adminInsights";
import { getProfileNameColor } from "../lib/profileAppearance";
import { theme } from "../lib/theme";

function parseGameIds(value) {
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => !Number.isNaN(item) && item > 0);
}

export default function AdminScreen() {
  const router = useRouter();
  const { profile: currentProfile, isLoading: currentProfileLoading, reload: reloadCurrentProfile } =
    useMyAdminProfile();
  const { profiles, isLoading: profilesLoading, reload: reloadProfiles } = useAdminProfiles();
  const { flags, isLoading: flagsLoading, reload: reloadFlags } = useModerationFlags(currentProfile);
  const { events: integrityEvents, isLoading: integrityEventsLoading, reload: reloadIntegrityEvents } =
    useIntegrityEvents(currentProfile);
  const { settings: integritySettings, isLoading: integritySettingsLoading, reload: reloadIntegritySettings } =
    useIntegritySettings(currentProfile);
  const { report: integrityReport, isLoading: integrityReportLoading, reload: reloadIntegrityReport } =
    useIntegrityReport(currentProfile, 14);
  const { actions: moderationActions, isLoading: moderationActionsLoading, reload: reloadModerationActions } =
    useModerationActions(currentProfile);
  const [bannedReason, setBannedReason] = useState("");
  const [coinAdjustment, setCoinAdjustment] = useState("");
  const [coinReason, setCoinReason] = useState("");
  const [scopeDrafts, setScopeDrafts] = useState({});
  const [integrityDraft, setIntegrityDraft] = useState(null);
  const [flagStatusFilter, setFlagStatusFilter] = useState("all");
  const [flagOriginFilter, setFlagOriginFilter] = useState("all");
  const [flagSearch, setFlagSearch] = useState("");
  const [flagPage, setFlagPage] = useState(1);
  const [integrityTypeFilter, setIntegrityTypeFilter] = useState("all");
  const [integritySearch, setIntegritySearch] = useState("");
  const [integrityPage, setIntegrityPage] = useState(1);
  const [selectedFlag, setSelectedFlag] = useState(null);
  const [selectedIntegrityEvent, setSelectedIntegrityEvent] = useState(null);
  const [selectedAction, setSelectedAction] = useState(null);
  const [workingKey, setWorkingKey] = useState(null);
  const [retentionDraft, setRetentionDraft] = useState({
    integrityRetentionDays: "90",
    moderationActionRetentionDays: "365",
  });

  const manageableProfiles = useMemo(
    () => profiles.filter((profile) => profile.id !== currentProfile?.id),
    [currentProfile?.id, profiles]
  );

  const integrityFlagCount = useMemo(
    () => flags.filter((flag) => flag.origin === "integrity").length,
    [flags]
  );
  const filteredFlags = useMemo(
    () => filterFlags(flags, { status: flagStatusFilter, origin: flagOriginFilter, search: flagSearch }),
    [flagOriginFilter, flagSearch, flagStatusFilter, flags]
  );
  const pagedFlags = useMemo(() => paginateItems(filteredFlags, flagPage, 8), [filteredFlags, flagPage]);
  const filteredIntegrityEvents = useMemo(
    () => filterIntegrityEvents(integrityEvents, { eventType: integrityTypeFilter, search: integritySearch }),
    [integrityEvents, integritySearch, integrityTypeFilter]
  );
  const pagedIntegrityEvents = useMemo(
    () => paginateItems(filteredIntegrityEvents, integrityPage, 8),
    [filteredIntegrityEvents, integrityPage]
  );
  const integritySignals = useMemo(
    () => buildIntegritySignals(integrityEvents, flags),
    [flags, integrityEvents]
  );
  const integrityOverview = useMemo(
    () => buildIntegrityOverview(integrityReport.dailySummary, integrityReport.blockedSummary),
    [integrityReport.blockedSummary, integrityReport.dailySummary]
  );

  useEffect(() => {
    if (!integritySettings) {
      return;
    }

    setIntegrityDraft({
      lookbackDays: String(integritySettings.lookbackDays),
      maxDistinctAccountsPerIp: String(integritySettings.maxDistinctAccountsPerIp),
      maxDistinctPositiveAccountsPerPost: String(integritySettings.maxDistinctPositiveAccountsPerPost),
      maxDistinctPositiveAccountsPerComment: String(integritySettings.maxDistinctPositiveAccountsPerComment),
      maxDistinctPositiveAccountsPerTarget: String(integritySettings.maxDistinctPositiveAccountsPerTarget),
    });
  }, [integritySettings]);

  useEffect(() => {
    setFlagPage(1);
  }, [flagStatusFilter, flagOriginFilter, flagSearch]);

  useEffect(() => {
    setIntegrityPage(1);
  }, [integrityTypeFilter, integritySearch]);

  const handleSetRole = async (member, accountRole) => {
    if (!currentProfile?.id) {
      return;
    }

    try {
      setWorkingKey(`role:${member.id}:${accountRole}`);
      await updateMemberRole({
        actorUserId: currentProfile.id,
        targetUserId: member.id,
        accountRole,
        moderationScope: member.moderationScope ?? "all",
        moderationGameIds: member.moderationGameIds ?? [],
      });
      await reloadProfiles();
      await reloadModerationActions();
    } catch (error) {
      Alert.alert("Role update failed", error instanceof Error ? error.message : "Could not update that role.");
    } finally {
      setWorkingKey(null);
    }
  };

  const handleSetScope = async (member, moderationScope) => {
    if (!currentProfile?.id) {
      return;
    }

    try {
      setWorkingKey(`scope:${member.id}:${moderationScope}`);
      await updateMemberRole({
        actorUserId: currentProfile.id,
        targetUserId: member.id,
        accountRole: member.accountRole,
        moderationScope,
        moderationGameIds:
          moderationScope === "games"
            ? parseGameIds(scopeDrafts[member.id] ?? member.moderationGameIds.join(","))
            : [],
      });
      await reloadProfiles();
      await reloadModerationActions();
    } catch (error) {
      Alert.alert("Scope update failed", error instanceof Error ? error.message : "Could not save moderator scope.");
    } finally {
      setWorkingKey(null);
    }
  };

  const handleBanToggle = async (member, nextIsBanned) => {
    if (!currentProfile?.id) {
      return;
    }

    try {
      setWorkingKey(`ban:${member.id}`);
      await setBanState({
        actorUserId: currentProfile.id,
        targetUserId: member.id,
        isBanned: nextIsBanned,
        bannedReason: nextIsBanned ? bannedReason : null,
      });
      await reloadProfiles();
    } catch (error) {
      Alert.alert("Moderation update failed", error instanceof Error ? error.message : "Could not update that account.");
    } finally {
      setWorkingKey(null);
    }
  };

  const handleFlagStatus = async (flagId, status) => {
    if (!currentProfile?.id) {
      return;
    }

    try {
      setWorkingKey(`flag:${flagId}:${status}`);
      const { error } = await setFlagStatus({
        flagId,
        status,
        reviewerId: currentProfile.id,
      });

      if (error) {
        throw error;
      }

      await reloadFlags();
      await reloadIntegrityEvents();
      await reloadIntegrityReport();
      await reloadModerationActions();
    } catch (error) {
      Alert.alert("Flag update failed", error instanceof Error ? error.message : "Could not update that flag.");
    } finally {
      setWorkingKey(null);
    }
  };

  const handleSaveIntegritySettings = async () => {
    if (!integrityDraft || currentProfile?.accountRole !== "owner") {
      return;
    }

    try {
      setWorkingKey("integrity-settings");
      await updateIntegritySettings({
        lookbackDays: Number(integrityDraft.lookbackDays),
        maxDistinctAccountsPerIp: Number(integrityDraft.maxDistinctAccountsPerIp),
        maxDistinctPositiveAccountsPerPost: Number(integrityDraft.maxDistinctPositiveAccountsPerPost),
        maxDistinctPositiveAccountsPerComment: Number(integrityDraft.maxDistinctPositiveAccountsPerComment),
        maxDistinctPositiveAccountsPerTarget: Number(integrityDraft.maxDistinctPositiveAccountsPerTarget),
      });
      await reloadIntegritySettings();
      await reloadModerationActions();
    } catch (error) {
      Alert.alert("Integrity settings failed", error instanceof Error ? error.message : "Could not save integrity settings.");
    } finally {
      setWorkingKey(null);
    }
  };

  const handleSetContentVisibility = async (flag, visibility) => {
    if (!flag?.id) {
      return;
    }

    try {
      setWorkingKey(`content:${flag.id}:${visibility}`);
      await setContentVisibility({
        flagId: flag.id,
        visibility,
      });
      await reloadFlags();
      await reloadIntegrityReport();
      await reloadModerationActions();
    } catch (error) {
      Alert.alert("Content update failed", error instanceof Error ? error.message : "Could not update that content.");
    } finally {
      setWorkingKey(null);
    }
  };

  const handlePruneIntegrityData = async () => {
    if (currentProfile?.accountRole !== "owner") {
      return;
    }

    try {
      setWorkingKey("retention-prune");
      const result = await pruneIntegrityData({
        integrityRetentionDays: Number(retentionDraft.integrityRetentionDays),
        moderationActionRetentionDays: Number(retentionDraft.moderationActionRetentionDays),
      });
      await reloadIntegrityReport();
      await reloadModerationActions();
      Alert.alert(
        "Retention prune complete",
        `${result?.result?.deleted_integrity_events ?? 0} integrity events and ${result?.result?.deleted_review_actions ?? 0} review actions were removed.`
      );
    } catch (error) {
      Alert.alert("Retention prune failed", error instanceof Error ? error.message : "Could not prune retained data.");
    } finally {
      setWorkingKey(null);
    }
  };

  const handleShowAuthorContext = (username) => {
    if (!username) {
      return;
    }

    setFlagSearch(username);
    setIntegritySearch(username);
  };

  const handleShowNetworkContext = (requestIpHash) => {
    if (!requestIpHash) {
      return;
    }

    setIntegritySearch(requestIpHash);
  };

  const handleShowActionContext = (username) => {
    if (!username) {
      return;
    }

    setFlagSearch(username);
    setIntegritySearch(username);
  };

  const handleAdjustCoins = async (member, amount) => {
    if (!currentProfile?.id) {
      return;
    }

    try {
      setWorkingKey(`coins:${member.id}:${amount}`);
      await adjustCoins({
        actorUserId: currentProfile.id,
        targetUserId: member.id,
        amount,
        note: coinReason,
      });
      await reloadProfiles();
      setCoinAdjustment("");
    } catch (error) {
      Alert.alert("Coin adjustment failed", error instanceof Error ? error.message : "Could not adjust coins.");
    } finally {
      setWorkingKey(null);
    }
  };

  const handleIntegrityActorBanToggle = async (event, nextIsBanned) => {
    if (!event?.userId || !currentProfile?.id) {
      return;
    }

    try {
      setWorkingKey(`integrity-ban:${event.id}`);
      await setBanState({
        actorUserId: currentProfile.id,
        targetUserId: event.userId,
        isBanned: nextIsBanned,
        bannedReason: nextIsBanned ? `Integrity action from ${event.eventType}` : null,
      });
      await reloadProfiles();
      await reloadModerationActions();
    } catch (error) {
      Alert.alert("Integrity action failed", error instanceof Error ? error.message : "Could not update that account.");
    } finally {
      setWorkingKey(null);
    }
  };

  if (currentProfileLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (!isStaffRole(currentProfile?.accountRole)) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <SectionCard title="Not available" eyebrow="Admin">
          <Text style={styles.bodyText}>This screen is only available to moderators, admins, and the platform owner.</Text>
          <Pressable onPress={() => router.back()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Go back</Text>
          </Pressable>
        </SectionCard>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>PlayThread</Text>
        <Text style={styles.title}>Admin</Text>
        <Text style={styles.subtitle}>
          Review flagged content, ban or restore users, assign moderators, and correct coin balances.
        </Text>
      </View>

      <SectionCard title="Your authority" eyebrow="Access">
        <Text style={styles.bodyText}>
          Role: {currentProfile?.accountRole}. {currentProfile?.integrityExempt ? "This account is exempt from future IP-integrity checks." : "This account follows normal integrity rules."}
        </Text>
        <Text style={styles.helperText}>
          Trusted server writes and IP-hash integrity enforcement are live. Integrity queue entries: {integrityFlagCount}.
        </Text>
      </SectionCard>

      <SectionCard title="Integrity reporting" eyebrow="Last 14 days">
        {integrityReportLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.helperText}>Loading integrity summaries...</Text>
          </View>
        ) : (
          <>
            <View style={styles.inlineRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{integrityOverview.totalEvents}</Text>
                <Text style={styles.statLabel}>Events</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{integrityOverview.totalPositiveEvents}</Text>
                <Text style={styles.statLabel}>Positive</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{integrityOverview.totalBlockedEvents}</Text>
                <Text style={styles.statLabel}>Blocked</Text>
              </View>
            </View>
            <View style={styles.inlineRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{integrityOverview.distinctNetworks}</Text>
                <Text style={styles.statLabel}>Summary networks</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{integrityOverview.distinctActors}</Text>
                <Text style={styles.statLabel}>Summary actors</Text>
              </View>
            </View>
            {integrityReport.dailySummary.length > 0 ? (
              <View style={styles.cardList}>
                {integrityReport.dailySummary.slice(0, 6).map((row) => (
                  <View key={`${row.summaryDay}:${row.eventType}`} style={styles.card}>
                    <Text style={styles.cardTitle}>{row.eventType}</Text>
                    <Text style={styles.cardMeta}>
                      {new Date(row.summaryDay).toLocaleDateString()} • {row.eventCount} events • {row.positiveCount} positive
                    </Text>
                    <Text style={styles.excerptText}>
                      {row.distinctActorCount} actors • {row.distinctTargetCount} targets • {row.distinctNetworkCount} networks
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.bodyText}>No integrity summary rows are available yet.</Text>
            )}
            {integrityReport.blockedSummary.length > 0 ? (
              <View style={styles.cardList}>
                {integrityReport.blockedSummary.slice(0, 4).map((row) => (
                  <View key={`${row.summaryDay}:${row.blockedEventType}`} style={styles.card}>
                    <Text style={styles.cardTitle}>Blocked {row.blockedEventType}</Text>
                    <Text style={styles.cardMeta}>
                      {new Date(row.summaryDay).toLocaleDateString()} • {row.blockedCount} blocked
                    </Text>
                    <Text style={styles.excerptText}>
                      {row.distinctActorCount} actors • {row.distinctNetworkCount} networks
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </SectionCard>

      {currentProfile?.accountRole === "owner" ? (
        <SectionCard title="Retention operations" eyebrow="Owner only">
          <Text style={styles.helperText}>
            Manual prune is the current operational path. Start with 90 days for integrity events and 365 days for review audit records unless support needs longer history.
          </Text>
          <TextInput
            onChangeText={(value) =>
              setRetentionDraft((current) => ({ ...current, integrityRetentionDays: value }))
            }
            placeholder="Integrity retention days"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.textInput}
            value={retentionDraft.integrityRetentionDays}
          />
          <TextInput
            onChangeText={(value) =>
              setRetentionDraft((current) => ({ ...current, moderationActionRetentionDays: value }))
            }
            placeholder="Moderation action retention days"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.textInput}
            value={retentionDraft.moderationActionRetentionDays}
          />
          <Pressable onPress={handlePruneIntegrityData} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>
              {workingKey === "retention-prune" ? "Pruning..." : "Run retention prune"}
            </Text>
          </Pressable>
        </SectionCard>
      ) : null}

      <SectionCard title="Moderation queue" eyebrow="Flagged content">
        <TextInput
          onChangeText={setFlagSearch}
          placeholder="Search flags by author, reason, game, category"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.textInput}
          value={flagSearch}
        />
        <View style={styles.inlineRow}>
          {["all", "open", "reviewed", "dismissed", "actioned"].map((status) => (
            <Pressable
              key={status}
              onPress={() => setFlagStatusFilter(status)}
              style={[
                styles.secondaryButton,
                flagStatusFilter === status ? styles.filterChipActive : null,
              ]}
            >
              <Text style={styles.secondaryButtonText}>{status}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.inlineRow}>
          {["all", "automatic", "manual", "integrity"].map((origin) => (
            <Pressable
              key={origin}
              onPress={() => setFlagOriginFilter(origin)}
              style={[
                styles.secondaryButton,
                flagOriginFilter === origin ? styles.filterChipActive : null,
              ]}
            >
              <Text style={styles.secondaryButtonText}>{origin}</Text>
            </Pressable>
          ))}
        </View>
        {flagsLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.helperText}>Loading flagged content...</Text>
          </View>
        ) : filteredFlags.length > 0 ? (
          <View style={styles.cardList}>
            {pagedFlags.items.map((flag) => (
              <View key={flag.id} style={styles.card}>
                <Text style={styles.cardTitle}>
                  {flag.category} • <Text style={{ color: getProfileNameColor(flag.authorNameColor) }}>@{flag.author}</Text> • {flag.contentType}
                </Text>
                <Text style={styles.cardMeta}>
                  {flag.gameTitle ? `${flag.gameTitle} • ` : ""}{flag.status} • {new Date(flag.createdAt).toLocaleString()}
                </Text>
                <Text style={styles.bodyText}>{flag.reason}</Text>
                {flag.excerpt ? <Text style={styles.excerptText}>{flag.excerpt}</Text> : null}
                <View style={styles.inlineRow}>
                  <Pressable onPress={() => setSelectedFlag(flag)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Inspect</Text>
                  </Pressable>
                  {canModerateFlagContent(flag) ? (
                    <>
                      <Pressable
                        onPress={() => handleSetContentVisibility(flag, "hidden")}
                        style={({ pressed }) => [styles.secondaryButton, pressed ? styles.buttonPressed : null]}
                      >
                        <Text style={styles.secondaryButtonText}>
                          {workingKey === `content:${flag.id}:hidden` ? "Saving..." : "Hide content"}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleSetContentVisibility(flag, "clean")}
                        style={({ pressed }) => [styles.secondaryButton, pressed ? styles.buttonPressed : null]}
                      >
                        <Text style={styles.secondaryButtonText}>
                          {workingKey === `content:${flag.id}:clean` ? "Saving..." : "Restore content"}
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                  {["reviewed", "dismissed", "actioned"].map((status) => (
                    <Pressable
                      key={status}
                      onPress={() => handleFlagStatus(flag.id, status)}
                      style={({ pressed }) => [styles.secondaryButton, pressed ? styles.buttonPressed : null]}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {workingKey === `flag:${flag.id}:${status}` ? "Saving..." : status}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
            <View style={styles.paginationRow}>
              <Pressable
                disabled={pagedFlags.page <= 1}
                onPress={() => setFlagPage((current) => Math.max(1, current - 1))}
                style={[styles.secondaryButton, pagedFlags.page <= 1 ? styles.buttonDisabled : null]}
              >
                <Text style={styles.secondaryButtonText}>Previous</Text>
              </Pressable>
              <Text style={styles.cardMeta}>Page {pagedFlags.page} of {pagedFlags.pageCount}</Text>
              <Pressable
                disabled={pagedFlags.page >= pagedFlags.pageCount}
                onPress={() => setFlagPage((current) => Math.min(pagedFlags.pageCount, current + 1))}
                style={[styles.secondaryButton, pagedFlags.page >= pagedFlags.pageCount ? styles.buttonDisabled : null]}
              >
                <Text style={styles.secondaryButtonText}>Next</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Text style={styles.bodyText}>No flagged content is waiting right now.</Text>
        )}
      </SectionCard>

      <SectionCard title="Integrity queue" eyebrow="Network enforcement">
        <TextInput
          onChangeText={setIntegritySearch}
          placeholder="Search integrity events by actor, target, hash, metadata"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.textInput}
          value={integritySearch}
        />
        <View style={styles.inlineRow}>
          {["all", "post_create", "comment_create", "post_reaction", "comment_reaction", "coin_gift", "coin_adjustment", "store_spend"].map((eventType) => (
            <Pressable
              key={eventType}
              onPress={() => setIntegrityTypeFilter(eventType)}
              style={[
                styles.secondaryButton,
                integrityTypeFilter === eventType ? styles.filterChipActive : null,
              ]}
            >
              <Text style={styles.secondaryButtonText}>{eventType}</Text>
            </Pressable>
          ))}
        </View>
        {integritySignals.length > 0 ? (
          <View style={styles.cardList}>
            {integritySignals.slice(0, 4).map((signal) => (
              <View key={signal.key} style={styles.card}>
                <Text style={styles.cardTitle}>Signal {signal.score} • {signal.eventType}</Text>
                <Text style={styles.cardMeta}>
                  {signal.eventCount} events • {signal.positiveCount} positive • {signal.blockedCount} blocked • {signal.actorCount} actors
                </Text>
                <Text style={styles.excerptText}>
                  IP hash {String(signal.requestIpHash).slice(0, 12)}... {signal.target ? `• target ${signal.target}` : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {integrityEventsLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.helperText}>Loading integrity events...</Text>
          </View>
        ) : filteredIntegrityEvents.length > 0 ? (
          <View style={styles.cardList}>
            {pagedIntegrityEvents.items.map((event) => (
              <View key={event.id} style={styles.card}>
                <Text style={styles.cardTitle}>
                  {event.eventType} • <Text style={{ color: getProfileNameColor(event.actorNameColor) }}>@{event.actor}</Text>
                  {event.target ? <Text style={styles.cardTitleMuted}> -> @{event.target}</Text> : null}
                </Text>
                <Text style={styles.cardMeta}>
                  {new Date(event.createdAt).toLocaleString()} • {event.isPositive ? "positive action" : "neutral action"}
                </Text>
                <Text style={styles.bodyText}>IP hash {String(event.requestIpHash).slice(0, 12)}...</Text>
                <Text style={styles.excerptText}>{JSON.stringify(event.metadata)}</Text>
                <View style={styles.inlineRow}>
                  <Pressable onPress={() => setSelectedIntegrityEvent(event)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Inspect</Text>
                  </Pressable>
                  {isAdminRole(currentProfile?.accountRole) ? (
                    <>
                    <Pressable
                      onPress={() => handleIntegrityActorBanToggle(event, true)}
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {workingKey === `integrity-ban:${event.id}` ? "Saving..." : "Ban actor"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleIntegrityActorBanToggle(event, false)}
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryButtonText}>Restore actor</Text>
                    </Pressable>
                    </>
                  ) : null}
                </View>
              </View>
            ))}
            <View style={styles.paginationRow}>
              <Pressable
                disabled={pagedIntegrityEvents.page <= 1}
                onPress={() => setIntegrityPage((current) => Math.max(1, current - 1))}
                style={[styles.secondaryButton, pagedIntegrityEvents.page <= 1 ? styles.buttonDisabled : null]}
              >
                <Text style={styles.secondaryButtonText}>Previous</Text>
              </Pressable>
              <Text style={styles.cardMeta}>Page {pagedIntegrityEvents.page} of {pagedIntegrityEvents.pageCount}</Text>
              <Pressable
                disabled={pagedIntegrityEvents.page >= pagedIntegrityEvents.pageCount}
                onPress={() => setIntegrityPage((current) => Math.min(pagedIntegrityEvents.pageCount, current + 1))}
                style={[styles.secondaryButton, pagedIntegrityEvents.page >= pagedIntegrityEvents.pageCount ? styles.buttonDisabled : null]}
              >
                <Text style={styles.secondaryButtonText}>Next</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Text style={styles.bodyText}>No integrity events recorded yet.</Text>
        )}
      </SectionCard>

      {isAdminRole(currentProfile?.accountRole) ? (
        <SectionCard title="Integrity settings" eyebrow="Thresholds">
          {integritySettingsLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={theme.colors.accent} />
              <Text style={styles.helperText}>Loading integrity settings...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.helperText}>
                These thresholds control same-network activity blocking. Owner-only edits.
              </Text>
              <TextInput
                onChangeText={(value) => setIntegrityDraft((current) => ({ ...(current ?? {}), lookbackDays: value }))}
                placeholder="Lookback days"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.textInput}
                value={integrityDraft?.lookbackDays ?? ""}
              />
              <TextInput
                onChangeText={(value) =>
                  setIntegrityDraft((current) => ({ ...(current ?? {}), maxDistinctAccountsPerIp: value }))
                }
                placeholder="Max distinct accounts per IP"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.textInput}
                value={integrityDraft?.maxDistinctAccountsPerIp ?? ""}
              />
              <TextInput
                onChangeText={(value) =>
                  setIntegrityDraft((current) => ({
                    ...(current ?? {}),
                    maxDistinctPositiveAccountsPerPost: value,
                  }))
                }
                placeholder="Max positive accounts per post"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.textInput}
                value={integrityDraft?.maxDistinctPositiveAccountsPerPost ?? ""}
              />
              <TextInput
                onChangeText={(value) =>
                  setIntegrityDraft((current) => ({
                    ...(current ?? {}),
                    maxDistinctPositiveAccountsPerComment: value,
                  }))
                }
                placeholder="Max positive accounts per comment"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.textInput}
                value={integrityDraft?.maxDistinctPositiveAccountsPerComment ?? ""}
              />
              <TextInput
                onChangeText={(value) =>
                  setIntegrityDraft((current) => ({
                    ...(current ?? {}),
                    maxDistinctPositiveAccountsPerTarget: value,
                  }))
                }
                placeholder="Max positive accounts per target"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.textInput}
                value={integrityDraft?.maxDistinctPositiveAccountsPerTarget ?? ""}
              />
              {currentProfile?.accountRole === "owner" ? (
                <Pressable onPress={handleSaveIntegritySettings} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>
                    {workingKey === "integrity-settings" ? "Saving..." : "Save integrity settings"}
                  </Text>
                </Pressable>
              ) : (
                <Text style={styles.helperText}>Only the owner can change these thresholds.</Text>
              )}
            </>
          )}
        </SectionCard>
      ) : null}

      {isAdminRole(currentProfile?.accountRole) ? (
        <SectionCard title="Member controls" eyebrow="Ban, promote, coins">
          <TextInput
            onChangeText={setBannedReason}
            placeholder="Ban reason used for the next moderation action"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.textInput}
            value={bannedReason}
          />
          <TextInput
            onChangeText={setCoinAdjustment}
            placeholder="Coin adjustment amount, for example 250 or -250"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.textInput}
            value={coinAdjustment}
          />
          <TextInput
            onChangeText={setCoinReason}
            placeholder="Reason for coin adjustment"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.textInput}
            value={coinReason}
          />

          {profilesLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={theme.colors.accent} />
              <Text style={styles.helperText}>Loading members...</Text>
            </View>
          ) : (
            <View style={styles.cardList}>
              {manageableProfiles.map((member) => (
                <View key={member.id} style={styles.card}>
                  <Text style={styles.cardTitle}>
                    <Text style={{ color: getProfileNameColor(member.selectedNameColor) }}>@{member.displayName}</Text>
                    <Text style={styles.cardTitleMuted}> @{member.username}</Text>
                  </Text>
                  <Text style={styles.cardMeta}>
                    {member.accountRole} • {formatAccountAge(member.createdAt)} • {formatCoinCount(getAvailableCoins(member))} available
                  </Text>
                  <Text style={styles.cardMeta}>
                    Lifetime {formatCoinCount(getLifetimeCoins(member))} • Spent {formatCoinCount(member.coinsSpent ?? 0)} • Gifts {formatCoinCount(member.coinsFromGifts ?? 0)} • Adjustments {formatCoinCount(member.coinsFromAdjustments ?? 0)}
                  </Text>
                  {member.isBanned ? (
                    <Text style={styles.warningText}>Banned{member.bannedReason ? `: ${member.bannedReason}` : ""}</Text>
                  ) : null}

                  <View style={styles.inlineRow}>
                    <Pressable onPress={() => handleSetRole(member, "member")} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>
                        {workingKey === `role:${member.id}:member` ? "Saving..." : "Member"}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => handleSetRole(member, "moderator")} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>
                        {workingKey === `role:${member.id}:moderator` ? "Saving..." : "Moderator"}
                      </Text>
                    </Pressable>
                    {currentProfile?.accountRole === "owner" ? (
                      <Pressable onPress={() => handleSetRole(member, "admin")} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>
                          {workingKey === `role:${member.id}:admin` ? "Saving..." : "Admin"}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>

                  {member.accountRole === "moderator" ? (
                    <>
                      <View style={styles.inlineRow}>
                        <Pressable onPress={() => handleSetScope(member, "all")} style={styles.secondaryButton}>
                          <Text style={styles.secondaryButtonText}>
                            {workingKey === `scope:${member.id}:all` ? "Saving..." : "Moderate all"}
                          </Text>
                        </Pressable>
                        <Pressable onPress={() => handleSetScope(member, "games")} style={styles.secondaryButton}>
                          <Text style={styles.secondaryButtonText}>
                            {workingKey === `scope:${member.id}:games` ? "Saving..." : "Specific games"}
                          </Text>
                        </Pressable>
                      </View>
                      <TextInput
                        onChangeText={(value) => setScopeDrafts((current) => ({ ...current, [member.id]: value }))}
                        placeholder="Comma-separated IGDB game IDs for moderator scope"
                        placeholderTextColor={theme.colors.textMuted}
                        style={styles.textInput}
                        value={scopeDrafts[member.id] ?? member.moderationGameIds.join(",")}
                      />
                    </>
                  ) : null}

                  <View style={styles.inlineRow}>
                    <Pressable
                      onPress={() => handleAdjustCoins(member, Number(coinAdjustment))}
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {workingKey === `coins:${member.id}:${Number(coinAdjustment)}` ? "Saving..." : "Apply coin change"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleAdjustCoins(member, -Math.abs(Number(coinAdjustment || 0)))}
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryButtonText}>Remove coins</Text>
                    </Pressable>
                  </View>

                  <Pressable
                    onPress={() => handleBanToggle(member, !member.isBanned)}
                    style={[styles.primaryButton, member.isBanned ? styles.restoreButton : styles.banButton]}
                  >
                    <Text style={styles.primaryButtonText}>
                      {workingKey === `ban:${member.id}` ? "Saving..." : member.isBanned ? "Restore user" : "Ban user"}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </SectionCard>
      ) : null}

      {(selectedFlag || selectedIntegrityEvent || selectedAction) ? (
        <SectionCard title="Drill-down" eyebrow="Selected record">
          {selectedFlag ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Flag • @{selectedFlag.author}</Text>
              <Text style={styles.cardMeta}>
                {selectedFlag.origin} • {selectedFlag.status} • {new Date(selectedFlag.createdAt).toLocaleString()}
              </Text>
              <Text style={styles.bodyText}>{selectedFlag.reason}</Text>
              <Text style={styles.excerptText}>{JSON.stringify(selectedFlag.evidence)}</Text>
              <View style={styles.inlineRow}>
                <Pressable onPress={() => handleShowAuthorContext(selectedFlag.author)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Find author context</Text>
                </Pressable>
                {selectedFlag.evidence?.request_ip_hash ? (
                  <Pressable
                    onPress={() => handleShowNetworkContext(selectedFlag.evidence.request_ip_hash)}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>Find matching network</Text>
                  </Pressable>
                ) : null}
              </View>
              {canModerateFlagContent(selectedFlag) ? (
                <View style={styles.inlineRow}>
                  <Pressable onPress={() => handleSetContentVisibility(selectedFlag, "hidden")} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>
                      {workingKey === `content:${selectedFlag.id}:hidden` ? "Saving..." : "Hide content"}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => handleSetContentVisibility(selectedFlag, "clean")} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>
                      {workingKey === `content:${selectedFlag.id}:clean` ? "Saving..." : "Restore content"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}
          {selectedIntegrityEvent ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Integrity event • @{selectedIntegrityEvent.actor}</Text>
              <Text style={styles.cardMeta}>
                {selectedIntegrityEvent.eventType} • {new Date(selectedIntegrityEvent.createdAt).toLocaleString()}
              </Text>
              <Text style={styles.bodyText}>
                IP hash {String(selectedIntegrityEvent.requestIpHash).slice(0, 24)}...
              </Text>
              <Text style={styles.excerptText}>{JSON.stringify(selectedIntegrityEvent.metadata)}</Text>
              <View style={styles.inlineRow}>
                <Pressable onPress={() => handleShowAuthorContext(selectedIntegrityEvent.actor)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Find actor flags</Text>
                </Pressable>
                <Pressable onPress={() => handleShowNetworkContext(selectedIntegrityEvent.requestIpHash)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Find same network</Text>
                </Pressable>
                {selectedIntegrityEvent.target ? (
                  <Pressable onPress={() => handleShowActionContext(selectedIntegrityEvent.target)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Find target context</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
          {selectedAction ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                Audit action • {formatActionType(selectedAction.actionType)}
              </Text>
              <Text style={styles.cardMeta}>
                @{selectedAction.actor} -> @{selectedAction.target} • {new Date(selectedAction.createdAt).toLocaleString()}
              </Text>
              {selectedAction.reason ? <Text style={styles.bodyText}>{selectedAction.reason}</Text> : null}
              <Text style={styles.excerptText}>{JSON.stringify(selectedAction.metadata)}</Text>
              <View style={styles.inlineRow}>
                <Pressable onPress={() => handleShowActionContext(selectedAction.actor)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Find actor context</Text>
                </Pressable>
                <Pressable onPress={() => handleShowActionContext(selectedAction.target)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Find target context</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          <Pressable
            onPress={() => {
              setSelectedFlag(null);
              setSelectedIntegrityEvent(null);
              setSelectedAction(null);
            }}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Clear selection</Text>
          </Pressable>
        </SectionCard>
      ) : null}

      <SectionCard title="Audit log" eyebrow="Moderation actions">
        {moderationActionsLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.helperText}>Loading moderation history...</Text>
          </View>
        ) : moderationActions.length > 0 ? (
          <View style={styles.cardList}>
            {moderationActions.slice(0, 20).map((action) => (
              <View key={action.id} style={styles.card}>
                <Text style={styles.cardTitle}>
                  {formatActionType(action.actionType)} • <Text style={{ color: getProfileNameColor(action.actorNameColor) }}>@{action.actor}</Text>
                  <Text style={styles.cardTitleMuted}> -> </Text>
                  <Text style={{ color: getProfileNameColor(action.targetNameColor) }}>@{action.target}</Text>
                </Text>
                <Text style={styles.cardMeta}>{new Date(action.createdAt).toLocaleString()}</Text>
                {action.reason ? <Text style={styles.bodyText}>{action.reason}</Text> : null}
                <Text style={styles.excerptText}>{JSON.stringify(action.metadata)}</Text>
                <Pressable onPress={() => setSelectedAction(action)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Inspect</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.bodyText}>No moderation actions recorded yet.</Text>
        )}
      </SectionCard>

      <SectionCard title="Back" eyebrow="Navigation">
        <Pressable
          onPress={async () => {
            await reloadCurrentProfile?.();
            router.back();
          }}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Return to profile</Text>
        </Pressable>
      </SectionCard>
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
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
  hero: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xl,
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
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  statBox: {
    flex: 1,
    minWidth: 120,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  statValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
    textTransform: "uppercase",
  },
  helperText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
  loadingState: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  cardList: {
    gap: theme.spacing.md,
  },
  card: {
    gap: theme.spacing.sm,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  cardTitleMuted: {
    color: theme.colors.textMuted,
  },
  cardMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
  excerptText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
  inlineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  paginationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  textInput: {
    color: theme.colors.textPrimary,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: theme.fontSizes.sm,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  banButton: {
    backgroundColor: "#8b2f2f",
  },
  restoreButton: {
    backgroundColor: "#2d6f52",
  },
  primaryButtonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  filterChipActive: {
    backgroundColor: "rgba(245, 166, 35, 0.22)",
    borderColor: theme.colors.accent,
  },
  secondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  warningText: {
    color: "#f5a623",
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
  buttonPressed: {
    opacity: 0.92,
  },
});
