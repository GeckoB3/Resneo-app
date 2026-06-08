import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { spacing, typography } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type ErrorStateProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
};

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: ErrorStateProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.centered}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
      {onRetry ? <Button label="Try again" onPress={onRetry} variant="secondary" /> : null}
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
  title: {
    ...typography.heading,
    textAlign: 'center',
  },
  message: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
});
