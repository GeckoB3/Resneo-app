import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';

type EmptyStateProps = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Optional centred glyph/illustration shown above the title (e.g. a SymbolView). */
  icon?: ReactNode;
};

export function EmptyState({ title, message, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <View style={styles.centered}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text variant="heading" style={styles.center}>
        {title}
      </Text>
      <Text variant="bodySmall" tone="secondary" style={styles.center}>
        {message}
      </Text>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
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
  icon: {
    marginBottom: spacing.xs,
    opacity: 0.9,
  },
  center: {
    textAlign: 'center',
  },
});
