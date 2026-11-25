/**
 * The two staff money controls, shared by every appointment create surface.
 *
 * Staff are always allowed to take a booking without collecting anything: they
 * take payment at the counter, on account, or not at all, and that is a
 * per-booking call. "Require deposit" is an opt-in, unchecked by default. The
 * card line is not money taken: since card on file (web card-on-file-plan §6.2,
 * C2) its "Send a card request" switch is ON by default, and the form always
 * sends its value.
 *
 * Extracted because a third caller needed them. A single booking can only ever
 * carry ONE of the two, so the confirm step used to render whichever applied
 * inline; a multi-service visit or a group can carry both at once (one segment
 * takes a deposit, another takes a hold), and "the two are never shown
 * together" (spec §7.6) would then leave one of them with no control at all.
 */

import { Pressable, StyleSheet, Switch, View } from 'react-native';

import type { StaffCardRequestState, StaffFoundCard } from '@/components/booking-wizard/staff-card-request';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import {
  CARD_ADD_NOW_LABEL,
  STAFF_CANCEL_IF_NO_CARD_LABEL,
  STAFF_DONT_USE_CARD_LABEL,
  STAFF_SEND_CARD_REQUEST_LABEL,
  STAFF_USE_CARD_LABEL,
  staffCardFoundLine,
  staffCardNotPossibleLine,
  staffGroupCardFoundLine,
  staffSendCardRequestLine,
} from '@/lib/booking/card-hold';
import { formatPence } from '@/lib/format';
import { hapticSelect } from '@/lib/haptics';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const formatMoney = (pence: number): string => formatPence(pence) ?? 'Unknown';

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
  hasContact = true,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  chargeLabel: 'deposit' | 'full_payment';
  amountPence: number;
  /**
   * The client has an email or mobile the link can go to. Without one nothing is sent, so the line
   * says to share the link instead of promising to send it (QA round 25 Nov 2026).
   */
  hasContact?: boolean;
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
          ? hasContact
            ? `We will send a payment link and hold the booking until the ${noun} is paid.`
            : `This client has no email or mobile, so share the payment link yourself once it is booked. The booking is held until the ${noun} is paid.`
          : `Leave unchecked to confirm now and take the ${noun} in person.`}
      </Text>
    </CheckRow>
  );
}

/**
 * The card line on a staff booking form (web Docs/card-on-file-plan.md §6.2), for a booking whose
 * service asks for a card:
 * - a card on file found for the client: "Protected by card on file (Visa ending 4242). No-show
 *   fee up to £10." (a group: "Protected by {lead}'s card on file. It covers everyone in this
 *   booking."), with a small "Don't use the card for this booking" link;
 * - no card: the "Send a card request" switch, on by default (C2), with what each position means,
 *   and under it, when allowed, the unticked "Cancel if no card is added within 24 hours" (§4.9);
 *   "Add card now" beside it when the client already has a record;
 * - the business cannot take card payments: "Card not possible: ..." and nothing to choose.
 *
 * Controlled: the form holds the state and turns it into the create's fields with
 * `staffCardRequestFields`.
 */
export function StaffCardRequestControls({
  feePence,
  walkIn = false,
  value,
  onChange,
  foundCard = null,
  group = false,
  leadName = null,
  notPossible = false,
  businessName = null,
  tickAllowed,
  onAddCardNow,
  title,
}: {
  feePence: number | null;
  walkIn?: boolean;
  value: StaffCardRequestState;
  onChange: (next: StaffCardRequestState) => void;
  foundCard?: Pick<StaffFoundCard, 'brand' | 'last4'> | null;
  /** A group booking: the lead's card covers everyone. */
  group?: boolean;
  leadName?: string | null;
  notPossible?: boolean;
  businessName?: string | null;
  /** The tick may be offered (a phone booking whose client has an email or mobile). */
  tickAllowed: boolean;
  /** Opens the desk screen; omitted when the client has no record yet. */
  onAddCardNow?: () => void;
  /** A business's name above the line on a visit across businesses. */
  title?: string;
}) {
  const { colors } = useTheme();
  const box = [styles.box, { borderColor: colors.border, backgroundColor: colors.surface }];

  if (notPossible) {
    return (
      <View style={box} testID="staff-card-line">
        {title ? <Text variant="label">{title}</Text> : null}
        <Text variant="bodySmall" tone="muted">
          {staffCardNotPossibleLine(businessName)}
        </Text>
      </View>
    );
  }

  if (foundCard && !value.dontUseCard) {
    const fee = feePence != null && feePence > 0 ? `No-show fee up to ${formatMoney(feePence)}.` : null;
    return (
      <View style={box} testID="staff-card-line">
        {title ? <Text variant="label">{title}</Text> : null}
        <Text variant="bodyMedium" testID="staff-card-found-line">
          {group
            ? `${staffGroupCardFoundLine(leadName)}${fee ? ` ${fee}` : ''}`
            : staffCardFoundLine(foundCard.brand, foundCard.last4, feePence)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={STAFF_DONT_USE_CARD_LABEL}
          hitSlop={8}
          onPress={() => {
            hapticSelect();
            onChange({ ...value, dontUseCard: true });
          }}
          style={styles.link}>
          <Text variant="bodySmall" tone="brand">
            {STAFF_DONT_USE_CARD_LABEL}
          </Text>
        </Pressable>
      </View>
    );
  }

  const ticked = value.requestCard && tickAllowed && value.cancelIfNoCard;
  const line = staffSendCardRequestLine(value.requestCard, ticked, walkIn);
  return (
    <View style={styles.stack} testID="staff-card-line">
      {title ? <Text variant="label">{title}</Text> : null}
      <View style={[styles.row, { borderColor: value.requestCard ? colors.brand : colors.border, backgroundColor: colors.surface }]}>
        <View style={styles.label}>
          <Text variant="bodyMedium">{STAFF_SEND_CARD_REQUEST_LABEL}</Text>
          <Text variant="caption" tone="muted" testID="staff-card-request-line">
            {line}
          </Text>
        </View>
        <Switch
          value={value.requestCard}
          onValueChange={(next) => {
            hapticSelect();
            onChange({ ...value, requestCard: next, cancelIfNoCard: next ? value.cancelIfNoCard : false });
          }}
          accessibilityLabel={STAFF_SEND_CARD_REQUEST_LABEL}
          accessibilityHint={line}
          trackColor={{ true: colors.brand, false: colors.border }}
          thumbColor={colors.surfaceRaised}
          testID="staff-card-request-switch"
        />
      </View>
      {value.requestCard && tickAllowed ? (
        <CheckRow
          checked={value.cancelIfNoCard}
          onToggle={() => onChange({ ...value, cancelIfNoCard: !value.cancelIfNoCard })}
          accessibilityLabel={STAFF_CANCEL_IF_NO_CARD_LABEL}
          title={STAFF_CANCEL_IF_NO_CARD_LABEL}
        />
      ) : null}
      {foundCard && value.dontUseCard ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={STAFF_USE_CARD_LABEL}
          hitSlop={8}
          onPress={() => onChange({ ...value, dontUseCard: false })}
          style={styles.link}>
          <Text variant="bodySmall" tone="brand">
            {STAFF_USE_CARD_LABEL}
          </Text>
        </Pressable>
      ) : null}
      {onAddCardNow ? (
        <Button label={CARD_ADD_NOW_LABEL} variant="secondary" size="sm" onPress={onAddCardNow} />
      ) : null}
    </View>
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
  box: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
    gap: spacing.xs,
  },
  stack: {
    gap: spacing.sm,
  },
  link: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
});
