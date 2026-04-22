import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import NotificationInboxButton from "../../components/NotificationInboxButton";
import PostCard from "../../components/PostCard";
import SectionCard from "../../components/SectionCard";
import {
  formatAccountAge,
  getAvailableCoins,
  getLifetimeCoins,
  formatCoinCount,
  isAdminRole,
  isStaffRole,
  PROFILE_STORE_ITEMS,
  redeemProfileStoreItem,
} from "../../lib/admin";
import { isValidEmail, logoutUser, requestPasswordReset, updateEmail } from "../../lib/auth";
import { getFollowStatusLabel, useFollows } from "../../lib/follows";
import { useNowPlaying } from "../../lib/nowPlaying";
import { formatModerationWarning } from "../../lib/moderation";
import {
  getProviderLabel,
  getSyncStatusLabel,
  linkSteamAccount,
  PLATFORM_PROVIDERS,
  syncSteamAccount,
  syncSteamGame,
  unlinkSteamAccount,
  useConnectedAccounts,
} from "../../lib/platformAccounts";
import { useAuth } from "../../lib/auth";
import { saveProfileIdentity, saveProfileTitle, useCurrentProfile } from "../../lib/profile";
import { useContentPreferences } from "../../lib/contentPreferences";
import {
  saveProfileShowcase,
  useProfileShowcase,
  useSteamShowcaseCatalog,
} from "../../lib/profileShowcase";
import { getProfileNameColor } from "../../lib/profileAppearance";
import { useSavedPosts } from "../../lib/savedPosts";
import {
  useMyReviewCount,
  useMyReviewsByGame,
  useUserActivity,
  useUserCommentHistory,
  useUserFollows,
  useUserReviews,
} from "../../lib/userSocial";
import { getProfileTitleOption, PROFILE_TITLE_OPTIONS } from "../../lib/titles";
import { useTabReselectScroll } from "../../lib/tabReselect";
import { theme } from "../../lib/theme";

const BANNER_STYLES = {
  ember: ["#2a1611", "#4b2416", "#6f3721"],
  obsidian: ["#10131c", "#1d2230", "#31394f"],
  sunset: ["#3d1822", "#7a3140", "#d4874d"],
};
const PROFILE_STATS_STORAGE_KEY = "playthread:profile-stats-expanded";
const SAVED_POST_COLLECTIONS = ["General", "Guides", "Images", "Reviews", "Discussions"];

function normalizeSearchValue(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isSubsequenceMatch(query, candidate) {
  let queryIndex = 0;

  for (let index = 0; index < candidate.length && queryIndex < query.length; index += 1) {
    if (candidate[index] === query[queryIndex]) {
      queryIndex += 1;
    }
  }

  return queryIndex === query.length;
}

function getEditDistance(left, right) {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    let diagonalValue = previousRow[0];
    previousRow[0] = leftIndex + 1;

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const currentValue = previousRow[rightIndex + 1];
      const cost = left[leftIndex] === right[rightIndex] ? 0 : 1;

      previousRow[rightIndex + 1] = Math.min(
        previousRow[rightIndex + 1] + 1,
        previousRow[rightIndex] + 1,
        diagonalValue + cost,
      );
      diagonalValue = currentValue;
    }
  }

  return previousRow[right.length];
}

function isFuzzyWordMatch(query, candidateWords) {
  if (!query) {
    return true;
  }

  return candidateWords.some((candidateWord) => {
    if (candidateWord.includes(query) || isSubsequenceMatch(query, candidateWord)) {
      return true;
    }

    if (query.length < 4 || Math.abs(candidateWord.length - query.length) > 2) {
      return false;
    }

    const maxDistance = query.length >= 7 ? 2 : 1;
    return getEditDistance(query, candidateWord) <= maxDistance;
  });
}

function matchesShowcaseSearch(group, query) {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return true;
  }

  const searchText = normalizeSearchValue(
    [
      group.game.title,
      group.game.subtitle,
      group.masteryItem?.title,
      ...group.achievements.map((achievement) => `${achievement.title} ${achievement.subtitle ?? ""}`),
    ]
      .filter(Boolean)
      .join(" "),
  );
  const candidateWords = Array.from(new Set(searchText.split(" ").filter(Boolean)));
  const queryTerms = normalizedQuery.split(" ").filter(Boolean);

  return queryTerms.every(
    (queryTerm) =>
      searchText.includes(queryTerm) || isFuzzyWordMatch(queryTerm, candidateWords),
  );
}

