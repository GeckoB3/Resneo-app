import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type ConfirmPanelProps = {
  /** Heading, e.g. "Save these hours anyway?". */
  title: string;
  /** Optional supporting line under the title. */
  message?: string;
  /** Label for the confirming action. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the dismiss action. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Visual weight of the confirm button; most in-sheet confirms are not destructive. */
  destructive?: boolean;
  /** Show a spinner + disable the buttons while the action runs. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The confirm dialog's body, drawn INLINE rather than as its own `Sheet`.
 *
 * For a question asked from inside an already-open Sheet. A `ConfirmSheet`
 * there is a second modal over the first, which iOS drops silently
 * (`ios-no-stacked-modals`): the hours editors asked "Save anyway?" that way
 * after a 409 and the staff member saw nothing happen and nothing saved. A
 * confirm that is a step of the sheet it belongs to cannot fail to present.
 */
export function ConfirmPanel({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmPanelProps) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.panel,
        { backgroundColor: colors.warningSurface, borderColor: colors.warning },
      ]}>
      <Text variant="subheading">{title}</Text>
      {message ? (
        <Text variant="bodySmall" tone="secondary">
          {message}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          label={cancelLabel}
          variant="secondary"
          style={styles.flex1}
          disabled={loading}
          onPress={onCancel}
        />
        <Button
          label={confirmLabel}
          variant={destructive ? 'danger' : 'primary'}
          style={styles.flex1}
          loading={loading}
          onPress={onConfirm}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
    padding: spacing.base,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  flex1: {
    flex: 1,
  },
});
