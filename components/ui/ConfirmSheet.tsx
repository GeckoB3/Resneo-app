import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';

type ConfirmSheetProps = {
  visible: boolean;
  /** Heading, e.g. "Sign out?" or "Delete booking?". */
  title: string;
  /** Optional supporting line under the title. */
  message?: string;
  /** Label for the confirming (destructive) action. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the dismiss action. Defaults to "Cancel". */
  cancelLabel?: string;
  /**
   * Visual weight of the confirm button. Most confirms here are destructive
   * (sign-out, delete) so this defaults to the red `danger` variant.
   */
  destructive?: boolean;
  /** Show a spinner + disable the buttons while the action runs. */
  loading?: boolean;
  /** Called when the user confirms. */
  onConfirm: () => void;
  /** Called on Cancel, scrim tap, drag-dismiss or back press. */
  onClose: () => void;
};

/**
 * Reusable confirm dialog — the standard "title + body + Cancel / Confirm"
 * destructive-confirm pattern in a bottom `Sheet` (not `Alert.alert`, which is a
 * no-op on web). Extracted so the app's confirm idioms can converge on one
 * primitive instead of each screen hand-rolling the same sheet.
 */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  loading = false,
  onConfirm,
  onClose,
}: ConfirmSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.body}>
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
            onPress={onClose}
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
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
});
