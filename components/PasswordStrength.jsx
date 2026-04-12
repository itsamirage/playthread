import { StyleSheet, Text, View } from "react-native";

import { getPasswordChecks } from "../lib/auth";
import { theme } from "../lib/theme";

export default function PasswordStrength({ password }) {
  const checks = getPasswordChecks(password);

  return (
    <View style={styles.container}>
      <PasswordRule label="At least 8 characters" passed={checks.length} />
      <PasswordRule label="One uppercase letter" passed={checks.uppercase} />
      <PasswordRule label="One number" passed={checks.number} />
      <PasswordRule label="One special character" passed={checks.special} />
    </View>
  );
}

function PasswordRule({ label, passed }) {
  return (
    <Text style={[styles.ruleText, passed ? styles.rulePassed : null]}>
      {passed ? "OK " : "NO "} {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: theme.borders.width,
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
  },
  ruleText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
  },
  rulePassed: {
    color: theme.colors.scoreExcellent,
  },
});
