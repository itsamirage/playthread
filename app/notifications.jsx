import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import SectionCard from "../components/SectionCard";
import { useAuth } from "../lib/auth";
import {
  buildRouteFromNotification,
  groupNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  saveNotificationPreferences,
  useNotificationPreferences,
  useNotifications,
} from "../lib/notifications";
import { goBackOrFallback } from "../lib/navigation";
import { theme } from "../lib/theme";

const PREFERENCE_ROWS = [
  ["pushEnabled", "Allow push notifications", "Master switch for device alerts."],
  ["postCommentEnabled", "Replies to your posts/comments", "Keeps discussion replies in your inbox."],
  ["coinGiftReceivedEnabled", "Coin gifts received", "Alerts you when someone sends coins."],
  ["moderationWarningEnabled", "Moderation warnings", "Shows review and moderation warnings."],
  ["followedGamePostEnabled", "New posts in followed games", "Tracks fresh activity across followed titles."],
  ["newFollowerEnabled", "Friend requests and accepts", "Shows when someone wants to add you or accepts your request."],
  ["activityNoiseControlEnabled", "Reduce noisy activity pushes", "Aggregates repeated friend and followed-game push activity."],
];

export default function NotificationsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { notifications, unreadCount, isLoading, reload } = useNotifications();
  const {
    preferences,
    isLoading: preferencesLoading,
    reload: reloadPreferences,
  } = useNotificationPreferences();
  const notificationGroups = groupNotifications(notifications);

  const handleNotificationPress = async (notification) => {
    if (!notification.isRead) {
      await markNotificationRead(notification.id);
      await reload();
    }

    router.push(buildRouteFromNotification(notification));
  };

  const handleMarkAllRead = async () => {
    if (!session?.user?.id || unreadCount === 0) {
      return;
    }

    await markAllNotificationsRead(session.user.id);
    await reload();
  };

  const handleTogglePreference = async (key) => {
    if (!session?.user?.id) {
      return;
    }

    const nextPreferences = {
      ...preferences,
      [key]: !preferences[key],
    };

    await saveNotificationPreferences(session.user.id, nextPreferences);
    await reloadPreferences();
  };

  const handleSetCooldownMinutes = async (minutes) => {
    if (!session?.user?.id) {
      return;
    }

    await saveNotificationPreferences(session.user.id, {
      ...preferences,
      activityPushCooldownMinutes: minutes,
    });
    await reloadPreferences();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>PlayThread</Text>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.subtitle}>
          Replies, gifts, friend activity, moderation warnings, and new posts from games you follow.
        </Text>
        <View style={styles.heroActions}>
          <Pressable onPress={() => goBackOrFallback(router, "/(tabs)/profile")} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/(tabs)/profile")} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Profile</Text>
          </Pressable>
        </View>
      </View>

      <SectionCard title="Inbox" eyebrow={`${unreadCount} unread`}>
        {unreadCount > 0 ? (
          <Pressable onPress={handleMarkAllRead} style={styles.markReadButton}>
            <Text style={styles.markReadButtonText}>Mark all read</Text>
          </Pressable>
        ) : null}
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : notifications.length > 0 ? (
          <View style={styles.list}>
            {notificationGroups.map((group) => (
              <View key={group.dayLabel} style={styles.group}>
                <Text style={styles.groupTitle}>{group.dayLabel}</Text>
                <View style={styles.groupList}>
                  {group.items.map((notification) => (
                    <Pressable
                      key={notification.id}
                      onPress={() => handleNotificationPress(notification)}
                      style={[styles.notificationCard, !notification.isRead ? styles.notificationUnread : null]}
                    >
                      <View style={styles.notificationHeader}>
                        <Text style={styles.notificationKind}>{notification.kindLabel}</Text>
                        <Text style={styles.notificationMeta}>
                          {new Date(notification.createdAt).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>
                      <Text style={styles.notificationTitle}>{notification.title}</Text>
                      {notification.body ? <Text style={styles.notificationBody}>{notification.body}</Text> : null}
                      <Text style={styles.notificationMeta}>
                        {notification.actor ? `@${notification.actor}` : "PlayThread"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>Nothing new yet.</Text>
        )}
      </SectionCard>

      <SectionCard title="Preferences" eyebrow="Signal control">
        <Text style={styles.preferenceIntro}>
          Tune which events reach your inbox. Push uses the same event list plus the master push switch.
        </Text>
        {preferencesLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : (
          <View style={styles.preferenceList}>
            {PREFERENCE_ROWS.map(([key, label, hint]) => (
              <Pressable
                key={key}
                onPress={() => handleTogglePreference(key)}
                style={[styles.preferenceRow, preferences[key] ? styles.preferenceRowActive : null]}
              >
                <View style={styles.preferenceCopy}>
                  <Text style={styles.preferenceLabel}>{label}</Text>
                  <Text style={styles.preferenceHint}>{hint}</Text>
                </View>
                <Text style={[styles.preferenceValue, preferences[key] ? styles.preferenceValueActive : null]}>
                  {preferences[key] ? "On" : "Off"}
                </Text>
              </Pressable>
            ))}
            {preferences.activityNoiseControlEnabled ? (
              <View style={styles.cooldownWrap}>
                <Text style={styles.cooldownLabel}>Activity push cooldown</Text>
                <View style={styles.cooldownOptions}>
                  {[0, 15, 30, 60].map((minutes) => (
                    <Pressable
                      key={minutes}
                      onPress={() => handleSetCooldownMinutes(minutes)}
                      style={[
                        styles.cooldownChip,
                        preferences.activityPushCooldownMinutes === minutes ? styles.cooldownChipActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.cooldownChipText,
                          preferences.activityPushCooldownMinutes === minutes
                            ? styles.cooldownChipTextActive
                            : null,
                        ]}
                      >
                        {minutes === 0 ? "Instant" : `${minutes} min`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.cooldownHint}>
                  Noise control applies to friend activity and followed-game posts.
                </Text>
              </View>
            ) : null}
          </View>
        )}
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
  heroActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
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
  secondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  markReadButton: {
    alignSelf: "flex-start",
    marginBottom: theme.spacing.sm,
  },
  markReadButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  loadingState: {
    alignItems: "center",
    paddingVertical: theme.spacing.lg,
  },
  list: {
    gap: theme.spacing.md,
  },
  group: {
    gap: theme.spacing.sm,
  },
  groupTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  groupList: {
    gap: theme.spacing.md,
  },
  notificationCard: {
    gap: theme.spacing.xs,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
  },
  notificationUnread: {
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(0,229,255,0.08)",
  },
  notificationTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  notificationBody: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
  notificationMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  notificationKind: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  preferenceIntro: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
    marginBottom: theme.spacing.sm,
  },
  preferenceList: {
    gap: theme.spacing.sm,
  },
  preferenceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
  },
  preferenceRowActive: {
    borderColor: theme.colors.accent,
  },
  preferenceLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  preferenceCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  preferenceHint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
    lineHeight: 18,
  },
  preferenceValue: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
    textTransform: "uppercase",
  },
  preferenceValueActive: {
    color: theme.colors.accent,
  },
  cooldownWrap: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  cooldownLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  cooldownOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  cooldownChip: {
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  cooldownChipActive: {
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(0,229,255,0.1)",
  },
  cooldownChipText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
  },
  cooldownChipTextActive: {
    color: theme.colors.accent,
  },
  cooldownHint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
    lineHeight: 18,
  },
});
