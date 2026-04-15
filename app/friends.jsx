import { useRouter } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import SectionCard from "../components/SectionCard";
import { useAuth } from "../lib/auth";
import { goBackOrFallback } from "../lib/navigation";
import { getProfileNameColor } from "../lib/profileAppearance";
import { theme } from "../lib/theme";
import {
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  useUserFollows,
} from "../lib/userSocial";

export default function FriendsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const {
    friends,
    friendCount,
    incomingRequestUserIds,
    outgoingRequestUserIds,
    getFriendshipStatus,
    reload,
  } = useUserFollows(session?.user?.id);

  const handleAccept = async (userId) => {
    try {
      await acceptFriendRequest({ targetUserId: userId });
      await reload();
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Could not accept request.");
    }
  };

  const handleDecline = async (userId) => {
    try {
      await declineFriendRequest({ targetUserId: userId });
      await reload();
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Could not decline request.");
    }
  };

  const handleRemove = (friend) => {
    Alert.alert(
      "Remove friend?",
      `This will remove @${friend.username} from your friends list.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await removeFriend({ targetUserId: friend.id });
              await reload();
            } catch (error) {
              Alert.alert("Error", error instanceof Error ? error.message : "Could not remove friend.");
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable
          onPress={() => goBackOrFallback(router, "/(tabs)/profile")}
          style={({ pressed }) => [styles.backButton, pressed ? styles.buttonPressed : null]}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>PlayThread</Text>
        <Text style={styles.title}>Friends</Text>
        <Text style={styles.subtitle}>
          {friendCount} {friendCount === 1 ? "friend" : "friends"} on PlayThread
        </Text>
      </View>

      {incomingRequestUserIds.length > 0 ? (
        <SectionCard
          title={`${incomingRequestUserIds.length} pending ${incomingRequestUserIds.length === 1 ? "request" : "requests"}`}
          eyebrow="Friend requests"
        >
          <Text style={styles.helperText}>
            Someone wants to connect with you on PlayThread.
          </Text>
          <View style={styles.requestList}>
            {incomingRequestUserIds.map((userId) => (
              <View key={userId} style={styles.requestCard}>
                <Pressable
                  onPress={() => router.push(`/user/${userId}`)}
                  style={styles.requestNameRow}
                >
                  <Text style={styles.requestUsername}>View profile →</Text>
                </Pressable>
                <View style={styles.requestActions}>
                  <Pressable
                    onPress={() => handleAccept(userId)}
                    style={({ pressed }) => [styles.acceptButton, pressed ? styles.buttonPressed : null]}
                  >
                    <Text style={styles.acceptButtonText}>Accept</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDecline(userId)}
                    style={({ pressed }) => [styles.declineButton, pressed ? styles.buttonPressed : null]}
                  >
                    <Text style={styles.declineButtonText}>Decline</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </SectionCard>
      ) : null}

      {outgoingRequestUserIds.length > 0 ? (
        <SectionCard title="Sent requests" eyebrow="Pending">
          <Text style={styles.helperText}>
            Waiting for {outgoingRequestUserIds.length} {outgoingRequestUserIds.length === 1 ? "person" : "people"} to accept.
          </Text>
          <View style={styles.requestList}>
            {outgoingRequestUserIds.map((userId) => (
              <Pressable
                key={userId}
                onPress={() => router.push(`/user/${userId}`)}
                style={({ pressed }) => [styles.friendCard, pressed ? styles.buttonPressed : null]}
              >
                <Text style={styles.friendUsername}>View profile →</Text>
                <Text style={styles.friendMeta}>Request pending</Text>
              </Pressable>
            ))}
          </View>
        </SectionCard>
      ) : null}

      {friends.length > 0 ? (
        <SectionCard title="Your friends" eyebrow="Connected">
          <View style={styles.friendList}>
            {friends.map((friend) => (
              <View key={friend.id} style={styles.friendCard}>
                <Pressable
                  onPress={() => router.push(`/user/${friend.id}`)}
                  style={styles.friendInfo}
                >
                  <Text style={[styles.friendUsername, { color: getProfileNameColor(friend.selectedNameColor) }]}>
                    @{friend.username}
                  </Text>
                  {friend.displayName !== friend.username ? (
                    <Text style={styles.friendDisplayName}>{friend.displayName}</Text>
                  ) : null}
                  {friend.bio ? (
                    <Text style={styles.friendBio} numberOfLines={2}>{friend.bio}</Text>
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={() => handleRemove(friend)}
                  style={({ pressed }) => [styles.removeButton, pressed ? styles.buttonPressed : null]}
                >
                  <Text style={styles.removeButtonText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </SectionCard>
      ) : (
        <SectionCard title="No friends yet" eyebrow="Get started">
          <Text style={styles.helperText}>
            Search for players on the Browse tab and send a friend request from their profile page.
          </Text>
          <Pressable
            onPress={() => router.push("/(tabs)/browse")}
            style={({ pressed }) => [styles.primaryButton, pressed ? styles.buttonPressed : null]}
          >
            <Text style={styles.primaryButtonText}>Browse players</Text>
          </Pressable>
        </SectionCard>
      )}
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
  header: {
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.xl,
  },
  backButton: {
    alignSelf: "flex-start",
    marginBottom: theme.spacing.sm,
  },
  backButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  buttonPressed: {
    opacity: 0.75,
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
  helperText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
  requestList: {
    gap: theme.spacing.sm,
  },
  requestCard: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  requestNameRow: {
    alignSelf: "flex-start",
  },
  requestUsername: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  requestActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  acceptButton: {
    flex: 1,
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
  },
  acceptButtonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  declineButton: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.sm,
  },
  declineButtonText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  friendList: {
    gap: theme.spacing.sm,
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.md,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
  },
  friendInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  friendUsername: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  friendDisplayName: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
  },
  friendMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
  },
  friendBio: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
    lineHeight: 18,
  },
  removeButton: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  removeButtonText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.medium,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.lg,
  },
  primaryButtonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
});