export default function ProfileScreen() {
  const STAT_FILTERS = {
    following: {
      label: "Following",
      matches: () => true,
      emptyText: "You are not following any games yet.",
    },
    backlog: {
      label: "Backlog",
      matches: (game) => game.playStatus === "have_not_played",
      emptyText: "Your backlog is clear right now.",
    },
    completed: {
      label: "Completed",
      matches: (game) => game.playStatus === "completed",
      emptyText: "No completed games yet. Mark a game as completed from its game page.",
    },
    currently_playing: {
      label: "Currently playing",
      matches: (game) => nowPlayingIds.includes(Number(game.id)),
      emptyText: "You have not marked any games as currently playing yet.",
    },
    reviewed: {
      label: "Reviewed",
      matches: (game) => reviewsByGameId.has(String(game.id)) || reviewsByGameId.has(game.id),
      emptyText: "You have not reviewed any games yet.",
    },
  };
  const GAME_SORT_OPTIONS = {
    recent: "Recently played",
    achievements: "Most achievements",
    completion: "Highest completion",
    hours: "Most hours",
    alpha: "A-Z",
  };
  const router = useRouter();
  const scrollRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [linkingSteam, setLinkingSteam] = useState(false);
  const [syncingSteam, setSyncingSteam] = useState(false);
  const [unlinkingSteam, setUnlinkingSteam] = useState(false);
  const [editingShowcase, setEditingShowcase] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [savingShowcase, setSavingShowcase] = useState(false);
  const [selectedShowcaseIds, setSelectedShowcaseIds] = useState([]);
  const [expandedGameIds, setExpandedGameIds] = useState([]);
  const [loadingGameIds, setLoadingGameIds] = useState([]);
  const [gameSort, setGameSort] = useState("recent");
  const [showcaseSearch, setShowcaseSearch] = useState("");
  const [activeStatFilterKey, setActiveStatFilterKey] = useState(null);
  const [isStatsExpanded, setIsStatsExpanded] = useState(true);
  const [statSearchQuery, setStatSearchQuery] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [identityDraft, setIdentityDraft] = useState({
    displayName: "",
    bio: "",
    avatarUrl: "",
  });
  const [activeSavedCollection, setActiveSavedCollection] = useState("All");
  const deferredShowcaseSearch = useDeferredValue(showcaseSearch);
  const { session } = useAuth();
  const { preferences: contentPreferences, savePreferences: saveContentPreferences } = useContentPreferences();
  const { followedCount, followedGames, isLoading: followsLoading, unfollowGame } = useFollows();
  const { nowPlayingIds } = useNowPlaying(session?.user?.id);
  const { friendCount, incomingRequestUserIds } = useUserFollows(session?.user?.id);
  const { reviewCount, avgRating, reload: reloadReviews } = useMyReviewCount(session?.user?.id);
  const { reviewsByGameId } = useMyReviewsByGame(session?.user?.id);
  const { reviews: reviewHistory, reload: reloadReviewHistory } = useUserReviews(
    session?.user?.id,
  );
  const {
    posts: savedPosts,
    savedRows,
    isLoading: savedPostsLoading,
    toggleSavedPost,
    updateSavedPostCollection,
  } = useSavedPosts({ limit: 20 });
  const savedCollectionByPostId = useMemo(
    () => new Map((savedRows ?? []).map((row) => [String(row.post_id), row.collection ?? "General"])),
    [savedRows],
  );
  const savedCollectionFilters = useMemo(() => {
    const collections = new Set(["All", ...SAVED_POST_COLLECTIONS]);
    for (const row of savedRows ?? []) {
      collections.add(row.collection ?? "General");
    }
    return Array.from(collections);
  }, [savedRows]);
  const filteredSavedPosts = useMemo(
    () =>
      activeSavedCollection === "All"
        ? savedPosts
        : savedPosts.filter(
            (post) =>
              (savedCollectionByPostId.get(String(post.id)) ?? "General") === activeSavedCollection,
          ),
    [activeSavedCollection, savedCollectionByPostId, savedPosts],
  );
  const {
    posts: myPosts,
    isLoading: myPostsLoading,
    isLoadingMore: myPostsLoadingMore,
    hasMore: myPostsHasMore,
    reload: reloadMyPosts,
    loadMore: loadMoreMyPosts,
  } = useUserActivity(session?.user?.id, { limit: 10 });
  const {
    comments: myComments,
    isLoading: myCommentsLoading,
    isLoadingMore: myCommentsLoadingMore,
    hasMore: myCommentsHasMore,
    reload: reloadMyComments,
    loadMore: loadMoreMyComments,
  } = useUserCommentHistory(session?.user?.id, { limit: 10 });
  const myMediaPosts = useMemo(
    () => myPosts.filter((post) => (post.imageUrls?.length ?? 0) > 0 || post.type === "clip").slice(0, 12),
    [myPosts],
  );
  const reputationBadges = useMemo(() => {
    const badges = [];
    if (myPosts.filter((post) => post.type === "guide" || post.type === "tip").length >= 3) badges.push("Helpful guide maker");
    if (reviewCount >= 3) badges.push("Reviewer");
    if (myMediaPosts.length >= 3) badges.push("Media creator");
    if (friendCount >= 10) badges.push("Community regular");
    return badges;
  }, [friendCount, myMediaPosts.length, myPosts, reviewCount]);
  const { profile, reload: reloadProfile } = useCurrentProfile();
  const { accountsByProvider, isLoading: accountsLoading, reloadAccounts } = useConnectedAccounts();
  const {
    items: showcaseItems,
    featuredAchievements,
    isLoading: showcaseLoading,
    reloadShowcase,
  } = useProfileShowcase();
  const {
    gameGroups: steamShowcaseGameGroups,
    isLoading: showcaseCatalogLoading,
    reloadCatalog,
  } = useSteamShowcaseCatalog();

  const completedCount = followedGames.filter((game) => game.playStatus === "completed").length;
  const backlogCount = followedGames.filter((game) => game.playStatus === "have_not_played").length;
  const currentlyPlayingCount = followedGames.filter((game) => nowPlayingIds.includes(Number(game.id))).length;
  const activeStatFilter = activeStatFilterKey ? STAT_FILTERS[activeStatFilterKey] : null;
  const filteredStatGames = useMemo(() => {
    const searchValue = normalizeSearchValue(statSearchQuery);
    const baseGames =
      activeStatFilterKey === "reviewed"
        ? reviewHistory.map((review) => {
            const followedGame = followedGames.find((game) => String(game.id) === String(review.gameId));

            return {
              id: review.gameId,
              title: review.title,
              coverUrl: review.coverUrl ?? followedGame?.coverUrl ?? null,
              genre: followedGame?.genre ?? "",
              studio: followedGame?.studio ?? "",
              platforms: followedGame?.platforms ?? [],
              playStatus: followedGame?.playStatus ?? "reviewed",
              followedAt: followedGame?.followedAt ?? review.createdAt,
            };
          })
        : activeStatFilter
          ? followedGames.filter((game) => activeStatFilter.matches(game))
          : [];

    if (!searchValue) {
      return baseGames;
    }

    return baseGames.filter((game) =>
      normalizeSearchValue(
        [game.title, game.genre, game.studio, ...(game.platforms ?? [])].filter(Boolean).join(" "),
      ).includes(searchValue),
    );
  }, [activeStatFilter, activeStatFilterKey, followedGames, reviewHistory, statSearchQuery]);
  const availableCoins = getAvailableCoins({
    coinsFromPosts: profile?.coins_from_posts,
    coinsFromComments: profile?.coins_from_comments,
    coinsFromGifts: profile?.coins_from_gifts,
    coinsFromAdjustments: profile?.coins_from_adjustments,
    coinsSpent: profile?.coins_spent,
  });
  const lifetimeCoins = getLifetimeCoins({
    coinsFromPosts: profile?.coins_from_posts,
    coinsFromComments: profile?.coins_from_comments,
    coinsFromGifts: profile?.coins_from_gifts,
    coinsFromAdjustments: profile?.coins_from_adjustments,
  });
  const nameColor = getProfileNameColor(profile?.selected_name_color);
  const heroBannerColors =
    BANNER_STYLES[profile?.selected_banner_style ?? "ember"] ?? BANNER_STYLES.ember;
  const canOpenAdmin = isStaffRole(profile?.account_role);
  const selectedTitle = getProfileTitleOption(profile?.selected_title_key ?? "none");
  const steamAccount = accountsByProvider.get("steam");
  const verifiedSteamLink = steamAccount?.metadata?.link_method === "openid";

  useEffect(() => {
    setIdentityDraft({
      displayName: profile?.display_name ?? profile?.username ?? "",
      bio: profile?.bio ?? "",
      avatarUrl: profile?.avatar_url ?? "",
    });
  }, [profile?.avatar_url, profile?.bio, profile?.display_name, profile?.username]);

  useEffect(() => {
    setEmailDraft(session?.user?.email ?? "");
  }, [session?.user?.email]);

  useEffect(() => {
    let isMounted = true;

    const loadStatsPreference = async () => {
      try {
        const rawValue = await AsyncStorage.getItem(PROFILE_STATS_STORAGE_KEY);

        if (!isMounted || rawValue == null) {
          return;
        }

        setIsStatsExpanded(rawValue === "true");
      } catch {
        // Ignore local preference failures.
      }
    };

    loadStatsPreference();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(PROFILE_STATS_STORAGE_KEY, isStatsExpanded ? "true" : "false").catch(() => {});
  }, [isStatsExpanded]);
  const sortedSteamShowcaseGameGroups = useMemo(() => {
    const nextGroups = [...steamShowcaseGameGroups];

    nextGroups.sort((left, right) => {
      if (gameSort === "alpha") {
        return left.game.title.localeCompare(right.game.title);
      }

      if (gameSort === "hours") {
        return (right.game.playtimeHours ?? 0) - (left.game.playtimeHours ?? 0);
      }

      if (gameSort === "completion") {
        return (right.game.completionPercent ?? 0) - (left.game.completionPercent ?? 0);
      }

      if (gameSort === "achievements") {
        if (right.game.completedAchievementCount !== left.game.completedAchievementCount) {
          return right.game.completedAchievementCount - left.game.completedAchievementCount;
        }

        return (right.game.totalAchievementCount ?? 0) - (left.game.totalAchievementCount ?? 0);
      }

      const leftLastPlayed = left.game.metadata?.last_played_at
        ? new Date(left.game.metadata.last_played_at).getTime()
        : 0;
      const rightLastPlayed = right.game.metadata?.last_played_at
        ? new Date(right.game.metadata.last_played_at).getTime()
        : 0;

      if (rightLastPlayed !== leftLastPlayed) {
        return rightLastPlayed - leftLastPlayed;
      }

      return (right.game.playtimeHours ?? 0) - (left.game.playtimeHours ?? 0);
    });

    return nextGroups;
  }, [gameSort, steamShowcaseGameGroups]);
  const filteredSteamShowcaseGameGroups = useMemo(
    () =>
      sortedSteamShowcaseGameGroups.filter((group) =>
        matchesShowcaseSearch(group, deferredShowcaseSearch),
      ),
    [deferredShowcaseSearch, sortedSteamShowcaseGameGroups],
  );
  const selectedCatalogItems = steamShowcaseGameGroups.flatMap((group) => [
    group.game,
    ...(group.masteryItem ? [group.masteryItem] : []),
    ...group.achievements,
  ]);
  const selectedShowcaseItems = selectedShowcaseIds
    .map((id) => selectedCatalogItems.find((item) => item.id === id))
    .filter(Boolean);
  const verifiedDeveloperGames = useMemo(
    () =>
      followedGames.filter((game) =>
        (profile?.developer_game_ids ?? []).includes(Number(game.id)),
      ),
    [followedGames, profile?.developer_game_ids],
  );
  const scrollHandlers = useTabReselectScroll("profile", {
    scrollRef,
    onRefresh: () => {
      void reloadProfile?.();
      void reloadAccounts?.();
      void reloadShowcase?.();
      void reloadCatalog?.();
      void reloadReviews?.();
      void reloadReviewHistory?.();
      void reloadMyPosts?.();
      void reloadMyComments?.();
    },
  });

  const handleLogout = async () => {
    try {
      setLoading(true);

      const { error } = await logoutUser();

      if (error) {
        Alert.alert("Logout failed", error.message);
        return;
      }
    } catch (error) {
      Alert.alert("Error", "Something went wrong while logging out.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEmail = async () => {
    if (!emailDraft.trim()) {
      Alert.alert("Missing email", "Enter the email address you want to use.");
      return;
    }

    if (!isValidEmail(emailDraft)) {
      Alert.alert("Invalid email", "Enter a valid email address.");
      return;
    }

    try {
      setSavingEmail(true);
      const { error } = await updateEmail(emailDraft);

      if (error) {
        throw error;
      }

      Alert.alert(
        "Email update started",
        "Check your inbox for the confirmation email to finish changing your address.",
      );
    } catch (error) {
      Alert.alert("Email update failed", error instanceof Error ? error.message : "Could not update your email.");
    } finally {
      setSavingEmail(false);
    }
  };

  const handleRequestPasswordReset = async () => {
    if (!session?.user?.email) {
      Alert.alert("Missing email", "No account email is available for this session.");
      return;
    }

    try {
      const { error } = await requestPasswordReset(session.user.email);

      if (error) {
        throw error;
      }

      Alert.alert("Reset email sent", `A password reset link was sent to ${session.user.email}.`);
    } catch (error) {
      Alert.alert("Reset failed", error instanceof Error ? error.message : "Could not send the reset email.");
    }
  };

  const handleUnfollow = async (game) => {
    const { error } = await unfollowGame(game);

    if (error) {
      Alert.alert("Follow update failed", error.message);
    }
  };

  const handleRedeemStoreItem = async (item) => {
    if (!session?.user?.id || !profile) {
      return;
    }

    if (availableCoins < item.cost) {
      Alert.alert("Not enough coins", "Contribute more posts or comments to unlock that cosmetic.");
      return;
    }

    try {
      await redeemProfileStoreItem({
        userId: session.user.id,
        profile: {
          coinsFromPosts: profile?.coins_from_posts,
          coinsFromComments: profile?.coins_from_comments,
          coinsFromGifts: profile?.coins_from_gifts,
          coinsFromAdjustments: profile?.coins_from_adjustments,
          coinsSpent: profile?.coins_spent,
        },
        item,
      });
      await reloadProfile?.();
      Alert.alert("Cosmetic unlocked", `${item.label} is now active on your profile.`);
    } catch (error) {
      Alert.alert("Unlock failed", error instanceof Error ? error.message : "Could not unlock that cosmetic.");
    }
  };

  const handleSelectTitle = async (titleKey) => {
    if (!session?.user?.id) {
      return;
    }

    try {
      await saveProfileTitle(session.user.id, titleKey);
      await reloadProfile?.();
    } catch (error) {
      Alert.alert("Title update failed", error instanceof Error ? error.message : "Could not save that title.");
    }
  };

  const handleSaveIdentity = async () => {
    if (!session?.user?.id) {
      return;
    }

    try {
      setSavingIdentity(true);
      const result = await saveProfileIdentity({
        displayName: identityDraft.displayName,
        bio: identityDraft.bio,
        avatarUrl: identityDraft.avatarUrl,
      });
      await reloadProfile?.();

      const warnings = [];

      if (result?.moderation?.profile?.moderationState === "warning") {
        warnings.push("profile text was flagged for review");
      }

      if (result?.moderation?.avatar?.moderationState === "warning") {
        warnings.push("avatar submission was sent for review");
      }

      Alert.alert(
        "Profile updated",
        warnings.length > 0
          ? `Saved, but ${warnings.join(" and ")}.`
          : "Your profile identity was updated."
      );
    } catch (error) {
      Alert.alert("Profile update failed", error instanceof Error ? error.message : "Could not update your profile.");
    } finally {
      setSavingIdentity(false);
    }
  };

  const handleUseSteamAvatar = () => {
    if (!steamAccount?.avatarUrl) {
      return;
    }

    setIdentityDraft((current) => ({
      ...current,
      avatarUrl: steamAccount.avatarUrl,
    }));
  };

  const handleLinkPress = async (provider) => {
    if (provider !== "steam") {
      Alert.alert(
        `${getProviderLabel(provider)} is not available yet`,
        "Steam is the first linked-account provider. Xbox and PlayStation stay scaffolded for later."
      );
      return;
    }

    try {
      setLinkingSteam(true);
      await linkSteamAccount();
      reloadAccounts();
      Alert.alert("Steam linked", "Your verified Steam account is now connected to PlayThread.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Steam linking failed.";
      Alert.alert("Steam linking failed", message);
    } finally {
      setLinkingSteam(false);
    }
  };

  const handleSyncPress = async (provider) => {
    if (provider !== "steam") {
      Alert.alert(
        `${getProviderLabel(provider)} sync is not available yet`,
        "Steam ships first. Additional provider sync adapters come later."
      );
      return;
    }

    try {
      setSyncingSteam(true);
      const result = await syncSteamAccount();
      reloadAccounts();
      reloadShowcase();

      const summary = result?.summary;
      const message = summary
        ? summary.preservedManualShowcase
          ? `Imported ${summary.syncedOwnedGames} games and synced ${summary.syncedAchievementGames} achievement sets. Your manual showcase picks were kept.`
          : `Imported ${summary.syncedOwnedGames} games, synced ${summary.syncedAchievementGames} achievement sets, and updated ${summary.showcaseItems} showcase items.`
        : "Your linked Steam profile was refreshed.";

      Alert.alert("Steam refreshed", message);
      reloadCatalog();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Steam sync failed.";
      Alert.alert("Steam sync failed", message);
    } finally {
      setSyncingSteam(false);
    }
  };

  const handleUnlinkPress = (provider) => {
    if (provider !== "steam") {
      return;
    }

    Alert.alert(
      "Unlink Steam?",
      "This removes your linked Steam account and clears synced Steam showcase, game, and achievement data from PlayThread.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Unlink",
          style: "destructive",
          onPress: async () => {
            try {
              setUnlinkingSteam(true);
              await unlinkSteamAccount();
              reloadAccounts();
              reloadShowcase();
              Alert.alert("Steam unlinked", "Your Steam account and synced Steam data were removed.");
              reloadCatalog();
              setEditingShowcase(false);
              setSelectedShowcaseIds([]);
            } catch (error) {
              const message = error instanceof Error ? error.message : "Steam unlink failed.";
              Alert.alert("Steam unlink failed", message);
            } finally {
              setUnlinkingSteam(false);
            }
          },
        },
      ],
    );
  };

  const handleStartShowcaseEdit = () => {
    const nextSelectedIds = showcaseItems
      .map((item) =>
        item.metadata?.display_variant === "mastery"
          ? `mastery:${item.providerGameId}`
          : item.kind === "achievement"
          ? `achievement:${item.providerGameId}:${item.providerAchievementId}`
          : `game:${item.providerGameId}`,
      )
      .slice(0, 3);

    setSelectedShowcaseIds(nextSelectedIds);
    setExpandedGameIds(
      Array.from(new Set(showcaseItems.map((item) => item.providerGameId).filter(Boolean))).slice(0, 6),
    );
    setShowcaseSearch("");
    setEditingShowcase(true);
  };

  const handleToggleShowcaseItem = (itemId) => {
    setSelectedShowcaseIds((currentValue) => {
      if (currentValue.includes(itemId)) {
        return currentValue.filter((value) => value !== itemId);
      }

      if (currentValue.length >= 3) {
        Alert.alert(
          "Showcase full",
          "You can feature up to 3 items. Remove one of your current picks before adding another.",
        );
        return currentValue;
      }

      return [...currentValue, itemId];
    });
  };

  const handleMoveSelectedShowcaseItem = (itemId, direction) => {
    setSelectedShowcaseIds((currentValue) => {
      const currentIndex = currentValue.indexOf(itemId);

      if (currentIndex < 0) {
        return currentValue;
      }

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (targetIndex < 0 || targetIndex >= currentValue.length) {
        return currentValue;
      }

      const nextValue = [...currentValue];
      const [movedItem] = nextValue.splice(currentIndex, 1);
      nextValue.splice(targetIndex, 0, movedItem);
      return nextValue;
    });
  };

  const handleSaveShowcase = async () => {
    if (!session?.user?.id) {
      Alert.alert("Sign in required", "You need to sign in before editing your showcase.");
      return;
    }

    try {
      setSavingShowcase(true);
      await saveProfileShowcase(session.user.id, selectedShowcaseItems);
      reloadShowcase();
      setEditingShowcase(false);
      setExpandedGameIds([]);
      setShowcaseSearch("");
      Alert.alert("Showcase saved", "Your featured Steam showcase items were updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save your showcase.";
      Alert.alert("Showcase save failed", message);
    } finally {
      setSavingShowcase(false);
    }
  };

  const handleToggleGameExpanded = (gameId) => {
    setExpandedGameIds((currentValue) =>
      currentValue.includes(gameId)
        ? currentValue.filter((value) => value !== gameId)
        : [...currentValue, gameId],
    );
  };

  const handleExpandGame = async (group) => {
    const gameId = group.game.providerGameId;
    const alreadyExpanded = expandedGameIds.includes(gameId);

    if (alreadyExpanded) {
      handleToggleGameExpanded(gameId);
      return;
    }

    handleToggleGameExpanded(gameId);

    if (group.achievements.length > 0 || loadingGameIds.includes(gameId)) {
      return;
    }

    try {
      setLoadingGameIds((currentValue) => [...currentValue, gameId]);
      await syncSteamGame(gameId);
      reloadCatalog();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load achievements for this game.";
      Alert.alert("Game achievement sync failed", message);
    } finally {
      setLoadingGameIds((currentValue) => currentValue.filter((value) => value !== gameId));
    }
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={styles.content}
      onScroll={scrollHandlers.onScroll}
      scrollEventThrottle={scrollHandlers.scrollEventThrottle}
    >
      <View
        style={[
          styles.hero,
          {
            backgroundColor: heroBannerColors[0],
            borderColor: heroBannerColors[2],
          },
        ]}
      >
        <View style={styles.heroTopRow}>
          <Pressable onPress={() => router.push("/settings")} style={styles.heroActionButton}>
            <Text style={styles.heroActionButtonText}>Settings</Text>
          </Pressable>
          <NotificationInboxButton />
        </View>
        <View style={styles.avatar}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>
              {(profile?.username ?? "P").charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <Text style={[styles.title, { color: nameColor }]}>
          {profile?.display_name ?? profile?.username ?? "Player"}
        </Text>
        <Text style={[styles.handleText, { color: nameColor }]}>@{profile?.username ?? "player"}</Text>
        {selectedTitle.key !== "none" ? (
          <View style={[styles.titleBadge, selectedTitle.style === "gold" ? styles.titleBadgeGold : null]}>
            <Text style={[styles.titleBadgeText, selectedTitle.style === "gold" ? styles.titleBadgeTextGold : null]}>
              {selectedTitle.label}
            </Text>
          </View>
        ) : null}
        <Text style={styles.subtitle}>Building a gaming identity on PlayThread</Text>
        {profile?.bio ? <Text style={styles.heroBio}>{profile.bio}</Text> : null}
        {reputationBadges.length > 0 ? (
          <View style={styles.badgeRow}>
            {reputationBadges.map((badge) => (
              <View key={badge} style={styles.reputationBadge}>
                <Text style={styles.reputationBadgeText}>{badge}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.heroMetaRow}>
          <View style={styles.heroChip}>
            <Text style={styles.heroChipText}>{formatAccountAge(profile?.created_at)}</Text>
          </View>
          <View style={styles.heroChip}>
            <Text style={styles.heroChipText}>{formatCoinCount(availableCoins)} coins available</Text>
          </View>
          {profile?.integrity_exempt ? (
            <View style={styles.heroChip}>
              <Text style={styles.heroChipText}>Integrity exempt</Text>
            </View>
          ) : null}
          {(profile?.developer_game_ids ?? []).length > 0 ? (
            <View style={styles.heroChip}>
              <Text style={styles.heroChipText}>Verified developer</Text>
            </View>
          ) : null}
        </View>
        {profile?.is_banned ? (
          <Text style={styles.warningText}>This account is currently banned. Posting and reactions are disabled.</Text>
        ) : null}
        {profile?.profile_moderation_state === "warning" ? (
          <Text style={styles.warningText}>
            {formatModerationWarning(profile?.profile_moderation_labels)}
          </Text>
        ) : null}
        {profile?.avatar_moderation_state === "warning" ? (
          <Text style={styles.warningText}>
            Avatar submission is under review before broader rollout.
          </Text>
        ) : null}
      </View>

      <SectionCard title="Stats" eyebrow="Overview">
        {isStatsExpanded ? (
          <>
            <View style={styles.statGrid}>
              <Pressable
                onPress={() => {
                  setStatSearchQuery("");
                  setActiveStatFilterKey("following");
                }}
                style={({ pressed }) => [styles.statBox, pressed ? styles.buttonPressed : null]}
              >
                <Text style={styles.statValue}>{followedCount}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>Following</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push("/friends")}
                style={({ pressed }) => [styles.statBox, pressed ? styles.buttonPressed : null]}
              >
                <Text style={styles.statValue}>{friendCount}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>Friends</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setStatSearchQuery("");
                  setActiveStatFilterKey("backlog");
                }}
                style={({ pressed }) => [styles.statBox, pressed ? styles.buttonPressed : null]}
              >
                <Text style={styles.statValue}>{backlogCount}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>Backlog</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setStatSearchQuery("");
                  setActiveStatFilterKey("completed");
                }}
                style={({ pressed }) => [styles.statBox, pressed ? styles.buttonPressed : null]}
              >
                <Text style={styles.statValue}>{completedCount}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>Completed</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setStatSearchQuery("");
                  setActiveStatFilterKey("currently_playing");
                }}
                style={({ pressed }) => [styles.statBox, pressed ? styles.buttonPressed : null]}
              >
                <Text style={styles.statValue}>{currentlyPlayingCount}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>Currently playing</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setStatSearchQuery("");
                  setActiveStatFilterKey("reviewed");
                }}
                style={({ pressed }) => [styles.statBox, pressed ? styles.buttonPressed : null]}
              >
                <Text style={styles.statValue}>{reviewCount}</Text>
                {avgRating ? (
                  <Text style={styles.statSubValue}>{avgRating} avg</Text>
                ) : null}
                <Text style={styles.statLabel} numberOfLines={1}>Reviewed</Text>
              </Pressable>
            </View>
            <Text style={styles.helperText}>
              Tap Following, Backlog, Completed, Currently playing, or Reviewed to open searchable lists.
            </Text>
          </>
        ) : null}
        <Pressable
          onPress={() => setIsStatsExpanded((v) => !v)}
          style={styles.expandToggle}
        >
          <Text style={styles.expandToggleText}>
            {isStatsExpanded ? "Hide stats ▲" : "Show stats ▼"}
          </Text>
        </Pressable>
        {isStatsExpanded ? (
          <>
            <View style={styles.statRow}>
              <View style={[styles.statBox, styles.statBoxThird]}>
                <Text style={styles.statValue}>{formatCoinCount(profile?.coins_from_posts ?? 0)}</Text>
                <Text style={styles.statLabel}>Post coins</Text>
              </View>
              <View style={[styles.statBox, styles.statBoxThird]}>
                <Text style={styles.statValue}>{formatCoinCount(profile?.coins_from_comments ?? 0)}</Text>
                <Text style={styles.statLabel}>Comment coins</Text>
              </View>
              <View style={[styles.statBox, styles.statBoxThird]}>
                <Text style={styles.statValue}>{formatCoinCount(availableCoins)}</Text>
                <Text style={styles.statLabel}>Available</Text>
              </View>
            </View>
            <View style={styles.statRow}>
              <View style={[styles.statBox, styles.statBoxThird]}>
                <Text style={styles.statValue}>{formatCoinCount(profile?.coins_from_gifts ?? 0)}</Text>
                <Text style={styles.statLabel}>Gifted to you</Text>
              </View>
              <View style={[styles.statBox, styles.statBoxThird]}>
                <Text style={styles.statValue}>{formatCoinCount(lifetimeCoins)}</Text>
                <Text style={styles.statLabel}>Lifetime earned</Text>
              </View>
              <View style={[styles.statBox, styles.statBoxThird]}>
                <Text style={styles.statValue}>{formatCoinCount(profile?.coins_spent ?? 0)}</Text>
                <Text style={styles.statLabel}>Spent</Text>
              </View>
            </View>
          </>
        ) : null}
      </SectionCard>

      <SectionCard title="Profile store" eyebrow="Cosmetics">
        <Text style={styles.bodyText}>
          Spend earned coins on code-native profile cosmetics like name colors and banner themes.
        </Text>
        <View style={styles.accountList}>
          {PROFILE_STORE_ITEMS.map((item) => {
            const isActive =
              (item.type === "name_color" && profile?.selected_name_color === item.value) ||
              (item.type === "banner_style" && profile?.selected_banner_style === item.value);

            return (
              <View key={item.id} style={styles.accountCard}>
                <View style={styles.accountHeader}>
                  <View style={styles.accountTitleBlock}>
                    <Text style={styles.accountTitle}>{item.label}</Text>
                    <Text style={styles.accountMeta}>{formatCoinCount(item.cost)} coins</Text>
                  </View>
                  <Pressable
                    onPress={() => handleRedeemStoreItem(item)}
                    style={({ pressed }) => [
                      styles.inlineActionButton,
                      isActive ? styles.summaryActionChip : null,
                      pressed ? styles.buttonPressed : null,
                    ]}
                  >
                    <Text style={styles.inlineActionText}>{isActive ? "Active" : "Unlock"}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </SectionCard>

      <SectionCard title="Profile title" eyebrow="Identity">
        <Text style={styles.bodyText}>
          Pick a title to show next to your username on your profile, posts, and comments. Add more later by editing [lib/titles.js].
        </Text>
        <View style={styles.sortRow}>
          {PROFILE_TITLE_OPTIONS.map((option) => {
            const isActive = (profile?.selected_title_key ?? "none") === option.key;

            return (
              <Pressable
                key={option.key}
                onPress={() => handleSelectTitle(option.key)}
                style={[styles.sortChip, isActive ? styles.sortChipActive : null]}
              >
                <Text style={[styles.sortChipText, isActive ? styles.sortChipTextActive : null]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SectionCard>

      <SectionCard title="Profile identity" eyebrow="Edit">
        <Text style={styles.bodyText}>
          Update your display name and short bio through the trusted moderation path. Avatar images are limited to your linked Steam avatar for now.
        </Text>
        <TextInput
          onChangeText={(value) => setIdentityDraft((current) => ({ ...current, displayName: value }))}
          placeholder="Display name"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.textInput}
          value={identityDraft.displayName}
        />
        <TextInput
          multiline
          onChangeText={(value) => setIdentityDraft((current) => ({ ...current, bio: value }))}
          placeholder="Short bio"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.textInput, styles.multilineInput]}
          value={identityDraft.bio}
        />
        {steamAccount?.avatarUrl ? (
          <Pressable onPress={handleUseSteamAvatar} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Use linked Steam avatar</Text>
          </Pressable>
        ) : null}
        {identityDraft.avatarUrl ? (
          <Pressable
            onPress={() => setIdentityDraft((current) => ({ ...current, avatarUrl: "" }))}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Remove avatar</Text>
          </Pressable>
        ) : null}
        {identityDraft.avatarUrl ? (
          <View style={styles.avatarPreviewCard}>
            <Image source={{ uri: identityDraft.avatarUrl }} style={styles.avatarPreviewImage} />
            <Text style={styles.helperText}>
              Linked Steam avatars stay available. Arbitrary avatar URLs are disabled until a stronger upload moderation path is in place.
            </Text>
          </View>
        ) : null}
        <Pressable
          disabled={savingIdentity}
          onPress={handleSaveIdentity}
          style={({ pressed }) => [
            styles.primaryActionButton,
            pressed && !savingIdentity ? styles.buttonPressed : null,
            savingIdentity ? styles.buttonDisabled : null,
          ]}
        >
          {savingIdentity ? (
            <ActivityIndicator color={theme.colors.background} />
          ) : (
            <Text style={styles.primaryActionText}>Save profile identity</Text>
          )}
        </Pressable>
      </SectionCard>

      <SectionCard title="Content settings" eyebrow="Visibility">
        <Text style={styles.bodyText}>
          NSFW games (AO-rated or adult-themed titles) are filtered out of Browse and Catalog. Mature 17+ games always show regardless of this setting.
        </Text>
        <View style={styles.nsfwToggleRow}>
          <Pressable
            onPress={() =>
              saveContentPreferences({ ...contentPreferences, hideMatureGames: false })
            }
            style={[
              styles.nsfwToggleOption,
              !contentPreferences.hideMatureGames ? styles.nsfwToggleOptionActive : null,
            ]}
          >
            <Text
              style={[
                styles.nsfwToggleOptionText,
                !contentPreferences.hideMatureGames ? styles.nsfwToggleOptionTextActive : null,
              ]}
            >
              Show NSFW
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              saveContentPreferences({ ...contentPreferences, hideMatureGames: true })
            }
            style={[
              styles.nsfwToggleOption,
              contentPreferences.hideMatureGames ? styles.nsfwToggleOptionHidden : null,
            ]}
          >
            <Text
              style={[
                styles.nsfwToggleOptionText,
                contentPreferences.hideMatureGames ? styles.nsfwToggleOptionTextHidden : null,
              ]}
            >
              Hide NSFW
            </Text>
          </Pressable>
        </View>
      </SectionCard>

      <SectionCard title="Linked platforms" eyebrow="Connections">
        <Text style={styles.bodyText}>
          Start with Steam, keep the model provider-agnostic, and leave Xbox and PlayStation ready
          for later.
        </Text>

        {accountsLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.bodyText}>Loading account connections...</Text>
          </View>
        ) : (
          <View style={styles.accountList}>
            {Object.entries(PLATFORM_PROVIDERS).map(([provider, providerInfo]) => {
              const linkedAccount = accountsByProvider.get(provider);
              const isSteamProvider = provider === "steam";
              const isWorking = isSteamProvider && (linkingSteam || syncingSteam || unlinkingSteam);

              return (
                <View key={provider} style={styles.accountCard}>
                  <View style={styles.accountHeader}>
                    <View style={styles.accountTitleBlock}>
                      <Text style={styles.accountTitle}>{providerInfo.label}</Text>
                      <Text style={styles.accountMeta}>
                        {linkedAccount
                          ? `${getSyncStatusLabel(linkedAccount.syncStatus)}${
                              linkedAccount.lastSyncedAt
                                ? ` • ${new Date(linkedAccount.lastSyncedAt).toLocaleDateString()}`
                                : ""
                            }`
                          : "Not linked"}
                      </Text>
                    </View>

                    <Pressable
                      disabled={isWorking}
                      onPress={() =>
                        linkedAccount ? handleSyncPress(provider) : handleLinkPress(provider)
                      }
                      style={({ pressed }) => [
                        styles.inlineActionButton,
                        isWorking ? styles.buttonDisabled : null,
                        pressed ? styles.buttonPressed : null,
                      ]}
                    >
                      {isWorking ? (
                        <ActivityIndicator color={theme.colors.background} size="small" />
                      ) : (
                        <Text style={styles.inlineActionText}>
                          {linkedAccount ? "Sync" : "Link"}
                        </Text>
                      )}
                    </Pressable>
                  </View>

                  <Text style={styles.accountDescription}>
                    {linkedAccount?.displayName
                      ? `Connected as ${linkedAccount.displayName}. ${providerInfo.description}`
                      : providerInfo.description}
                  </Text>

                  {isSteamProvider && linkedAccount ? (
                    <View style={styles.securityBlock}>
                      <Text style={styles.securityTitle}>
                        {verifiedSteamLink ? "Verified via Steam sign-in" : "Link verification needed"}
                      </Text>
                      <Text style={styles.helperText}>
                        Only public Steam profile, library, and achievement data are synced into
                        PlayThread.
                      </Text>
                    </View>
                  ) : null}

                  {isSteamProvider ? (
                    <Pressable
                      onPress={() => router.push("/steam-privacy")}
                      style={({ pressed }) => [
                        styles.infoLinkButton,
                        pressed ? styles.buttonPressed : null,
                      ]}
                    >
                      <Text style={styles.infoLinkText}>What Steam data does PlayThread store?</Text>
                    </Pressable>
                  ) : null}

                  {isSteamProvider && !linkedAccount ? (
                    <View style={styles.inlineFieldGroup}>
                      <Text style={styles.helperText}>
                        Steam now links through Steam sign-in, so PlayThread only connects an
                        account you actually control.
                      </Text>
                    </View>
                  ) : null}

                  {isSteamProvider && linkedAccount?.profileUrl ? (
                    <Text style={styles.helperText}>{linkedAccount.profileUrl}</Text>
                  ) : null}

                  {isSteamProvider && linkedAccount ? (
                    <Pressable
                      disabled={isWorking}
                      onPress={() => handleUnlinkPress(provider)}
                      style={({ pressed }) => [
                        styles.unlinkButton,
                        isWorking ? styles.buttonDisabled : null,
                        pressed ? styles.buttonPressed : null,
                      ]}
                    >
                      <Text style={styles.unlinkButtonText}>Unlink Steam</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </SectionCard>

      <SectionCard title="Showcase" eyebrow="Profile">
        {showcaseLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.bodyText}>Loading profile showcase...</Text>
          </View>
        ) : showcaseItems.length > 0 ? (
          <View style={styles.showcaseList}>
            {showcaseItems.slice(0, 3).map((item) => (
              <View key={item.id} style={styles.showcaseCard}>
                {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.showcaseImage} /> : null}
                <View style={styles.showcaseTextBlock}>
                  <Text style={styles.showcaseTitle}>{item.title}</Text>
                  <Text style={styles.showcaseMeta}>
                    {item.metadata?.display_variant === "mastery"
                      ? "Mastery"
                      : item.kind === "achievement"
                        ? "Achievement"
                        : "Game"} •{" "}
                    {getProviderLabel(item.provider)}
                  </Text>
                  {item.subtitle ? (
                    <Text style={styles.accountDescription}>{item.subtitle}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.bodyText}>
              No showcase items yet. Link Steam next, sync a small set of games, and pin featured
              achievements here.
            </Text>
            <Text style={styles.emptyStateMeta}>
              Planned layout: top 3 featured achievements and favorite completed games.
            </Text>
          </View>
        )}

        <View style={styles.showcaseSummaryRow}>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryChipText}>{featuredAchievements.length} achievements</Text>
          </View>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryChipText}>{showcaseItems.length} total items</Text>
          </View>
          {steamAccount ? (
            <Pressable
              disabled={savingShowcase || showcaseCatalogLoading}
              onPress={editingShowcase ? handleSaveShowcase : handleStartShowcaseEdit}
              style={({ pressed }) => [
                styles.summaryChip,
                styles.summaryActionChip,
                (savingShowcase || showcaseCatalogLoading) ? styles.buttonDisabled : null,
                pressed ? styles.buttonPressed : null,
              ]}
            >
              <Text style={styles.summaryChipText}>
                {editingShowcase ? (savingShowcase ? "Saving..." : "Save showcase") : "Edit showcase"}
              </Text>
            </Pressable>
          ) : null}
          {editingShowcase ? (
            <Pressable
              disabled={savingShowcase}
              onPress={() => {
                setEditingShowcase(false);
                setSelectedShowcaseIds([]);
                setExpandedGameIds([]);
                setShowcaseSearch("");
              }}
              style={({ pressed }) => [
                styles.summaryChip,
                savingShowcase ? styles.buttonDisabled : null,
                pressed ? styles.buttonPressed : null,
              ]}
            >
              <Text style={styles.summaryChipText}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>

        {editingShowcase ? (
          <View style={styles.editorBlock}>
            <Text style={styles.accountDescription}>
              Pick up to 3 Steam games or achievements to feature on your profile. Sync will keep
              these manual picks.
            </Text>
            <Text style={styles.editorCounter}>{selectedShowcaseIds.length}/3 selected</Text>

            <View style={styles.selectedList}>
              {selectedShowcaseItems.length > 0 ? (
                selectedShowcaseItems.map((item) => (
                  <View key={`selected:${item.id}`} style={styles.selectedCard}>
                    <View style={styles.selectedCardText}>
                      <Text style={styles.selectedOrderLabel}>
                        Slot {selectedShowcaseIds.indexOf(item.id) + 1}
                      </Text>
                      <Text style={styles.editorTypeLabel}>
                        {item.metadata?.display_variant === "mastery"
                          ? "Mastery"
                          : item.kind === "achievement"
                            ? "Achievement"
                            : "Game"}
                      </Text>
                      <Text style={styles.showcaseTitle}>{item.title}</Text>
                      {item.subtitle ? (
                        <Text style={styles.accountDescription}>{item.subtitle}</Text>
                      ) : null}
                    </View>

                    <View style={styles.selectedActions}>
                      <Pressable
                        disabled={selectedShowcaseIds.indexOf(item.id) === 0}
                        onPress={() => handleMoveSelectedShowcaseItem(item.id, "up")}
                        style={({ pressed }) => [
                          styles.reorderSelectedButton,
                          selectedShowcaseIds.indexOf(item.id) === 0 ? styles.buttonDisabled : null,
                          pressed ? styles.buttonPressed : null,
                        ]}
                      >
                        <Text style={styles.reorderSelectedButtonText}>Earlier</Text>
                      </Pressable>

                      <Pressable
                        disabled={selectedShowcaseIds.indexOf(item.id) === selectedShowcaseItems.length - 1}
                        onPress={() => handleMoveSelectedShowcaseItem(item.id, "down")}
                        style={({ pressed }) => [
                          styles.reorderSelectedButton,
                          selectedShowcaseIds.indexOf(item.id) === selectedShowcaseItems.length - 1
                            ? styles.buttonDisabled
                            : null,
                          pressed ? styles.buttonPressed : null,
                        ]}
                      >
                        <Text style={styles.reorderSelectedButtonText}>Later</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => handleToggleShowcaseItem(item.id)}
                        style={({ pressed }) => [
                          styles.removeSelectedButton,
                          pressed ? styles.buttonPressed : null,
                        ]}
                      >
                        <Text style={styles.removeSelectedButtonText}>Remove</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.helperText}>
                  Select up to 3 items below. You can remove current picks here anytime.
                </Text>
              )}
            </View>

            {showcaseCatalogLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={theme.colors.accent} />
                <Text style={styles.bodyText}>Loading synced Steam items...</Text>
              </View>
            ) : (
              <View style={styles.editorList}>
                <TextInput
                  value={showcaseSearch}
                  onChangeText={setShowcaseSearch}
                  placeholder="Search synced Steam games"
                  placeholderTextColor={theme.colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.textInput}
                />
                <Text style={styles.helperText}>
                  {filteredSteamShowcaseGameGroups.length === steamShowcaseGameGroups.length
                    ? `${steamShowcaseGameGroups.length} synced games available. Search tolerates small typos.`
                    : `Showing ${filteredSteamShowcaseGameGroups.length} of ${steamShowcaseGameGroups.length} synced games.`}
                </Text>
                <View style={styles.sortRow}>
                  {Object.entries(GAME_SORT_OPTIONS).map(([sortKey, sortLabel]) => (
                    <Pressable
                      key={sortKey}
                      onPress={() => setGameSort(sortKey)}
                      style={({ pressed }) => [
                        styles.sortChip,
                        gameSort === sortKey ? styles.sortChipActive : null,
                        pressed ? styles.buttonPressed : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.sortChipText,
                          gameSort === sortKey ? styles.sortChipTextActive : null,
                        ]}
                      >
                        {sortLabel}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {filteredSteamShowcaseGameGroups.length > 0 ? (
                  filteredSteamShowcaseGameGroups.map((group) => {
                    const gameItem = group.game;
                    const gameSelected = selectedShowcaseIds.includes(gameItem.id);
                    const gameExpanded = expandedGameIds.includes(gameItem.providerGameId);

                    return (
                      <View key={gameItem.id} style={styles.gameGroup}>
                        <Pressable
                          onPress={() => handleExpandGame(group)}
                          style={({ pressed }) => [
                            styles.editorCard,
                            gameExpanded ? styles.editorCardExpanded : null,
                            pressed ? styles.buttonPressed : null,
                          ]}
                        >
                          <Text style={styles.editorTypeLabel}>Game</Text>
                          <Text style={styles.showcaseTitle}>{gameItem.title}</Text>
                          <Text style={styles.accountDescription}>{gameItem.subtitle}</Text>
                          <Text style={styles.editorHintText}>
                            {loadingGameIds.includes(gameItem.providerGameId)
                              ? "Loading achievements..."
                              : gameExpanded
                                ? "Hide achievements"
                                : "Show achievements"}
                          </Text>
                        </Pressable>

                        {gameExpanded ? (
                          <View style={styles.gameGroupDetail}>
                            <Pressable
                              onPress={() => handleToggleShowcaseItem(gameItem.id)}
                              style={({ pressed }) => [
                                styles.editorCard,
                                gameSelected ? styles.editorCardSelected : null,
                                pressed ? styles.buttonPressed : null,
                              ]}
                            >
                              <Text style={styles.editorTypeLabel}>Showcase game</Text>
                              <Text style={styles.showcaseTitle}>{gameItem.title}</Text>
                              <Text style={styles.accountDescription}>
                                {gameItem.playtimeHours !== null
                                  ? `${gameItem.playtimeHours.toFixed(2)} hours played`
                                  : gameItem.subtitle}
                              </Text>
                              <Text style={styles.editorSelectionText}>
                                {gameSelected ? "Selected" : "Tap to select"}
                              </Text>
                            </Pressable>

                            {group.masteryItem ? (
                              <Pressable
                                onPress={() => handleToggleShowcaseItem(group.masteryItem.id)}
                                style={({ pressed }) => [
                                  styles.editorCard,
                                  selectedShowcaseIds.includes(group.masteryItem.id)
                                    ? styles.editorCardSelected
                                    : null,
                                  pressed ? styles.buttonPressed : null,
                                ]}
                              >
                                <Text style={styles.editorTypeLabel}>Mastery</Text>
                                <Text style={styles.showcaseTitle}>{group.masteryItem.title}</Text>
                                <Text style={styles.accountDescription}>
                                  {group.masteryItem.subtitle}
                                </Text>
                                <Text style={styles.editorSelectionText}>
                                  {selectedShowcaseIds.includes(group.masteryItem.id)
                                    ? "Selected"
                                    : "Tap to select"}
                                </Text>
                              </Pressable>
                            ) : null}

                            {group.achievements.length > 0 ? (
                              group.achievements.map((item) => {
                                const isSelected = selectedShowcaseIds.includes(item.id);

                                return (
                                  <Pressable
                                    key={item.id}
                                    onPress={() => handleToggleShowcaseItem(item.id)}
                                    style={({ pressed }) => [
                                      styles.editorCard,
                                      styles.editorSubcard,
                                      isSelected ? styles.editorCardSelected : null,
                                      pressed ? styles.buttonPressed : null,
                                    ]}
                                  >
                                    <Text style={styles.editorTypeLabel}>Achievement</Text>
                                    <Text style={styles.showcaseTitle}>{item.title}</Text>
                                    <Text style={styles.accountDescription}>{item.subtitle}</Text>
                                    <Text style={styles.editorSelectionText}>
                                      {isSelected ? "Selected" : "Tap to select"}
                                    </Text>
                                  </Pressable>
                                );
                              })
                            ) : (
                              <Text style={styles.helperText}>
                                No unlocked achievements synced for this game yet.
                              </Text>
                            )}
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.bodyText}>No synced Steam games match that search.</Text>
                    <Text style={styles.emptyStateMeta}>
                      Try a shorter title, a close spelling, or clear the search field.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        ) : null}
      </SectionCard>

      {(profile?.developer_game_ids ?? []).length > 0 ? (
        <SectionCard title="Developer verification" eyebrow="Verified">
          <Text style={styles.accountDescription}>
            This account is verified for {(profile?.developer_game_ids ?? []).length} game communities.
          </Text>
          {verifiedDeveloperGames.length > 0 ? (
            <View style={styles.nowPlayingList}>
              {verifiedDeveloperGames.slice(0, 6).map((game) => (
                <Pressable
                  key={`developer:${game.id}`}
                  onPress={() => router.push(`/game/${game.id}`)}
                  style={({ pressed }) => [styles.nowPlayingCard, pressed ? styles.buttonPressed : null]}
                >
                  {game.coverUrl ? (
                    <Image source={{ uri: game.coverUrl }} style={styles.nowPlayingCover} />
                  ) : (
                    <View style={[styles.nowPlayingCover, styles.nowPlayingFallbackCover]}>
                      <Text style={styles.followFallbackText}>{game.title.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={styles.nowPlayingTitle} numberOfLines={2}>{game.title}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.bodyText}>Follow one of your verified games to surface quick links here.</Text>
          )}
        </SectionCard>
      ) : null}

      {nowPlayingIds.length > 0 ? (
        <SectionCard title="Currently playing" eyebrow="Now playing">
          <View style={styles.nowPlayingList}>
            {followedGames
              .filter((game) => nowPlayingIds.includes(Number(game.id)))
              .map((game) => (
                <Pressable
                  key={game.id}
                  onPress={() => router.push(`/game/${game.id}`)}
                  style={({ pressed }) => [styles.nowPlayingCard, pressed ? styles.buttonPressed : null]}
                >
                  {game.coverUrl ? (
                    <Image source={{ uri: game.coverUrl }} style={styles.nowPlayingCover} />
                  ) : (
                    <View style={[styles.nowPlayingCover, styles.nowPlayingFallbackCover]}>
                      <Text style={styles.followFallbackText}>{game.title.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={styles.nowPlayingTitle} numberOfLines={2}>{game.title}</Text>
                  {reviewsByGameId.has(String(game.id)) ? (
                    <Text style={styles.nowPlayingMeta}>
                      Your rating: {reviewsByGameId.get(String(game.id))}/10
                    </Text>
                  ) : null}
                </Pressable>
              ))}
          </View>
        </SectionCard>
      ) : null}

      <SectionCard title="Following" eyebrow="Your games">
        {followsLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.bodyText}>Loading followed games...</Text>
          </View>
        ) : followedGames.length > 0 ? (
          <View style={styles.followList}>
            {followedGames.map((game) => (
              <View key={game.id} style={styles.followCard}>
                <Pressable
                  onPress={() => router.push(`/game/${game.id}`)}
                  style={({ pressed }) => [
                    styles.followMainArea,
                    pressed ? styles.buttonPressed : null,
                  ]}
                >
                  {game.coverUrl ? (
                    <Image source={{ uri: game.coverUrl }} style={styles.followCover} />
                  ) : (
                    <View style={styles.followFallbackCover}>
                      <Text style={styles.followFallbackText}>
                        {game.title.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View style={styles.followTextBlock}>
                    <Text style={styles.followTitle}>{game.title}</Text>
                    <Text style={styles.followMeta}>
                      {getFollowStatusLabel(game.playStatus)} | Followed{" "}
                      {new Date(game.followedAt).toLocaleDateString()}
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => handleUnfollow(game)}
                  style={({ pressed }) => [
                    styles.secondaryActionButton,
                    pressed ? styles.buttonPressed : null,
                  ]}
                >
                  <Text style={styles.secondaryActionText}>Unfollow</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.bodyText}>
            You are not following any games yet. Browse live IGDB results and follow a few to build this list.
          </Text>
        )}
      </SectionCard>

      <SectionCard title="Media" eyebrow="Your screenshots and clips">
        {myMediaPosts.length > 0 ? (
          <View style={styles.mediaGrid}>
            {myMediaPosts.map((post) => {
              const imageUrl = post.imageUrls?.[0] ?? post.imageUrl ?? post.videoThumbnailUrl ?? null;
              return (
                <Pressable
                  key={`media:${post.id}`}
                  onPress={() => router.push(`/post/${post.id}`)}
                  style={styles.mediaTile}
                >
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.mediaTileImage} />
                  ) : (
                    <View style={styles.mediaTileFallback}>
                      <Text style={styles.mediaTileFallbackText}>Clip</Text>
                    </View>
                  )}
                  <Text numberOfLines={1} style={styles.mediaTileLabel}>{post.gameTitle}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={styles.bodyText}>Your image and clip posts will appear here.</Text>
        )}
      </SectionCard>

      <SectionCard title="Saved posts" eyebrow="Bookmarks">
        {savedPostsLoading ? (
          <ActivityIndicator color={theme.colors.accent} />
        ) : savedPosts.length > 0 ? (
          <View style={styles.feedList}>
            <View style={styles.savedCollectionFilterRow}>
              {savedCollectionFilters.map((collection) => {
                const isActive = activeSavedCollection === collection;
                return (
                  <Pressable
                    key={`saved-filter:${collection}`}
                    onPress={() => setActiveSavedCollection(collection)}
                    style={({ pressed }) => [
                      styles.savedCollectionFilter,
                      isActive ? styles.savedCollectionFilterActive : null,
                      pressed ? styles.buttonPressed : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.savedCollectionFilterText,
                        isActive ? styles.savedCollectionFilterTextActive : null,
                      ]}
                    >
                      {collection}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {filteredSavedPosts.length > 0 ? filteredSavedPosts.map((post) => (
              <View key={`saved:${post.id}`} style={styles.savedPostWrap}>
                <View style={styles.savedCollectionPill}>
                  <Text style={styles.savedCollectionLabel}>
                    Saved in {savedCollectionByPostId.get(String(post.id)) ?? "General"}
                  </Text>
                </View>
                <View style={styles.savedCollectionActions}>
                  {SAVED_POST_COLLECTIONS.map((collection) => {
                    const isCurrent = (savedCollectionByPostId.get(String(post.id)) ?? "General") === collection;
                    return (
                      <Pressable
                        disabled={isCurrent}
                        key={`saved:${post.id}:collection:${collection}`}
                        onPress={() => updateSavedPostCollection(post.id, collection)}
                        style={({ pressed }) => [
                          styles.savedCollectionAction,
                          isCurrent ? styles.savedCollectionActionActive : null,
                          pressed && !isCurrent ? styles.buttonPressed : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.savedCollectionActionText,
                            isCurrent ? styles.savedCollectionActionTextActive : null,
                          ]}
                        >
                          {collection}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <PostCard
                  isSaved
                  onAuthorPress={() => router.push(`/user/${post.userId}`)}
                  onGamePress={() => router.push(`/game/${post.gameId}`)}
                  onOpenComments={() =>
                    router.push({ pathname: "/post/[id]", params: { id: post.id, scrollTo: "comments" } })
                  }
                  onPress={() => router.push(`/post/${post.id}`)}
                  onSave={() => toggleSavedPost(post.id)}
                  post={post}
                />
              </View>
            )) : (
              <Text style={styles.bodyText}>No saved posts in {activeSavedCollection} yet.</Text>
            )}
          </View>
        ) : (
          <Text style={styles.bodyText}>Saved guides, images, reviews, and discussions will appear here.</Text>
        )}
      </SectionCard>

      <SectionCard title="Post history" eyebrow="Your posts">
        {myPostsLoading ? (
          <ActivityIndicator color={theme.colors.accent} />
        ) : myPosts.length > 0 ? (
          <View style={styles.feedList}>
            {myPosts.map((post) => (
              <PostCard
                key={post.id}
                onAuthorPress={() => {}}
                onOpenComments={() =>
                  router.push({ pathname: "/post/[id]", params: { id: post.id, scrollTo: "comments" } })
                }
                onPress={() => router.push(`/post/${post.id}`)}
                post={post}
              />
            ))}
            {myPostsHasMore ? (
              <Pressable
                disabled={myPostsLoadingMore}
                onPress={loadMoreMyPosts}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  myPostsLoadingMore ? styles.buttonDisabled : null,
                  pressed && !myPostsLoadingMore ? styles.buttonPressed : null,
                ]}
              >
                {myPostsLoadingMore ? (
                  <ActivityIndicator color={theme.colors.accent} size="small" />
                ) : (
                  <Text style={styles.secondaryButtonText}>Load more</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Text style={styles.bodyText}>
            You have not posted anything yet. Share a review or discussion from a game page.
          </Text>
        )}
      </SectionCard>

      <SectionCard title="Comment history" eyebrow="Your replies">
        {myCommentsLoading ? (
          <ActivityIndicator color={theme.colors.accent} />
        ) : myComments.length > 0 ? (
          <View style={styles.feedList}>
            {myComments.map((comment) => (
              <Pressable
                key={comment.id}
                onPress={() =>
                  router.push({ pathname: "/post/[id]", params: { id: comment.postId, scrollTo: "comments" } })
                }
                style={({ pressed }) => [styles.commentHistoryCard, pressed ? styles.buttonPressed : null]}
              >
                <Text style={styles.commentHistoryTitle}>{comment.postTitle}</Text>
                {comment.gameTitle ? <Text style={styles.commentHistoryMeta}>{comment.gameTitle}</Text> : null}
                <Text numberOfLines={3} style={styles.bodyText}>{comment.body || "Image comment"}</Text>
              </Pressable>
            ))}
            {myCommentsHasMore ? (
              <Pressable
                disabled={myCommentsLoadingMore}
                onPress={loadMoreMyComments}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  myCommentsLoadingMore ? styles.buttonDisabled : null,
                  pressed && !myCommentsLoadingMore ? styles.buttonPressed : null,
                ]}
              >
                {myCommentsLoadingMore ? (
                  <ActivityIndicator color={theme.colors.accent} size="small" />
                ) : (
                  <Text style={styles.secondaryButtonText}>Load more</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Text style={styles.bodyText}>You have not left any comments yet.</Text>
        )}
      </SectionCard>

      <SectionCard title="Settings" eyebrow="Account">
        <View style={styles.inlineFieldGroup}>
          <Text style={styles.securityTitle}>Email</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmailDraft}
            placeholder="Email address"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.textInput}
            value={emailDraft}
          />
          <Pressable
            disabled={savingEmail}
            onPress={handleSaveEmail}
            style={({ pressed }) => [
              styles.secondaryButton,
              savingEmail ? styles.buttonDisabled : null,
              pressed && !savingEmail ? styles.buttonPressed : null,
            ]}
          >
            <Text style={styles.secondaryButtonText}>{savingEmail ? "Saving..." : "Change email"}</Text>
          </Pressable>
        </View>
        <View style={styles.inlineFieldGroup}>
          <Text style={styles.securityTitle}>Password</Text>
          <Text style={styles.helperText}>
            Send a password reset email and finish the update from the secure reset screen.
          </Text>
          <Pressable
            onPress={handleRequestPasswordReset}
            style={({ pressed }) => [styles.secondaryButton, pressed ? styles.buttonPressed : null]}
          >
            <Text style={styles.secondaryButtonText}>Change password</Text>
          </Pressable>
        </View>
        {canOpenAdmin ? (
          <Pressable
            onPress={() => router.push("/admin")}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed ? styles.buttonPressed : null,
            ]}
          >
            <Text style={styles.secondaryButtonText}>
              {isAdminRole(profile?.account_role) ? "Open admin console" : "Open moderation queue"}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          disabled={loading}
          onPress={handleLogout}
          style={({ pressed }) => [
            styles.button,
            pressed && !loading ? styles.buttonPressed : null,
            loading ? styles.buttonDisabled : null,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.background} />
          ) : (
            <Text style={styles.buttonText}>Log out</Text>
          )}
        </Pressable>
      </SectionCard>

      <Modal
        animationType="slide"
        transparent
        visible={Boolean(activeStatFilter)}
        onRequestClose={() => {
          setActiveStatFilterKey(null);
          setStatSearchQuery("");
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.eyebrow}>Your games</Text>
                <Text style={styles.modalTitle}>{activeStatFilter?.label ?? "Games"}</Text>
              </View>
              <Pressable
                onPress={() => {
                  setActiveStatFilterKey(null);
                  setStatSearchQuery("");
                }}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </View>

            <TextInput
              autoCapitalize="none"
              onChangeText={setStatSearchQuery}
              placeholder={`Search ${activeStatFilter?.label?.toLowerCase() ?? "games"}`}
              placeholderTextColor={theme.colors.textMuted}
              style={styles.textInput}
              value={statSearchQuery}
            />
            <ScrollView contentContainerStyle={styles.modalList}>
              {filteredStatGames.length > 0 ? (
                filteredStatGames.map((game) => (
                  <Pressable
                    key={`${activeStatFilterKey}:${game.id}`}
                    onPress={() => {
                      setActiveStatFilterKey(null);
                      setStatSearchQuery("");
                      router.push(`/game/${game.id}`);
                    }}
                    style={({ pressed }) => [
                      styles.modalGameCard,
                      pressed ? styles.buttonPressed : null,
                    ]}
                  >
                    {game.coverUrl ? (
                      <Image source={{ uri: game.coverUrl }} style={styles.modalGameCover} />
                    ) : (
                      <View style={styles.modalGameFallback}>
                        <Text style={styles.modalGameFallbackText}>
                          {game.title.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.modalGameText}>
                      <Text style={styles.modalGameTitle}>{game.title}</Text>
                      <Text style={styles.modalGameMeta}>
                        {activeStatFilterKey === "reviewed"
                          ? "Reviewed"
                          : getFollowStatusLabel(game.playStatus)}{" "}
                        |{" "}
                        {activeStatFilterKey === "reviewed" ? "Updated" : "Followed"}{" "}
                        {new Date(game.followedAt).toLocaleDateString()}
                      </Text>
                      {["completed", "reviewed"].includes(activeStatFilterKey ?? "") &&
                      reviewsByGameId.has(String(game.id)) ? (
                        <Text style={styles.modalGameRating}>
                          ★ {reviewsByGameId.get(String(game.id))} / 10
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.bodyText}>{activeStatFilter?.emptyText}</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    alignItems: "center",
    gap: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    width: "100%",
  },
  heroActionButton: {
    minHeight: 40,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroActionButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  heroTopSpacer: {
    flex: 1,
  },
  avatar: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
  },
  heroBio: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
    textAlign: "center",
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    justifyContent: "center",
  },
  reputationBadge: {
    backgroundColor: "rgba(255,204,51,0.12)",
    borderColor: "rgba(255,204,51,0.38)",
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  reputationBadgeText: {
    color: "#ffcc33",
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
  },
  handleText: {
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  heroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: theme.spacing.sm,
  },
  heroChip: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  heroChipText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  titleBadge: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  titleBadgeGold: {
    backgroundColor: "rgba(255,204,51,0.14)",
    borderColor: "rgba(255,204,51,0.45)",
  },
  titleBadgeText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  titleBadgeTextGold: {
    color: "#ffcc33",
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  statRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  statBox: {
    flex: 1,
    minWidth: "44%",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    gap: 2,
  },
  statBoxFullRow: {
    minWidth: "100%",
  },
  statBoxThird: {
    minWidth: 0,
  },
  statValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
  },
  statSubValue: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.medium,
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
    textTransform: "uppercase",
  },
  expandToggle: {
    alignSelf: "flex-start",
    paddingVertical: theme.spacing.xs,
  },
  expandToggleText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  feedList: {
    gap: theme.spacing.md,
  },
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  mediaTile: {
    width: "31%",
    gap: theme.spacing.xs,
  },
  mediaTileImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  mediaTileFallback: {
    width: "100%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  mediaTileFallbackText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  mediaTileLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
  },
  savedPostWrap: {
    gap: theme.spacing.xs,
  },
  savedCollectionPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,229,255,0.12)",
    borderColor: "rgba(0,229,255,0.32)",
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  savedCollectionLabel: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
    textTransform: "uppercase",
  },
  savedCollectionFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  savedCollectionFilter: {
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  savedCollectionFilterActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  savedCollectionFilterText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  savedCollectionFilterTextActive: {
    color: theme.colors.background,
  },
  savedCollectionActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
  },
  savedCollectionAction: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  savedCollectionActionActive: {
    backgroundColor: "rgba(0,229,255,0.12)",
    borderColor: "rgba(0,229,255,0.32)",
  },
  savedCollectionActionText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
  },
  savedCollectionActionTextActive: {
    color: theme.colors.accent,
  },
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  accountList: {
    gap: theme.spacing.md,
  },
  accountCard: {
    gap: theme.spacing.sm,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
  },
  accountHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  accountTitleBlock: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  accountTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  accountMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
  },
  accountDescription: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    lineHeight: 20,
  },
  securityBlock: {
    gap: theme.spacing.xs,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.sm,
  },
  securityTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  inlineActionButton: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 72,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  inlineActionText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  inlineFieldGroup: {
    gap: theme.spacing.sm,
  },
  infoLinkButton: {
    alignSelf: "flex-start",
    paddingVertical: theme.spacing.xs,
  },
  infoLinkText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
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
  multilineInput: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  avatarPreviewCard: {
    gap: theme.spacing.sm,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
  },
  avatarPreviewImage: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.pill,
  },
  helperText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: theme.spacing.md,
  },
  modalCard: {
    maxHeight: "80%",
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: theme.borders.width,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  modalHeaderText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
  },
  closeButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  closeButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  modalList: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  modalGameCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
  },
  modalGameCover: {
    width: 48,
    height: 68,
    borderRadius: theme.radius.sm,
  },
  modalGameFallback: {
    width: 48,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: theme.radius.sm,
  },
  modalGameFallbackText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },
  modalGameText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  modalGameTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  modalGameMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
  },
  modalGameRating: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  loadingState: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  emptyState: {
    gap: theme.spacing.sm,
  },
  emptyStateMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
  },
  showcaseList: {
    gap: theme.spacing.sm,
  },
  showcaseCard: {
    flexDirection: "row",
    gap: theme.spacing.md,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
  },
  showcaseImage: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  showcaseTextBlock: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  showcaseTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  showcaseMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
    textTransform: "uppercase",
  },
  showcaseSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  summaryActionChip: {
    backgroundColor: theme.colors.accent,
  },
  summaryChip: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  summaryChipText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  editorBlock: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  editorCounter: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
  },
  selectedList: {
    gap: theme.spacing.sm,
  },
  selectedCard: {
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
  selectedCardText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  selectedOrderLabel: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
    textTransform: "uppercase",
  },
  selectedActions: {
    alignItems: "flex-end",
    gap: theme.spacing.xs,
  },
  reorderSelectedButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    minWidth: 88,
  },
  reorderSelectedButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  removeSelectedButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  removeSelectedButtonText: {
    color: "#ff8a8a",
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  editorList: {
    gap: theme.spacing.sm,
  },
  sortRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  sortChip: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  sortChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  sortChipText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  sortChipTextActive: {
    color: theme.colors.background,
  },
  gameGroup: {
    gap: theme.spacing.sm,
  },
  gameGroupDetail: {
    gap: theme.spacing.sm,
    paddingLeft: theme.spacing.sm,
    borderLeftColor: theme.colors.border,
    borderLeftWidth: theme.borders.width,
  },
  editorCard: {
    gap: theme.spacing.xs,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
  },
  editorCardSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(210,133,66,0.12)",
  },
  editorCardExpanded: {
    borderColor: theme.colors.textSecondary,
  },
  editorSubcard: {
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  editorTypeLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
    textTransform: "uppercase",
  },
  editorSelectionText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  editorHintText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  nowPlayingList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.md,
  },
  nowPlayingCard: {
    alignItems: "center",
    gap: theme.spacing.xs,
    width: 80,
  },
  nowPlayingCover: {
    width: 72,
    height: 96,
    borderRadius: theme.radius.sm,
  },
  nowPlayingFallbackCover: {
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  nowPlayingTitle: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    textAlign: "center",
  },
  nowPlayingMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
    textAlign: "center",
  },
  followList: {
    gap: theme.spacing.md,
  },
  commentHistoryCard: {
    gap: theme.spacing.xs,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
  },
  commentHistoryTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  commentHistoryMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
  },
  followCard: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: theme.borders.width,
  },
  followMainArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  followCover: {
    width: 48,
    height: 68,
    borderRadius: theme.radius.sm,
  },
  followFallbackCover: {
    width: 48,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: theme.radius.sm,
  },
  followFallbackText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },
  followTextBlock: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  followTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  followMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
  },
  friendRequestBanner: {
    backgroundColor: "rgba(0,229,255,0.10)",
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  friendRequestBannerText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  friendList: {
    gap: theme.spacing.sm,
  },
  friendCard: {
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: theme.borders.width,
  },
  friendName: {
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  friendDisplayName: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
  },
  friendBio: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
  },
  secondaryActionButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.sm,
  },
  secondaryActionText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  secondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  nsfwToggleRow: {
    flexDirection: "row",
    borderRadius: theme.radius.md,
    borderColor: theme.colors.border,
    borderWidth: theme.borders.width,
    overflow: "hidden",
  },
  nsfwToggleOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: theme.spacing.md,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  nsfwToggleOptionActive: {
    backgroundColor: theme.colors.accent,
  },
  nsfwToggleOptionHidden: {
    backgroundColor: "rgba(185,28,28,0.25)",
  },
  nsfwToggleOptionText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  nsfwToggleOptionTextActive: {
    color: theme.colors.background,
  },
  nsfwToggleOptionTextHidden: {
    color: "#fca5a5",
  },
  primaryActionButton: {
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  primaryActionText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  unlinkButton: {
    alignSelf: "flex-start",
    paddingVertical: theme.spacing.xs,
  },
  unlinkButtonText: {
    color: "#ff8a8a",
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
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
});
