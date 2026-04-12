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
import { useFollows } from "../lib/follows";
import { describeIntegrityError } from "../lib/integrity";
import { pickPostImage } from "../lib/postMedia";
import { createPost } from "../lib/posts";
import { theme } from "../lib/theme";

const postTypes = ["discussion", "review", "guide", "tip"];
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
  const [selectedGameId, setSelectedGameId] = useState(
    !Number.isNaN(initialGameId) && initialGameId > 0 ? initialGameId : followedGames[0]?.id ?? null
  );
  const [postType, setPostType] = useState("discussion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rating, setRating] = useState("8");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [spoilerTag, setSpoilerTag] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);

  useEffect(() => {
    if (!Number.isNaN(initialGameId) && initialGameId > 0) {
      setSelectedGameId(initialGameId);
      return;
    }

    if (!selectedGameId && followedGames[0]?.id) {
      setSelectedGameId(followedGames[0].id);
    }
  }, [followedGames, initialGameId, selectedGameId]);

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

  const selectedGame = useMemo(
    () => followedGames.find((game) => game.id === selectedGameId) ?? null,
    [followedGames, selectedGameId]
  );

  const handleSubmit = async () => {
    Keyboard.dismiss();

    if (!session?.user?.id) {
      Alert.alert("Sign in required", "You need to be logged in to create a post.");
      return;
    }

    if (!selectedGame) {
      Alert.alert("Pick a game", "Choose one of your followed games first.");
      return;
    }

    if (!body.trim()) {
      Alert.alert("Write something", "Add some text before posting.");
      return;
    }

    try {
      setIsSubmitting(true);

      const { error, moderation } = await createPost({
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
        imageAsset: selectedImage,
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

      router.replace("/(tabs)");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePickImage = async () => {
    try {
      const asset = await pickPostImage();

      if (asset) {
        setSelectedImage(asset);
      }
    } catch (error) {
      Alert.alert(
        "Image not added",
        error instanceof Error ? error.message : "Could not pick that image.",
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      style={styles.screen}
    >
      <View style={styles.screen}>
        <ScrollView
          ref={scrollViewRef}
          automaticallyAdjustKeyboardInsets
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
            <Text style={styles.title}>Create post</Text>
            <Text style={styles.subtitle}>
              Start the first real thread for one of the games you follow.
            </Text>
          </View>

          <SectionCard title="Game" eyebrow="Choose a title">
            {followedGames.length > 0 ? (
              <View style={styles.chipWrap}>
                {followedGames.map((game) => {
                  const isActive = game.id === selectedGameId;

                  return (
                    <Pressable
                      key={game.id}
                      onPress={() => setSelectedGameId(game.id)}
                      style={[styles.chip, isActive ? styles.chipActive : null]}
                    >
                      <Text style={[styles.chipText, isActive ? styles.chipTextActive : null]}>
                        {game.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.helperText}>
                Follow a game first in Browse before creating a post.
              </Text>
            )}
          </SectionCard>

          <SectionCard title="Post type" eyebrow="Thread style">
            <View style={styles.typeRow}>
              {postTypes.map((type) => {
                const isActive = type === postType;

                return (
                  <Pressable
                    key={type}
                    onPress={() => setPostType(type)}
                    style={[styles.typeButton, isActive ? styles.typeButtonActive : null]}
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
                            : "Tip"}
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
          </SectionCard>

          <SectionCard title="Image" eyebrow="Optional media">
            <Text style={styles.helperText}>
              Attach a JPG, PNG, WebP, or GIF up to 5 MB. This first pass supports image uploads only.
            </Text>
            {selectedImage?.uri ? (
              <View style={styles.imageCard}>
                <Image source={{ uri: selectedImage.uri }} style={styles.imagePreview} />
                <View style={styles.imageActions}>
                  <Pressable
                    onPress={handlePickImage}
                    style={({ pressed }) => [
                      styles.mediaButton,
                      pressed ? styles.buttonPressed : null,
                    ]}
                  >
                    <Text style={styles.mediaButtonText}>Replace image</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSelectedImage(null)}
                    style={({ pressed }) => [
                      styles.mediaButton,
                      styles.mediaButtonDanger,
                      pressed ? styles.buttonPressed : null,
                    ]}
                  >
                    <Text style={styles.mediaButtonDangerText}>Remove image</Text>
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
                <Text style={styles.mediaButtonText}>Choose image</Text>
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
          <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>

          <Pressable
            disabled={isSubmitting || followedGames.length === 0}
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.buttonPressed : null,
              isSubmitting || followedGames.length === 0 ? styles.buttonDisabled : null,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={theme.colors.background} />
            ) : (
              <Text style={styles.primaryButtonText}>Publish post</Text>
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
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  chip: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  chipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  chipText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  chipTextActive: {
    color: theme.colors.background,
    fontWeight: theme.fontWeights.bold,
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
  imagePreview: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  imageActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
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
});
