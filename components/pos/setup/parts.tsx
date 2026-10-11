import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Small pieces the set-up screens share: a choice as a card with a radio (one of several), a
 * section with its title, a status line with a tick, a warning or a spinner, and the progress bar
 * the frame and the set-up card draw. Tick boxes are the switch screens' `TickRow`.
 */

export const SETUP_ICONS = {
  tick: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  warn: { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  cards: { ios: 'wave.3.right.circle', android: 'contactless', web: 'contactless' },
  tips: { ios: 'heart', android: 'favorite', web: 'favorite' },
  details: { ios: 'doc.text', android: 'receipt_long', web: 'receipt_long' },
  team: { ios: 'person.2', android: 'group', web: 'group' },
  products: { ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' },
  vouchers: { ios: 'gift', android: 'redeem', web: 'redeem' },
  loyalty: { ios: 'star', android: 'loyalty', web: 'loyalty' },
  shop: { ios: 'bag', android: 'storefront', web: 'storefront' },
  practice: { ios: 'creditcard', android: 'point_of_sale', web: 'point_of_sale' },
} as const satisfies Record<string, SymbolViewProps['name']>;

/** One choice of several: a card with a radio, a bold title and a line under it. */
export function ChoiceCard({
  title,
  note,
  selected,
  onPress,
  disabled = false,
}: {
  title: string;
  note?: string | null;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={note ? `${title}. ${note}` : title}
      style={({ pressed }) => [
        styles.choice,
        {
          borderColor: selected ? colors.brand : colors.border,
          backgroundColor: selected ? colors.brandSubtle : colors.surfaceRaised,
          opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
        },
      ]}>
      <View style={[styles.radio, { borderColor: selected ? colors.brand : colors.borderStrong }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: colors.brand }]} /> : null}
      </View>
      <View style={styles.flex}>
        <Text variant="bodyMedium">{title}</Text>
        {note ? (
          <Text variant="caption" tone="muted">
            {note}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** A group of choices with a question above it. */
export function ChoiceGroup({ label, children }: { label?: string | null; children: ReactNode }) {
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={label ?? undefined}>
      {label ? <Text variant="label">{label}</Text> : null}
      {children}
    </View>
  );
}

/** A titled block inside a screen ("Get your phone ready"). */
export function SetupSection({
  title,
  help,
  children,
}: {
  title?: string | null;
  help?: string | null;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
      {title ? (
        <Text variant="subheading" accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {help ? (
        <Text variant="bodySmall" tone="secondary">
          {help}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/** A line with a tick (done), a warning (needs doing) or a spinner (waiting) in front. */
export function StatusLine({ tone, children }: { tone: 'done' | 'warn' | 'wait' | 'info'; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.statusLine}>
      {tone === 'wait' ? (
        <ActivityIndicator size="small" color={colors.textMuted} />
      ) : (
        <SymbolView
          name={tone === 'done' ? SETUP_ICONS.tick : tone === 'warn' ? SETUP_ICONS.warn : SETUP_ICONS.info}
          tintColor={tone === 'done' ? colors.success : tone === 'warn' ? colors.warning : colors.info}
          size={18}
        />
      )}
      <Text variant="bodySmall" tone={tone === 'wait' ? 'muted' : 'default'} style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

/** A thin bar filled to `done` of `total`. */
export function ProgressBar({ done, total, label }: { done: number; total: number; label?: string }) {
  const { colors } = useTheme();
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
  return (
    <View
      style={[styles.track, { backgroundColor: colors.surfaceSunken }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: total, now: done }}>
      <View style={[styles.fill, { width: `${pct}%` as `${number}%`, backgroundColor: colors.accent }]} />
    </View>
  );
}

/** A numbered instruction ("1. Plug the reader in ..."). */
export function NumberedStep({ n, children }: { n: number; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.numbered}>
      <View style={[styles.number, { backgroundColor: colors.brandSubtle }]}>
        <Text variant="caption" tone="brand">
          {n}
        </Text>
      </View>
      <Text variant="bodySmall" style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

export const setupStyles = StyleSheet.create({
  stack: { gap: spacing.md },
  tight: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  buttons: { gap: spacing.sm, paddingTop: spacing.sm },
});

const styles = StyleSheet.create({
  choice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 44,
  },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioDot: { width: 11, height: 11, borderRadius: 6 },
  flex: { flex: 1, minWidth: 0, gap: spacing.xxs },
  group: { gap: spacing.sm },
  section: { gap: spacing.md, borderWidth: 1, borderRadius: radius.card, padding: spacing.base },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  numbered: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  number: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
