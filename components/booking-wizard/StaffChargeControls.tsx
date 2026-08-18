/**
 * The two staff money controls, shared by every appointment create surface.
 *
 * Staff are always allowed to take a booking without collecting anything: they
 * take payment at the counter, on account, or not at all, and that is a
 * per-booking call. So the charge control is an opt-IN, unchecked by default,
 * and the card hold is an opt-OUT, on by default — the same two defaults the
 * server applies to an omitted field (`resolveStaffVisitChargeDiscretion`:
 * `require_deposit ?? false`, `require_card_hold ?? true`).
 *
 * Extracted because a third caller needed them. A single booking can only ever
 * carry ONE of the two, so the confirm step used to render whichever applied
 * inline; a multi-service visit or a group can carry both at once (one segment
 * takes a deposit, another takes a hold), and "the two are never shown
 * together" (spec §7.6) would then leave one of them with no control at all.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import {
  STAFF_CARD_HOLD_TOGGLE_LABEL,
  STAFF_CARD_HOLD_TOGGLE_SUBLABEL,
  staffCardHoldFeeLine,
} from '@/lib/booking/card-hold';
import { formatPence } from '@/lib/format';
import { hapticSelect } from '@/lib/haptics';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const formatMoney = (pence: number): string => formatPence(pence) ?? '—';

/** Shared shell: the bordered row, the tick box and the two label lines. */
function CheckRow({
  checked,
  onToggle,
  accessibilityLabel,
  title,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
  title: string;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        hapticSelect();
        onToggle();
      }}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: checked ? colors.surfaceRaised : colors.surface,
          borderColor: checked ? colors.brand : colors.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}>
      <View
        style={[
          styles.check,
          {
            borderColor: checked ? colors.brand : colors.borderStrong,
            backgroundColor: checked ? colors.brand : 'transparent',
          },
        ]}>
        {checked ? <Text style={[styles.checkMark, { color: colors.onBrand }]}>✓</Text> : null}
      </View>
      <View style={styles.label}>
        <Text variant="bodyMedium">{title}</Text>
        {children}
      </View>
    </Pressable>
  );
}

/**
 * "Require deposit" / "Require payment" — the opt-in for taking money now.
 *
 * `chargeLabel` decides the noun: a `full_payment` service holds its amount in
 * `price_pence`, and calling that a deposit misdescribes it. Never rendered for
 * a walk-in: spec 2.8 says walk-ins never collect, so there is no decision to
 * offer and the caller omits the field entirely rather than sending false.
 */
export function StaffRequireChargeCheckbox({
  checked,
  onChange,
  chargeLabel,
  amountPence,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  chargeLabel: 'deposit' | 'full_payment';
  amountPence: number;
}) {
  const noun = chargeLabel === 'full_payment' ? 'payment' : 'deposit';
  const amount = amountPence > 0 ? formatMoney(amountPence) : null;
  return (
    <CheckRow
      checked={checked}
      onToggle={() => onChange(!checked)}
      accessibilityLabel={`Require ${noun}${amount ? ` ${amount}` : ''}`}
      title={`Require ${noun}${amount ? ` (${amount})` : ''}`}>
      <Text variant="caption" tone="muted">
        {checked
          ? `We will send a payment link and hold the booking until the ${noun} is paid.`
          : `Leave unchecked to confirm now and take the ${noun} in person.`}
      </Text>
    </CheckRow>
  );
}

/**
 * "Card hold" — the opt-out for authorising a no-show fee (§7.6/D6).
 *
 * Default on, and offered on walk-ins too: unlike a deposit, a hold takes no
 * money at booking, so there is nothing for staff to collect at the counter
 * instead.
 */
export function StaffCardHoldToggle({
  checked,
  onChange,
  feePence,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  feePence: number;
}) {
  return (
    <CheckRow
      checked={checked}
      onToggle={() => onChange(!checked)}
      accessibilityLabel={`${STAFF_CARD_HOLD_TOGGLE_LABEL}. ${STAFF_CARD_HOLD_TOGGLE_SUBLABEL}`}
      title={STAFF_CARD_HOLD_TOGGLE_LABEL}>
      <Text variant="caption" tone="muted">
        {STAFF_CARD_HOLD_TOGGLE_SUBLABEL}
      </Text>
      {checked ? (
        <Text variant="caption" tone="muted">
          {staffCardHoldFeeLine(feePence)}
        </Text>
      ) : null}
    </CheckRow>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  label: {
    flex: 1,
    minWidth: 0,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    fontSize: 13,
    fontFamily: fonts.bold,
    lineHeight: 16,
  },
});
