import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { money, usePosT } from '@/components/pos/parts';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { TAP_TO_PAY_SYMBOL } from '@/lib/payments/tap-to-pay-copy';
import { brand, fonts, minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * The payment sheet's choice of methods (Part 2 mock-up 1, approved 2026-10-11): the amount due as
 * a headline, the everyday methods as large tiles with icons, card methods in navy and first, a
 * card tile that says when this phone can't take cards and what to do instead, the venue's own
 * payment types folded under "Other ways", and the 2, 3 or 4 ways control of an even split. Only
 * the drawing lives here; which tiles show, and what each does, stays in `PaySheet`.
 */

type Icon = SymbolViewProps['name'];

/** SF Symbols on iOS, Material Symbols on Android (the app's icon approach, `expo-symbols`). */
export const PAY_ICONS = {
  /** The card on this phone: Apple's Tap to Pay symbol, the only one it allows on that button. */
  tapToPay: TAP_TO_PAY_SYMBOL,
  reader: { ios: 'creditcard', android: 'point_of_sale', web: 'point_of_sale' },
  notHere: { ios: 'iphone.slash', android: 'mobile_off', web: 'mobile_off' },
  cash: { ios: 'banknote', android: 'payments', web: 'payments' },
  link: { ios: 'qrcode', android: 'qr_code_2', web: 'qr_code_2' },
  voucher: { ios: 'gift', android: 'redeem', web: 'redeem' },
  credit: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' },
  savedCard: { ios: 'creditcard', android: 'credit_card', web: 'credit_card' },
  other: { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' },
} as const satisfies Record<string, Icon>;

const CHEVRON_DOWN: Icon = { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' };
const CHEVRON_UP: Icon = { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' };
const CHEVRON_RIGHT: Icon = { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' };

/** "£49.95 to pay": the amount large, in the words the sale bar already uses (`sale.bar.balance`). */
export function DueHeadline({ balancePence }: { balancePence: number }) {
  const t = usePosT();
  const { colors } = useTheme();
  const amount = money(balancePence);
  const sentence = t('sale.bar.balance', { balance: amount });
  const at = sentence.indexOf(amount);
  return (
    <Text variant="heading" color={colors.textSecondary} style={styles.dueRest}>
      {at > 0 ? sentence.slice(0, at) : ''}
      <Text variant="display" style={styles.dueAmount}>
        {amount}
      </Text>
      {at >= 0 ? sentence.slice(at + amount.length) : ''}
    </Text>
  );
}

/** A link-style toggle ("Pay part of it", "Pay all of it"). */
export function PayLink({ label, onPress, expanded }: { label: string; onPress: () => void; expanded?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}>
      <Text variant="label" color={colors.brand} style={styles.linkText}>
        {label}
      </Text>
      {expanded === false ? <SymbolView name={CHEVRON_DOWN} size={16} tintColor={colors.brand} /> : null}
    </Pressable>
  );
}

/** Two tiles to a row; a lone last tile keeps its half width. */
export function PayTileGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

function TileIcon({ icon, tone }: { icon: Icon; tone: 'primary' | 'default' | 'off' }) {
  const { colors, isDark } = useTheme();
  const background =
    tone === 'primary' ? (isDark ? 'rgba(4,16,31,0.16)' : 'rgba(255,255,255,0.14)') : tone === 'off' ? colors.border : colors.brandSubtle;
  const tint = tone === 'primary' ? colors.onBrand : tone === 'off' ? colors.textMuted : colors.brand;
  return (
    <View style={[styles.iconBox, styles.tileIconBox, { backgroundColor: background }]}>
      <SymbolView name={icon} size={22} tintColor={tint} />
    </View>
  );
}

/**
 * One method: an icon, its name and a line saying what happens. `primary` is navy (the card
 * methods). Disabled while the amount can't be taken, as the buttons were.
 */
export function PayTile({
  icon,
  title,
  detail,
  note,
  label,
  primary = false,
  disabled = false,
  onPress,
}: {
  icon: Icon;
  title: string;
  detail?: string | null;
  /** A smaller third line (a saved card's consent). */
  note?: string | null;
  /** What a screen reader says, when the title alone can't tell two tiles apart. */
  label?: string;
  primary?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors, isDark } = useTheme();
  const detailColor = primary ? (isDark ? 'rgba(4,16,31,0.75)' : brand[100]) : colors.textMuted;
  return (
    <Pressable
      onPress={() => {
        hapticSelect();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label ?? title}
      accessibilityHint={[detail, note].filter(Boolean).join('. ') || undefined}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.tile,
        primary
          ? { backgroundColor: colors.brand, borderColor: colors.brand }
          : { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong },
        { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}>
      <TileIcon icon={icon} tone={primary ? 'primary' : 'default'} />
      <Text variant="bodyMedium" color={primary ? colors.onBrand : colors.text} style={styles.tileTitle}>
        {title}
      </Text>
      {detail ? (
        <Text variant="caption" color={detailColor} style={styles.tileDetail}>
          {detail}
        </Text>
      ) : null}
      {note ? (
        <Text variant="caption" color={detailColor} style={styles.tileNote}>
          {note}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * The card tile on a phone that can't take cards (Expo Go, no Terminal SDK, no Stripe key): it says
 * so inside itself and what to do instead, where a footnote used to sit under the buttons.
 */
export function PayTileUnavailable({ title, flag, detail }: { title: string; flag: string; detail: string }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${flag}. ${detail}`}
      style={[styles.tile, styles.tileOff, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}>
      <View style={styles.offTop}>
        <TileIcon icon={PAY_ICONS.notHere} tone="off" />
        <View
          style={[
            styles.flag,
            isDark
              ? { backgroundColor: colors.warningSurface, borderColor: colors.warning }
              : { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
          ]}>
          <Text variant="caption" color={isDark ? colors.warning : '#92400E'} style={styles.flagText} numberOfLines={2}>
            {flag}
          </Text>
        </View>
      </View>
      <Text variant="bodyMedium" color={colors.textSecondary} style={styles.tileTitle}>
        {title}
      </Text>
      <Text variant="caption" tone="muted" style={styles.tileDetail}>
        {detail}
      </Text>
    </View>
  );
}

/**
 * "Other ways": the venue's own payment types (bank transfer, another card machine, paper vouchers)
 * folded into one row that lists them, one tap from the choice.
 */
export function OtherWays({
  types,
  disabled,
  onChoose,
}: {
  types: { id: string; name: string }[];
  disabled: boolean;
  onChoose: (id: string) => void;
}) {
  const t = usePosT();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  if (types.length === 0) return null;
  const names = types.map((type) => type.name).join(', ');
  return (
    <View style={[styles.other, { borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised }]}>
      <Pressable
        onPress={() => {
          hapticSelect();
          setOpen((o) => !o);
        }}
        accessibilityRole="button"
        accessibilityLabel={t('app.pay.otherWays')}
        accessibilityHint={names}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.otherHead, { opacity: pressed ? 0.7 : 1 }]}>
        <View style={[styles.iconBox, { backgroundColor: colors.surface }]}>
          <SymbolView name={PAY_ICONS.other} size={22} tintColor={colors.textSecondary} />
        </View>
        <View style={styles.flex}>
          <Text variant="bodyMedium" style={styles.tileTitle}>
            {t('app.pay.otherWays')}
          </Text>
          {/* Once open, the names are the rows below. */}
          {open ? null : (
            <Text variant="caption" tone="muted" style={styles.tileDetail}>
              {names}
            </Text>
          )}
        </View>
        <SymbolView name={open ? CHEVRON_UP : CHEVRON_DOWN} size={18} tintColor={colors.textMuted} />
      </Pressable>
      {open
        ? types.map((type) => (
            <Pressable
              key={type.id}
              onPress={() => onChoose(type.id)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={type.name}
              accessibilityState={{ disabled }}
              style={({ pressed }) => [
                styles.otherRow,
                { borderTopColor: colors.border, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
              ]}>
              <Text variant="bodyMedium" style={styles.flex}>
                {type.name}
              </Text>
              <SymbolView name={CHEVRON_RIGHT} size={16} tintColor={colors.textMuted} />
            </Pressable>
          ))
        : null}
    </View>
  );
}

/** "2 ways", "3 ways", "4 ways": one at most chosen; none while an amount is typed by hand. */
export function SplitWays({ ways, value, onChange }: { ways: number[]; value: number | null; onChange: (ways: number) => void }) {
  const t = usePosT();
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={[styles.ways, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      {ways.map((w) => {
        const on = value === w;
        return (
          <Pressable
            key={w}
            onPress={() => {
              hapticSelect();
              onChange(w);
            }}
            accessibilityRole="radio"
            accessibilityLabel={t('app.pay.ways.a11y', { count: w })}
            accessibilityState={{ checked: on, selected: on }}
            hitSlop={{ top: 4, bottom: 4 }}
            style={[styles.way, on ? { backgroundColor: colors.brand } : null]}>
            <Text variant="label" color={on ? colors.onBrand : colors.textSecondary}>
              {t('app.pay.ways', { count: w })}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // One line box tall enough for the large amount, so "to pay" sits on its baseline.
  dueRest: { marginTop: spacing.xxs, lineHeight: 44 },
  dueAmount: { fontSize: 36, lineHeight: 42, letterSpacing: -0.8 },
  link: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.xs, paddingVertical: spacing.xs },
  linkText: { fontSize: 15, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  tile: {
    width: '48.5%',
    minHeight: 122,
    borderWidth: 1.5,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 13,
  },
  tileOff: { borderStyle: 'dashed' },
  iconBox: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  tileIconBox: { marginBottom: 10 },
  tileTitle: { fontFamily: fonts.bold, lineHeight: 20 },
  tileDetail: { fontSize: 13, lineHeight: 17, marginTop: spacing.xs },
  tileNote: { fontSize: 11, lineHeight: 15, marginTop: spacing.xs },
  offTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.xs },
  flag: { flexShrink: 1, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2, marginTop: 2 },
  flagText: { fontSize: 11, lineHeight: 14, fontFamily: fonts.bold },
  other: { borderWidth: 1.5, borderRadius: 18, overflow: 'hidden' },
  otherHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: 14, paddingVertical: 11 },
  otherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: minTouchTarget + 4,
    paddingHorizontal: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ways: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.md, padding: 3, gap: 3 },
  way: { flex: 1, minHeight: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs },
});
