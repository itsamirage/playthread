import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { theme } from "../lib/theme";

export default function CoinGiftSheet({
  visible,
  targetLabel,
  onClose,
  onSubmit,
  isSubmitting = false,
}) {
  const [amount, setAmount] = useState("25");
  const [note, setNote] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);

  useEffect(() => {
    if (!visible) {
      setAmount("25");
      setNote("");
      setIsAnonymous(false);
    }
  }, [visible]);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalBackdrop}
      >
        <View style={styles.modalCard}>
          <Text style={styles.eyebrow}>Gift coins</Text>
          <Text style={styles.title}>Send coins to {targetLabel}</Text>
          <TextInput
            keyboardType="number-pad"
            onChangeText={setAmount}
            placeholder="Amount"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={amount}
          />
          <TextInput
            onChangeText={setNote}
            placeholder="Optional note"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={note}
          />
          <View style={styles.toggleRow}>
            <Pressable
              onPress={() => setIsAnonymous(false)}
              style={[styles.toggleChip, !isAnonymous ? styles.toggleChipActive : null]}
            >
              <Text style={[styles.toggleChipText, !isAnonymous ? styles.toggleChipTextActive : null]}>
                Show my name
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setIsAnonymous(true)}
              style={[styles.toggleChip, isAnonymous ? styles.toggleChipActive : null]}
            >
              <Text style={[styles.toggleChipText, isAnonymous ? styles.toggleChipTextActive : null]}>
                Anonymous
              </Text>
            </Pressable>
          </View>
          <View style={styles.buttonRow}>
            <Pressable onPress={onClose} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={isSubmitting}
              onPress={() =>
                onSubmit?.({
                  amount: Number(amount),
                  note,
                  isAnonymous,
                })
              }
              style={[styles.primaryButton, isSubmitting ? styles.buttonDisabled : null]}
            >
              <Text style={styles.primaryButtonText}>{isSubmitting ? "Sending..." : "Send gift"}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: theme.spacing.md,
  },
  modalCard: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: theme.borders.width,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
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
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },
  input: {
    color: theme.colors.textPrimary,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: theme.fontSizes.md,
  },
  toggleRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  toggleChip: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: theme.borders.width,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  toggleChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  toggleChipText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },
  toggleChipTextActive: {
    color: theme.colors.background,
    fontWeight: theme.fontWeights.bold,
  },
  buttonRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  primaryButton: {
    flex: 1,
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
  },
  secondaryButton: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    paddingVertical: theme.spacing.md,
  },
  primaryButtonText: {
    color: theme.colors.background,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  secondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
