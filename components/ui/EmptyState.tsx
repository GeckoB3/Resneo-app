import { isValidElement, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ILLUSTRATIONS, type IllustrationVariant } from '@/components/ui/illustrations';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';

/** Rendered size of the branded illustration (sits in the 96–140px sweet spot). */
const ILLUSTRATION_SIZE = 132;

type EmptyStateProps = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Optional centred glyph/illustration shown above the title (e.g. a SymbolView). */
  icon?: ReactNode;
  /**
   * Optional branded illustration shown above the title in place of the small
   * `icon`. Pass a named variant (e.g. `"bookings"`) or a ready illustration
   * element. When set it takes precedence over `icon`.
   */
  illustration?: IllustrationVariant | ReactNode;
};

/** Resolve the `illustration` prop (variant name OR element) to a node. */
function renderIllustration(illustration: IllustrationVariant | ReactNode): ReactNode {
  if (typeof illustration === 'string') {
    const Illustration = ILLUSTRATIONS[illustration as IllustrationVariant];
    return Illustration ? <Illustration size={ILLUSTRATION_SIZE} /> : null;
  }
  return isValidElement(illustration) ? illustration : null;
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  icon,
  illustration,
}: EmptyStateProps) {
  const illustrationNode = illustration != null ? renderIllustration(illustration) : null;

  return (
    <View style={styles.centered}>
      {illustrationNode ? (
        <View style={styles.illustration}>{illustrationNode}</View>
      ) : icon ? (
        <View style={styles.icon}>{icon}</View>
      ) : null}
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
  illustration: {
    marginBottom: spacing.sm,
    maxWidth: ILLUSTRATION_SIZE,
    maxHeight: ILLUSTRATION_SIZE,
  },
  center: {
    textAlign: 'center',
  },
});
