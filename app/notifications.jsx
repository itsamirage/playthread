import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import SectionCard from "../components/SectionCard";
import { useAuth } from "../lib/auth";
import {
  markAllNotificationsRead,
  markNotificationRead,
  useNotifications,
} from "../lib/notifications";
import { theme } from "../lib/theme";

export default function NotificationsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { notifications, unreadCount, isLoading, reload } = useNotifications();

  const handleNotificationPress = async (notification) => {
    if (!notification.isRead) {
      await markNotificationRead(notification.id);
      await reload();
    }

    if (notification.entityType === "post" && notification.entityId) {
      router.push(`/post/${notification.entityId}`);
      return;
    }

    if (notification.entityType === "profile" && notification.entityId) {
      router.push(`/user/${notification.entityId}`);
    }
  };

  const handleMarkAllRead = async () => {
    if (!session?.user?.id || unreadCount === 0) {
      return;
    }

    await markAllNotificationsRead(session.user.id);
    await reload();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>PlayThread</Text>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.subtitle}>
          Replies, gifts, moderation warnings, and new posts from games you follow.
        </Text>
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
            {notifications.map((notification) => (
              <Pressable
                key={notification.id}
                onPress={() => handleNotificationPress(notification)}
                style={[styles.notificationCard, !notification.isRead ? styles.notificationUnread : null]}
              >
                <Text style={styles.notificationTitle}>{notification.title}</Text>
                {notification.body ? <Text style={styles.notificationBody}>{notification.body}</Text> : null}
                <Text style={styles.notificationMeta}>
                  {notification.actor ? `@${notification.actor} • ` : ""}
                  {new Date(notification.createdAt).toLocaleString()}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>Nothing new yet.</Text>
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
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
});
