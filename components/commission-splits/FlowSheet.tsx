import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';

/**
 * The one sheet "Set up a split" and a calendar's buttons open. Its content changes from step to
 * step (whose takings, then a person's share or the proposal, and Back again), never the sheet
 * itself: swapping one `Sheet` for another in a single render loses the second on iOS. Tall, with a
 * scrolling body and the buttons pinned under it, as `PosSheet`.
 */
export function FlowSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <Sheet visible onClose={onClose} fill maxHeight="92%">
      {children}
    </Sheet>
  );
}

/** One step inside `FlowSheet`: its title and help, the scrolling body, and the pinned buttons. */
export function SheetStep({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle?: string | null;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <View style={styles.header}>
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <View style={styles.footer}>{footer}</View>
    </>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xs },
  scroll: { flex: 1 },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
});
