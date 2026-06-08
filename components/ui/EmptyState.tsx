import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { spacing, typography } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type EmptyStateProps = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.centered}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  title: {
    ...typography.heading,
    textAlign: 'center',
  },
  message: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
});
