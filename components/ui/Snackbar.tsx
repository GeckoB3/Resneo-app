import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { elevation, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type SnackbarProps = {
  message: string | null;
  actionLabel?: string;
  onAction?: () => void;
  /** Lift above the FAB when both are on screen. */
  bottomOffset?: number;
};

/** Transient bottom notice with an optional action (e.g. Undo). */
export function Snackbar({ message, actionLabel, onAction, bottomOffset = 96 }: SnackbarProps) {
  const { colors } = useTheme();
  if (!message) return null;

  return (
    <View
      style={[
        styles.bar,
        elevation.raised,
        { backgroundColor: colors.text, bottom: bottomOffset, pointerEvents: 'box-none' },
      ]}>
      <Text variant="bodySmall" color={colors.background} numberOfLines={2} style={styles.message}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="accent" size="sm" onPress={onAction} haptic={false} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.base,
    right: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
  },
  message: {
    flex: 1,
    minWidth: 0,
  },
});
