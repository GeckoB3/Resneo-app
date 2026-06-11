import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type LoadingStateProps = {
  message?: string;
};

export function LoadingState({ message = 'Loading…' }: LoadingStateProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.centered} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={colors.brand} />
      <Text variant="bodySmall" tone="secondary" style={styles.message}>
        {message}
      </Text>
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
    textAlign: 'center',
  },
});
