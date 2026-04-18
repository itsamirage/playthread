import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import SectionCard from "../components/SectionCard";
import { useAuth } from "../lib/auth";
import { pickClipVideo } from "../lib/clipMedia";
import { getCommunityById } from "../lib/communityHubs";
import { useFollows } from "../lib/follows";
import { useBrowseGames, useGameDetail } from "../lib/games";
import { describeIntegrityError } from "../lib/integrity";
import { goBackOrFallback } from "../lib/navigation";
import { pickPostImages } from "../lib/postMedia";
import { createPost, updatePost, useEditablePost } from "../lib/posts";
import { theme } from "../lib/theme";

const postTypes = ["discussion", "review", "guide", "tip", "screenshot", "clip"];
const ratingOptions = [
  "1",
  "1.5",
  "2",
  "2.5",
  "3",
  "3.5",
  "4",
  "4.5",
  "5",
  "5.5",
  "6",
  "6.5",
  "7",
  "7.5",
  "8",
  "8.5",
  "9",
  "9.5",
  "10",
];

export default function CreatePostScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const { followedGames } = useFollows();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef(null);
  const initialGameId = Number(params.gameId);
  const lockedContext = String(params.lockContext ?? "") === "true";
  const routeContextTitle = String(params.gameTitle ?? "").trim() || null;
  const allowedPostTypes = String(params.allowedTypes ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const editPostId = typeof params.postId === "string" ? params.postId : null;
  const { game: routeGame } = useGameDetail(initialGameId);
  const routeCommunity = getCommunityById(initialGameId);
  const launchedFromGamePage = !Number.isNaN(initialGameId) && initialGameId !== 0;
  const { post: editablePost, isLoading: editablePostLoading } = useEditablePost(
    editPostId,
    Boolean(editPostId),
  );
  const [selectedGameId, setSelectedGameId] = useState(
    !Number.isNaN(initialGameId) && initialGameId !== 0 ? initialGameId : null
  );
  const initialType = typeof params.type === "string" && postTypes.includes(params.type) ? params.type : "discussion";
  const [postType, setPostType] = useState(initialType);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rating, setRating] = useState("8");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [spoilerTag, setSpoilerTag] = useState("");
  const [selectedImages, setSelectedImages] = useState([]);
  const [selectedClip, setSelectedClip] = useState(null);
  const [gameSearch, setGameSearch] = useState("");
  const [showAlternateGamePicker, setShowAlternateGamePicker] = useState(!launchedFromGamePage);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const [hasLoadedEditValues, setHasLoadedEditValues] = useState(false);
  const isEditing = Boolean(editPostId);
  const availablePostTypes = allowedPostTypes.length > 0 ? postTypes.filter((type) => allowedPostTypes.includes(type)) : postTypes;

  useEffect(() => {
    if (!availablePostTypes.includes(postType)) {
      setPostType(availablePostTypes[0] ?? "discussion");
    }
  }, [availablePostTypes, postType]);

  useEffect(() => {
    if (!Number.isNaN(initialGameId) && initialGameId !== 0) {
      setSelectedGameId(initialGameId);
      return;
    }

    setSelectedGameId(null);
  }, [initialGameId]);

  useEffect(() => {
    if (!isEditing || !editablePost || hasLoadedEditValues) {
      return;
    }

    setSelectedGameId(editablePost.gameId);
    setPostType(editablePost.type);
    setTitle(editablePost.title === "Untitled post" ? "" : editablePost.title);
    setBody(editablePost.body ?? "");
    setIsSpoiler(Boolean(editablePost.spoiler));
    setSpoilerTag(editablePost.spoilerTag ?? "");
    setHasLoadedEditValues(true);
  }, [editablePost, hasLoadedEditValues, isEditing]);

  useEffect(() => {
    const handleShow = (event) => {
      setIsKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    };
    const handleHide = () => {
      setIsKeyboardVisible(false);
      setKeyboardHeight(0);
    };
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, handleShow);
    const hideSubscription = Keyboard.addListener(hideEvent, handleHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const scrollToComposer = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 120);
  };

  const footerPaddingBottom = Math.max(insets.bottom, theme.spacing.md);
  const scrollBottomPadding =
    footerHeight + footerPaddingBottom + theme.spacing.xl + (Platform.OS === "android" ? keyboardHeight : 0);
  const { games: searchedGames, isLoading: isSearchingGames, isDebouncing: isSearchingDebounced } = useBrowseGames({
    query: gameSearch,
    selectedGenre: "All",
  });

  const selectedGame = useMemo(
    () => {
      const followedGame = followedGames.find((game) => game.id === selectedGameId);

      if (followedGame) {
        return followedGame;
      }

      if (routeGame?.id === selectedGameId) {
        return routeGame;
      }

      if (routeCommunity?.id === selectedGameId) {
        return {
          id: routeCommunity.id,
          title: routeCommunity.title,
          coverUrl: null,
        };
      }

      if (routeContextTitle && selectedGameId === initialGameId) {
        return {
          id: selectedGameId,
          title: routeContextTitle,
          coverUrl: null,
        };
      }

      const searchedGame = searchedGames.find((game) => game.id === selectedGameId);

      if (searchedGame) {
        return searchedGame;
      }

      return null;
    },
    [followedGames, initialGameId, routeCommunity, routeContextTitle, routeGame, searchedGames, selectedGameId]
  );

  const selectableGames = useMemo(() => {
    const byId = new Map();

    if (routeGame?.id) {
      byId.set(routeGame.id, routeGame);
    }

    for (const game of followedGames) {
      byId.set(game.id, game);
    }

    return [...byId.values()];
  }, [followedGames, routeGame]);
  const visibleSearchGames = useMemo(() => {
    if (!gameSearch.trim()) {
      return selectableGames.slice(0, 8);
    }

    const uniqueGames = new Map();

    for (const game of searchedGames) {
      if (game?.id) {
        uniqueGames.set(game.id, game);
      }
    }

    return [...uniqueGames.values()].slice(0, 12);
  }, [gameSearch, searchedGames, selectableGames]);
  const searchHelperText = gameSearch.trim()
    ? "Pick a game from the results below."
    : "Search for a game to attach this post to.";

  const handleSubmit = async () => {
    Keyboard.dismiss();

    if (!session?.user?.id) {
      Alert.alert("Sign in required", "You need to be logged in to create a post.");
      return;
    }

    if (!selectedGame) {
      Alert.alert("Pick a game", "Search for a game and attach this post before publishing.");
      return;
    }

    if (!body.trim() && postType !== "clip") {
      Alert.alert("Write something", "Add some text before posting.");
      return;
    }

    try {
      setIsSubmitting(true);

      const { error, moderation } = isEditing
        ? await updatePost({
            postId: editPostId,
            title,
            body,
            spoiler: isSpoiler,
            spoilerTag,
          })
        : await createPost({
            userId: session.user.id,
            gameId: selectedGame.id,
            gameTitle: selectedGame.title,
            gameCoverUrl: selectedGame.coverUrl,
            type: postType,
            title,
            body,
            rating: postType === "review" ? Number(rating) : null,
            spoiler: isSpoiler,
            spoilerTag,
            imageAssets: selectedImages,
            clipAsset: selectedClip,
          });

      if (error) {
        const errorCopy = describeIntegrityError(error);
        Alert.alert(errorCopy.title, errorCopy.detail);
        return;
      }

      if (moderation?.moderationState === "warning") {
        Alert.alert(
          "Post published with a warning",
          "This post was flagged for review and sent to the admin moderation log."
        );
      }

      router.replace(`/game/${selectedGame.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePickImage = async () => {
    try {
      const assets = await pickPostImages({ limit: 6 });

      if (assets.length > 0) {
        setSelectedImages(assets);
        setSelectedClip(null);
      }
    } catch (error) {
      Alert.alert(
        "Image not added",
        error instanceof Error ? error.message : "Could not pick that image.",
      );
    }
  };

  const handlePickClip = async () => {
    try {
      const asset = await pickClipVideo();

      if (asset) {
        setSelectedClip(asset);
        setSelectedImages([]);
      }
    } catch (error) {
      Alert.alert(
        "Clip not added",
        error instanceof Error ? error.message : "Could not pick that clip.",
      );
    }
  };

  if (isEditing && editablePostLoading && !hasLoadedEditValues) {
    return (
      <View style={[styles.screen, styles.loadingCenter]}>
        <ActivityIndicator color={theme.colors.accent} />
        <Text style={styles.helperText}>Loading post details...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "android" ? "height" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      style={styles.screen}
    >
      <View style={styles.screen}>
        <ScrollView
          ref={scrollViewRef}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          style={styles.screen}
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom: scrollBottomPadding,
            },
          ]}
          scrollIndicatorInsets={{ bottom: scrollBottomPadding }}
          >
            <View style={styles.hero}>
              <Text style={styles.eyebrow}>PlayThread</Text>
              <Text style={styles.title}>{isEditing ? "Edit post" : "Create post"}</Text>
              <Text style={styles.subtitle}>
                {isEditing
                  ? "Update your post and spoiler settings."
                  : launchedFromGamePage
                    ? "Start a new thread for this game, or switch to another one."
                    : "Start a new thread for any game by searching first."}
              </Text>
            </View>

          <SectionCard title="Game" eyebrow="Choose a title">
            {isEditing ? (
              <Text style={styles.helperText}>
                This post stays attached to {selectedGame?.title ?? editablePost?.gameTitle ?? "its current game"}.
              </Text>
            ) : (
              <View style={styles.gamePickerBlock}>
                {launchedFromGamePage && selectedGame ? (
                  <View style={styles.selectedGameCard}>
                    <Text style={styles.selectedGameLabel}>Posting in</Text>
                    <Text style={styles.selectedGameTitle}>{selectedGame.title}</Text>
                    {!lockedContext ? (
                      <Pressable
                        onPress={() => setShowAlternateGamePicker((currentValue) => !currentValue)}
                        style={({ pressed }) => [
                          styles.inlineLinkButton,
                          pressed ? styles.buttonPressed : null,
                        ]}
                      >
                        <Text style={styles.inlineLinkText}>
                          {showAlternateGamePicker ? "Keep this game only" : "Choose other game"}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {(!launchedFromGamePage || (showAlternateGamePicker && !lockedContext)) ? (
                  <>
                    <TextInput
                      onChangeText={setGameSearch}
                      placeholder={launchedFromGamePage ? "Search for another game" : "Search for a game"}
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.input}
                      value={gameSearch}
                    />
                    {isSearchingGames || isSearchingDebounced ? (
                      <Text style={styles.helperText}>Searching games...</Text>
                    ) : null}
                    {visibleSearchGames.length ? (
                      <ScrollView
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                        style={styles.searchResults}
                        contentContainerStyle={styles.searchResultsContent}
                      >
                        {visibleSearchGames.map((game) => {
                          const isActive = game.id === selectedGameId;
                          const platformLabel = (game.platforms ?? [])
                            .filter(Boolean)
                            .slice(0, 3)
                            .join(" • ");

                          return (
                            <Pressable
                              key={game.id}
                              onPress={() => setSelectedGameId(game.id)}
                              style={[styles.searchResultCard, isActive ? styles.searchResultCardActive : null]}
                            >
                              <View style={styles.searchResultMedia}>
                                {game.coverUrl ? (
                                  <Image source={{ uri: game.coverUrl }} style={styles.searchResultCover} />
                                ) : (
                                  <View style={styles.searchResultCoverFallback}>
                                    <Text style={styles.searchResultCoverFallbackText}>
                                      {game.title?.slice(0, 1)?.toUpperCase() ?? "?"}
                                    </Text>
                                  </View>
                                )}
                              </View>
                              <View style={styles.searchResultText}>
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    styles.searchResultTitle,
                                    isActive ? styles.searchResultTitleActive : null,
                                  ]}
                                >
                                  {game.title}
                                </Text>
                                {platformLabel ? (
                                  <Text
                                    numberOfLines={1}
                                    style={[
                                      styles.searchResultMeta,
                                      isActive ? styles.searchResultMetaActive : null,
                                    ]}
                                  >
                                    {platformLabel}
                                  </Text>
                                ) : null}
                              </View>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    ) : (
                      <Text style={styles.helperText}>{searchHelperText}</Text>
                    )}
                  </>
                ) : null}
              </View>
            )}
          </SectionCard>

          <SectionCard title="Post type" eyebrow="Thread style">
            <View style={styles.typeRow}>
              {postTypes.map((type) => {
                if (!availablePostTypes.includes(type)) {
                  return null;
                }

                const isActive = type === postType;

                return (
                  <Pressable
                    disabled={isEditing}
                    key={type}
                    onPress={() => setPostType(type)}
                    style={[
                      styles.typeButton,
                      isActive ? styles.typeButtonActive : null,
                      isEditing ? styles.typeButtonDisabled : null,
                    ]}
                  >
                    <Text
                      style={[styles.typeButtonText, isActive ? styles.typeButtonTextActive : null]}
                    >
                      {type === "discussion"
                        ? "Discussion"
                        : type === "review"
                          ? "Review"
                          : type === "guide"
                            ? "Guide"
                            : type === "tip"
                              ? "Tip"
                              : type === "screenshot"
                                ? "Image"
                                : "Clip"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </SectionCard>

          <SectionCard title="Post details" eyebrow="Write it">
            <TextInput
              blurOnSubmit
              onChangeText={setTitle}
              onFocus={scrollToComposer}
              onSubmitEditing={() => Keyboard.dismiss()}
              placeholder="Headline"
              placeholderTextColor={theme.colors.textMuted}
              returnKeyType="done"
              style={styles.input}
              value={title}
            />
            <TextInput
              multiline
              onChangeText={setBody}
              onFocus={scrollToComposer}
              placeholder="What do you want to say?"
              placeholderTextColor={theme.colors.textMuted}
              returnKeyType="default"
              scrollEnabled={false}
              style={[styles.input, styles.bodyInput]}
              textAlignVertical="top"
              value={body}
            />
            {isKeyboardVisible ? (
              <Pressable
                onPress={() => Keyboard.dismiss()}
                style={({ pressed }) => [
                  styles.dismissKeyboardButton,
                  pressed ? styles.buttonPressed : null,
                ]}
              >
                <Text style={styles.dismissKeyboardButtonText}>Done typing</Text>
              </Pressable>
            ) : null}

            {postType === "review" ? (
              <View style={styles.ratingSection}>
                <Text style={styles.ratingLabel}>Review score (/10)</Text>
                <View style={styles.ratingWrap}>
                  {ratingOptions.map((option) => {
                    const isActive = option === rating;

                    return (
                      <Pressable
                        key={option}
                        onPress={() => setRating(option)}
                        style={[styles.ratingChip, isActive ? styles.ratingChipActive : null]}
                      >
                        <Text
                          style={[
                            styles.ratingChipText,
                            isActive ? styles.ratingChipTextActive : null,
                          ]}
                        >
                          {option}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
            {(postType === "guide" || postType === "tip") ? (
              <Text style={styles.helperText}>
                Guide and tip posts use Helpful / Not Helpful reactions instead of Like / Dislike.
              </Text>
            ) : null}
            {postType === "review" ? (
              <Text style={styles.helperText}>
                Reviews use a single Respect reaction so disagreement does not bury honest opinions.
              </Text>
            ) : null}
            {postType === "clip" ? (
              <Text style={styles.helperText}>
                Clip captions are optional. Upload a video and add context if you want it.
              </Text>
            ) : null}
          </SectionCard>

          <SectionCard title={postType === "clip" ? "Clip" : "Image"} eyebrow="Optional media">
            <Text style={styles.helperText}>
              {isEditing
                ? "Media replacement is disabled for now. Edit the post text or delete and recreate the post if you need different media."
                : postType === "clip"
                ? "Attach a video clip up to 200 MB and 3 minutes long. Mux will process it after upload, so playback may appear a moment later."
                : "Attach up to 6 JPG, PNG, WebP, or GIF images. Each image is capped at 10 MB, and the full selection must stay under 24 MB after optimization. Very small or extreme-ratio images are blocked, and upload metadata is recorded for moderation review."}
            </Text>
            {isEditing && postType === "clip" ? (
              <View style={styles.clipPreviewCard}>
                <Text style={styles.clipPreviewTitle}>{editablePost?.title || "Current clip"}</Text>
                <Text style={styles.helperText}>
                  {editablePost?.videoStatus === "ready"
                    ? "Current clip is ready to stream."
                    : editablePost?.videoStatus === "errored"
                      ? "This clip failed to process."
                      : "Current clip is still processing."}
                </Text>
              </View>
            ) : postType === "clip" ? (
              selectedClip?.uri ? (
                <View style={styles.imageCard}>
                  <View style={styles.clipPreviewCard}>
                    <Text style={styles.clipPreviewTitle}>{selectedClip.fileName ?? "Selected clip"}</Text>
                    <Text style={styles.helperText}>
                      {selectedClip.duration ? `Duration: ${Math.max(1, Math.round(selectedClip.duration / 1000))} sec` : "Ready to upload"}
                    </Text>
                  </View>
                  <View style={styles.imageActions}>
                    <Pressable
                      onPress={handlePickClip}
                      style={({ pressed }) => [
                        styles.mediaButton,
                        pressed ? styles.buttonPressed : null,
                      ]}
                    >
                      <Text style={styles.mediaButtonText}>Replace clip</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setSelectedClip(null)}
                      style={({ pressed }) => [
                        styles.mediaButton,
                        styles.mediaButtonDanger,
                        pressed ? styles.buttonPressed : null,
                      ]}
                    >
                      <Text style={styles.mediaButtonDangerText}>Remove clip</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  disabled={isEditing}
                  onPress={handlePickClip}
                  style={({ pressed }) => [
                    styles.mediaButton,
                    pressed ? styles.buttonPressed : null,
                  ]}
                >
                  <Text style={styles.mediaButtonText}>Choose clip</Text>
                </Pressable>
              )
            ) : selectedImages.length > 0 ? (
              <View style={styles.imageCard}>
                <View style={styles.imagePreviewGrid}>
                  {selectedImages.map((image, index) => (
                    <View key={`${image.uri}:${index}`} style={styles.imagePreviewTile}>
                      <Image source={{ uri: image.uri }} style={styles.imagePreview} />
                    </View>
                  ))}
                </View>
                <Text style={styles.helperText}>
                  {selectedImages.length} {selectedImages.length === 1 ? "image" : "images"} selected
                </Text>
                <View style={styles.imageActions}>
                  <Pressable
                    onPress={handlePickImage}
                    style={({ pressed }) => [
                      styles.mediaButton,
                      pressed ? styles.buttonPressed : null,
                    ]}
                  >
                    <Text style={styles.mediaButtonText}>Replace images</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSelectedImages([])}
                    style={({ pressed }) => [
                      styles.mediaButton,
                      styles.mediaButtonDanger,
                      pressed ? styles.buttonPressed : null,
                    ]}
                  >
                    <Text style={styles.mediaButtonDangerText}>Remove images</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={handlePickImage}
                style={({ pressed }) => [
                  styles.mediaButton,
                  pressed ? styles.buttonPressed : null,
                ]}
              >
                <Text style={styles.mediaButtonText}>Choose images</Text>
              </Pressable>
            )}
          </SectionCard>

          <SectionCard title="Spoilers" eyebrow="Visibility">
            <Pressable
              onPress={() => setIsSpoiler((currentValue) => !currentValue)}
              style={[styles.typeButton, isSpoiler ? styles.typeButtonActive : null]}
            >
              <Text style={[styles.typeButtonText, isSpoiler ? styles.typeButtonTextActive : null]}>
                {isSpoiler ? "Spoiler post" : "No spoilers"}
              </Text>
            </Pressable>
            {isSpoiler ? (
              <TextInput
                onChangeText={setSpoilerTag}
                onFocus={scrollToComposer}
                placeholder="Optional spoiler label, like Campaign ending"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={spoilerTag}
              />
            ) : null}
          </SectionCard>
        </ScrollView>

        <View
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
          style={[
            styles.actions,
            {
              paddingBottom: footerPaddingBottom,
            },
          ]}
        >
          <Pressable
            onPress={() =>
              goBackOrFallback(router, selectedGame ? `/game/${selectedGame.id}` : "/(tabs)")
            }
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>

          <Pressable
            disabled={isSubmitting || !selectedGame}
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.buttonPressed : null,
              isSubmitting || !selectedGame ? styles.buttonDisabled : null,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={theme.colors.background} />
            ) : (
              <Text style={styles.primaryButtonText}>{isEditing ? "Save changes" : "Publish post"}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
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
  helperText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  gamePickerBlock: {
    gap: theme.spacing.sm,
  },
  selectedGameCard: {
    gap: theme.spacing.xs,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
  },
  selectedGameLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
    textTransform: "uppercase",
  },
  selectedGameTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  inlineLinkButton: {
    alignSelf: "flex-start",
    paddingVertical: theme.spacing.xs,
  },
  inlineLinkText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  searchResults: {
    maxHeight: 300,
  },
  searchResultsContent: {
    gap: theme.spacing.sm,
  },
  searchResultCard: {
    alignItems: "center",
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    flexDirection: "row",
    gap: theme.spacing.md,
    padding: theme.spacing.sm,
  },
  searchResultCardActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  searchResultMedia: {
    flexShrink: 0,
  },
  searchResultCover: {
    width: 52,
    height: 70,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.card,
  },
  searchResultCoverFallback: {
    alignItems: "center",
    backgroundColor: theme.colors.cardElevated ?? theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borders.width,
    height: 70,
    justifyContent: "center",
    width: 52,
  },
  searchResultCoverFallbackText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },
  searchResultText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  searchResultTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  searchResultTitleActive: {
    color: theme.colors.background,
  },
  searchResultMeta: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
  },
  searchResultMetaActive: {
    color: theme.colors.background,
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.md,
  },
  typeButton: {
    minWidth: 120,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.md,
  },
  typeButtonActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  typeButtonDisabled: {
    opacity: 0.7,
  },
  typeButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  typeButtonTextActive: {
    color: theme.colors.background,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  bodyInput: {
    minHeight: 150,
  },
  dismissKeyboardButton: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,229,255,0.12)",
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  dismissKeyboardButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  imageCard: {
    gap: theme.spacing.md,
  },
  imagePreviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  imagePreviewTile: {
    width: "48%",
  },
  imagePreview: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  imageActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  clipPreviewCard: {
    gap: theme.spacing.xs,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    padding: theme.spacing.md,
  },
  clipPreviewTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  mediaButton: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,229,255,0.12)",
    borderColor: "rgba(0,229,255,0.32)",
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  mediaButtonDanger: {
    backgroundColor: "rgba(255,138,138,0.12)",
    borderColor: "rgba(255,138,138,0.32)",
  },
  mediaButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  mediaButtonDangerText: {
    color: "#ff8a8a",
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  ratingSection: {
    gap: theme.spacing.sm,
  },
  ratingLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  ratingWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  ratingChip: {
    minWidth: 54,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  ratingChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  ratingChipText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  ratingChipTextActive: {
    color: theme.colors.background,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.md,
    paddingHorizontal: theme.layout.screenPadding,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.background,
    borderTopColor: theme.colors.border,
    borderTopWidth: theme.borders.width,
  },
  secondaryButton: {
    flex: 1,
    alignItems: "center",
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.lg,
  },
  secondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  primaryButton: {
    flex: 1,
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
  buttonPressed: {
    opacity: 0.92,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loadingCenter: {
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.layout.screenPadding,
  },
});
