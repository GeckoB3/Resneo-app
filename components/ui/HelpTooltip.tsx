import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';

type HelpTooltipProps = {
  /** Heading shown in the popover. */
  title: string;
  /** Body content — a string, or rich nodes for multi-paragraph help. */
  children: ReactNode;
  /** Accessibility label for the trigger button (defaults to "Help: {title}"). */
  accessibilityLabel?: string;
  /** Trigger glyph size (default 18). */
  iconSize?: number;
};

/**
 * HelpTooltip — an info button that reveals contextual help in a small bottom
 * `Sheet` (mobile-appropriate "popover"). Tapping the (i) opens the sheet; the
 * scrim, drag-down, or Close dismisses it. The underlying `Sheet` already honours
 * the OS "Reduce Motion" setting (it fades instead of sliding), so the disclosure
 * respects reduceMotion without any extra wiring here.
 *
 * SF Symbol uses the required {ios, android, web} object form (project memory).
 */
export function HelpTooltip({
  title,
  children,
  accessibilityLabel,
  iconSize = 18,
}: HelpTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton
        icon={{ ios: 'info.circle', android: 'info', web: 'info' }}
        iconSize={iconSize}
        accessibilityLabel={accessibilityLabel ?? `Help: ${title}`}
        onPress={() => setOpen(true)}
      />
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <View style={styles.header}>
          <Text variant="subheading">{title}</Text>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}>
          {typeof children === 'string' ? (
            <Text variant="bodySmall" tone="secondary">
              {children}
            </Text>
          ) : (
            children
          )}
        </ScrollView>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: spacing.xs,
  },
  scroll: {
    maxHeight: 320,
  },
  body: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
});
