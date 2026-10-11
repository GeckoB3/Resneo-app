import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Small pieces the switch screens share: a tick box with a title and a line under it (the
 * landing's extras, the seller's acknowledgement, "We'll still honour these"), a quiet text link,
 * and a line with a tick in front ("Stripe is connected.").
 */

export const SWITCH_ICONS = {
  checkout: { ios: 'creditcard.fill', android: 'point_of_sale', web: 'point_of_sale' },
  pause: { ios: 'pause.circle.fill', android: 'pause_circle', web: 'pause_circle' },
  tick: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  pos_gift_vouchers_enabled: { ios: 'gift', android: 'redeem', web: 'redeem' },
  pos_loyalty_enabled: { ios: 'star', android: 'loyalty', web: 'loyalty' },
  pos_online_shop_enabled: { ios: 'bag', android: 'storefront', web: 'storefront' },
} as const satisfies Record<string, SymbolViewProps['name']>;

/** A tick box row: a bold title (or a sentence) and an optional line under it. */
export function TickRow({
  title,
  detail,
  checked,
  onChange,
  disabled = false,
  plain = false,
}: {
  title: string;
  detail?: string | null;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** A whole sentence (the acknowledgements) rather than a bold name. */
  plain?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      style={({ pressed }) => [
        styles.tickRow,
        {
          borderColor: checked ? colors.brand : colors.border,
          backgroundColor: checked ? colors.brandSubtle : colors.surfaceRaised,
          opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
        },
      ]}>
      <View
        style={[
          styles.box,
          { borderColor: checked ? colors.brand : colors.borderStrong, backgroundColor: checked ? colors.brand : 'transparent' },
        ]}>
        {checked ? <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} tintColor={colors.onBrand} size={14} /> : null}
      </View>
      <View style={styles.flex}>
        <Text variant={plain ? 'bodySmall' : 'bodyMedium'}>{title}</Text>
        {detail ? (
          <Text variant="caption" tone="muted">
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** A quiet text link ("Open sale 12", "Switch off Checkout"). */
export function TextLink({
  label,
  onPress,
  tone = 'brand',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone?: 'brand' | 'danger';
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.6 : 1 })}>
      <Text variant="label" tone={tone}>
        {label}
      </Text>
    </Pressable>
  );
}

/** "Stripe is connected." with a tick in front. */
export function TickLine({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.tickLine}>
      <SymbolView name={SWITCH_ICONS.tick} tintColor={colors.success} size={18} />
      <Text variant="bodySmall" style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

/** The Checkout glyph in a navy rounded square (A1, C2). */
export function CheckoutGlyph({ size = 48 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.glyph, { width: size, height: size, backgroundColor: colors.brand }]}>
      <SymbolView name={SWITCH_ICONS.checkout} tintColor="#FFFFFF" size={Math.round(size * 0.48)} />
    </View>
  );
}

const styles = StyleSheet.create({
  tickRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  flex: { flex: 1, minWidth: 0, gap: spacing.xxs },
  tickLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  glyph: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
