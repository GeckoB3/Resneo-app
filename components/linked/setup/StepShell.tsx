import { ScrollView, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * The frame every setup wizard shares (web `Dialog` with `title`, `description`, a progress
 * strip and a `footer`): a tall sheet with a heading, "Step n of total", the thin progress bars,
 * a scrolling body and a fixed row of actions.
 */
export function StepShell({
  visible,
  onClose,
  title,
  step,
  total,
  error,
  notice,
  footer,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** 1-based; omit both to hide the progress strip (the receipt). */
  step?: number;
  total?: number;
  error?: string | null;
  notice?: string | null;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const showProgress = typeof step === 'number' && typeof total === 'number' && total > 0;
  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="92%" fill>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="subheading">{title}</Text>
          {showProgress ? (
            <Text variant="caption" tone="muted">
              {`Step ${step} of ${total}`}
            </Text>
          ) : null}
          {showProgress ? (
            <View style={styles.progress} accessibilityLabel={`Step ${step} of ${total}`}>
              {Array.from({ length: total }, (_, n) => (
                <View
                  key={n}
                  style={[styles.bar, { backgroundColor: n < step ? colors.brand : colors.border }]}
                />
              ))}
            </View>
          ) : null}
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {error ? (
            <View style={[styles.alert, { backgroundColor: colors.dangerSurface }]}>
              <Text variant="caption" tone="danger">
                {error}
              </Text>
            </View>
          ) : null}
          {notice ? (
            <Text variant="bodySmall" tone="secondary">
              {notice}
            </Text>
          ) : null}
          {children}
        </ScrollView>
        <View style={styles.footer}>{footer}</View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.md,
    // A `fill` sheet carries no side padding of its own.
    paddingHorizontal: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  progress: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  bar: {
    flex: 1,
    height: 4,
    borderRadius: radius.full,
  },
  scroll: {
    flex: 1,
  },
  body: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  alert: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
});
