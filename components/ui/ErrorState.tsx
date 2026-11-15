import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';

type ErrorStateProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
  /** The retry button's words, when a feature keeps its own copy table. */
  retryLabel?: string;
};

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
}: ErrorStateProps) {
  return (
    <View style={styles.centered}>
      <Text variant="heading" style={styles.center}>
        {title}
      </Text>
      <Text variant="bodySmall" tone="secondary" style={styles.center}>
        {message}
      </Text>
      {onRetry ? <Button label={retryLabel} onPress={onRetry} variant="secondary" /> : null}
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
  center: {
    textAlign: 'center',
  },
});
