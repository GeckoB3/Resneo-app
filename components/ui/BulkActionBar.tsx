import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { elevation, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** Gap between the floating bar and the screen bottom (matches the FAB inset). */
const BAR_BOTTOM_GAP = spacing.base;

/**
 * Fallback vertical space the bar occupies above the tab bar, used to inset
 * lists on first paint before the bar has measured itself. The bar reports its
 * real height via `onHeightChange` — it grows when the actions wrap onto a
 * second row — so this only needs to cover the common single-row case.
 */
export const BULK_ACTION_BAR_CLEARANCE = 84;

type BulkActionBarProps = {
  /** Number of selected items (the bar renders only when > 0). */
  count: number;
  /** True when every item on the page is selected. */
  allSelected: boolean;
  /** Select-all when not all are selected, deselect-all otherwise. */
  onToggleSelectAll: () => void;
  /** Exit selection mode. */
  onClear: () => void;
  /**
   * Reports the total bottom inset (bar height + bottom gap) a list needs so its
   * last rows clear the floating bar. Fires whenever the bar resizes — notably
   * when the actions wrap onto a second row on a narrow screen.
   */
  onHeightChange?: (clearance: number) => void;
  /**
   * Domain action buttons (Tag, Message, …). Rendered in a flex-wrap row after
   * "Select all", so they wrap onto a second line instead of clipping or
   * scrolling out of view on a narrow screen.
   */
  children?: ReactNode;
};

/**
 * Shared bulk-selection action bar — a floating rounded card docked just above
 * the tab bar. It uses a FIXED bottom offset (like the FAB) so it clears the tab
 * bar without a redundant safe-area gap.
 *
 * The meta cluster (close + count) anchors the left; the action buttons take the
 * rest of the row and WRAP onto additional lines when they don't all fit, so
 * every action stays visible without horizontal scrolling on small devices.
 */
export function BulkActionBar({
  count,
  allSelected,
  onToggleSelectAll,
  onClear,
  onHeightChange,
  children,
}: BulkActionBarProps) {
  const { colors } = useTheme();
  if (count === 0) return null;

  function handleLayout(e: LayoutChangeEvent) {
    onHeightChange?.(Math.round(e.nativeEvent.layout.height) + BAR_BOTTOM_GAP + spacing.sm);
  }

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.bar,
        { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        elevation.raised,
      ]}>
      <View style={styles.meta}>
        <Pressable
          onPress={() => {
            hapticSelect();
            onClear();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear selection"
          style={({ pressed }) => [styles.clear, { opacity: pressed ? 0.6 : 1 }]}>
          <SymbolView
            name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
            tintColor={colors.textSecondary}
            size={20}
          />
        </Pressable>

        <Text variant="label" tone="secondary" numberOfLines={1} style={styles.count}>
          {count} selected
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          label={allSelected ? 'Deselect all' : 'Select all'}
          size="sm"
          variant="ghost"
          onPress={onToggleSelectAll}
        />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.base,
    right: spacing.base,
    bottom: BAR_BOTTOM_GAP,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: spacing.xs,
    columnGap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // Close + count never wrap or shrink — they anchor the bar's left edge.
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  clear: {
    padding: spacing.xs,
  },
  count: {
    fontVariant: ['tabular-nums'],
  },
  // Take the rest of the row; buttons wrap to a new line (right-aligned) rather
  // than scrolling when they don't all fit beside the count on one line.
  actions: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    rowGap: spacing.xs,
    columnGap: spacing.sm,
  },
});
