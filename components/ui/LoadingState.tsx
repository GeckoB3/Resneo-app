import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { spacing, typography } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type LoadingStateProps = {
  message?: string;
};

export function LoadingState({ message = 'Loading…' }: LoadingStateProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.centered} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={colors.brand} />
      <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.base,
    padding: spacing.xl,
  },
  message: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
});
