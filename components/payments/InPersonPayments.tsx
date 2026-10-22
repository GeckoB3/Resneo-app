import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { ReaderSettingsSheet } from '@/components/bookings/ReaderSettingsSheet';
import { MoreRow } from '@/components/more/MoreRow';
import { TapToPaySettings } from '@/components/payments/TapToPaySettings';
import { CheckoutSwitchCard } from '@/components/pos/switches/CheckoutSwitchCard';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { TILE } from '@/lib/navigation/more-destinations';
import { isPosEnabled } from '@/lib/pos/pos-enabled';
import { useUpdateVenue } from '@/lib/queries/useVenueSettings';
import { isAppointmentPlanTier } from '@/lib/venue/venue-experience';
import { useTapToPay } from '@/providers/TapToPayProvider';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Where "Payments at your venue" lives (owner, 2026-10-15, matching the web's Settings, Booking
 * Settings): in Booking settings, for admins of an Appointments-plan venue. Everyone else, who
 * cannot open Booking settings or would not find the group there, keeps the card reader row and
 * Tap to Pay on iPhone in More, as before.
 */
export function inPersonPaymentsInBookingSettings(input: { isAdmin: boolean; pricingTier: string | null | undefined }): boolean {
  return input.isAdmin && isAppointmentPlanTier(input.pricingTier);
}

/**
 * The words for "Card payments in person", word for word the web's (`InPersonPaymentsSection`;
 * owner, 2026-10-22), except that the Stripe line says it is connected on the web. The description says what the switch really gates, which depends on
 * Checkout: with it off, every payment on an appointment in the app (cash included); with it on,
 * the till's cards in person.
 */
export const CARD_PAYMENTS_COPY = {
  title: 'Card payments in person',
  switchLabel: 'Take card payments in person',
  descriptionCheckoutOff:
    'Your team can take payment for an appointment in the ResNeo app: by card, with Tap to Pay on their phone or a Bluetooth card reader, or by recording cash or another way. Money goes straight to your own Stripe account and ResNeo takes no cut.',
  descriptionCheckoutOn:
    'Checkout takes cards in person only while this is on: with Tap to Pay or a Bluetooth card reader in the ResNeo app, on your counter card readers, or by sending a sale to a phone. Money goes straight to your own Stripe account and ResNeo takes no cut.',
  turnedOn: 'Card payments in person turned on.',
  turnedOff: 'Card payments in person turned off.',
  saveFailed: 'Could not change Card payments in person. Try again.',
  offCheckoutOff: 'While this is off, nobody can take payment on an appointment in the ResNeo app.',
  offCheckoutOn:
    "Checkout is on, but it can't take cards in person until you turn this on. It can still take cash, pay links and gift vouchers.",
  // The web's sentence, with "on the web": Stripe is connected there, never in the app.
  stripe:
    'Connect Stripe first, on the web under Settings, then Payments. Card payments go into your own Stripe account, so this has no effect until that is set up.',
  phones:
    'Your team also needs the latest ResNeo app on a supported phone: iPhone XS or newer (iOS 16.4+), or an Android phone with contactless (NFC) running Android 13 or newer.',
  choice:
    "Taking a payment is always your team's choice, appointment by appointment. Turning this on never requires anyone to collect payment, and an appointment can still be completed with a balance outstanding.",
} as const;

/** The group's heading and line (the web's "Payments at your venue" group), the same with Checkout on or off. */
export const PAYMENTS_GROUP_COPY = {
  eyebrow: 'Payments',
  title: 'Payments at your venue',
  description: 'How your team takes payment from clients at your venue.',
} as const;

/**
 * "Card payments in person": the venue's in-person payments switch (Tap to Pay §6.7), for admins,
 * matching the route's own `requireAdmin`. With it, what it does with Checkout off or on, what
 * switching it off stops, the Stripe-not-connected caveat, the phones it needs, and (with Checkout
 * off) the reassurance that taking payment is never compulsory.
 *
 * Optimistic: the switch answers at once and rolls back if `PATCH /api/venue` fails, because the
 * surface it gates (the card reader row, Take payment on every appointment) appears in the same
 * frame and a lagging switch reads as a dead control. The venue bootstrap is read again on success
 * so `card_present_ready` re-derives everywhere.
 */
export function InPersonPaymentsSwitch() {
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const updateVenue = useUpdateVenue();
  const [busy, setBusy] = useState(false);
  /** Optimistic switch position; null = follow the venue bootstrap. */
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const enabled = optimistic ?? Boolean(venue?.in_person_payments_enabled);
  const stripeConnected = Boolean(venue?.stripe_connected_account_id);
  const posOn = isPosEnabled(venue);

  async function toggle(next: boolean) {
    setBusy(true);
    setOptimistic(next);
    try {
      await updateVenue.mutateAsync({ in_person_payments_enabled: next });
      toast.success(next ? CARD_PAYMENTS_COPY.turnedOn : CARD_PAYMENTS_COPY.turnedOff);
    } catch (e) {
      setOptimistic(null);
      toast.error(e instanceof ApiError ? e.message : CARD_PAYMENTS_COPY.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={styles.cardHead}>
        <Text variant="label">{CARD_PAYMENTS_COPY.title}</Text>
        <Text variant="caption" tone="muted">
          {posOn ? CARD_PAYMENTS_COPY.descriptionCheckoutOn : CARD_PAYMENTS_COPY.descriptionCheckoutOff}
        </Text>
      </View>

      <View style={styles.toggleRow}>
        <View style={styles.toggleLabel}>
          <Text variant="bodyMedium">{CARD_PAYMENTS_COPY.switchLabel}</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={(v) => void toggle(v)}
          disabled={busy}
          accessibilityLabel={CARD_PAYMENTS_COPY.switchLabel}
          trackColor={{ true: colors.brand }}
        />
      </View>

      {/* What off means: with Checkout off, no payment on an appointment at all (the kill switch
          is total, cash included); with Checkout on, the till keeps cash, pay links and vouchers
          but takes no card in person, which is the surprise, so it is amber. */}
      {!enabled ? (
        posOn ? (
          <View style={styles.noticeRow}>
            <View
              testID="card-payments-off-checkout-on"
              style={[styles.amberBox, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
              <Text variant="bodySmall">{CARD_PAYMENTS_COPY.offCheckoutOn}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.noticeRow}>
            <Text variant="caption" tone="muted">
              {CARD_PAYMENTS_COPY.offCheckoutOff}
            </Text>
          </View>
        )
      ) : null}

      {/* Taking payment is never compulsory: the frictionless-off guarantee (§1.3) is a promise to
          staff, so say it here too. Appointments only, so not while Checkout is on. */}
      {!posOn ? (
        <View style={styles.noticeRow}>
          <Text variant="caption" tone="muted">
            {CARD_PAYMENTS_COPY.choice}
          </Text>
        </View>
      ) : null}

      {/* The flag alone does nothing without a connected account: `card_present_ready` is
          `enabled && stripe_connected_account_id`. Connect onboarding is a hosted Stripe flow, so
          it stays on web. */}
      {enabled && !stripeConnected ? (
        <View style={styles.noticeRow}>
          <Text variant="caption" color={colors.warning}>
            {CARD_PAYMENTS_COPY.stripe}
          </Text>
        </View>
      ) : null}

      {enabled ? (
        <View style={styles.noticeRow}>
          <Text variant="caption" tone="muted">
            {CARD_PAYMENTS_COPY.phones}
          </Text>
        </View>
      ) : null}
    </>
  );
}

/**
 * "Bluetooth card reader": pairing, battery and firmware, in a sheet so they can be managed outside
 * a live payment. Any role, once the venue's flag is on (the server's value, never the optimistic
 * switch: a PATCH that has not landed must not offer pairing).
 */
export function CardReaderRow({ isFirst = false }: { isFirst?: boolean }) {
  const { venue } = useVenueContext();
  const [open, setOpen] = useState(false);
  if (!venue?.in_person_payments_enabled) return null;
  return (
    <>
      <MoreRow
        isFirst={isFirst}
        icon={{ ios: 'creditcard', android: 'credit_card', web: 'credit_card' }}
        tile={TILE.teal}
        label="Bluetooth card reader"
        hint="Pair it, check its battery and updates"
        onPress={() => setOpen(true)}
      />
      <ReaderSettingsSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * Booking settings, "Payments at your venue" (the web's group of the same name): Card payments in
 * person with the card reader row, Tap to Pay on iPhone (iOS, an entitled build, a venue ready for
 * card payments), and the Checkout switch, which carries "Which do I need?" under it. The caller
 * shows it to admins of an Appointments-plan venue (`inPersonPaymentsInBookingSettings`).
 */
export function BookingSettingsPayments() {
  const tapToPay = useTapToPay();
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Text variant="overline" tone="muted">
          {PAYMENTS_GROUP_COPY.eyebrow}
        </Text>
        <Text variant="subheading" accessibilityRole="header">
          {PAYMENTS_GROUP_COPY.title}
        </Text>
        <Text variant="caption" tone="muted">
          {PAYMENTS_GROUP_COPY.description}
        </Text>
      </View>

      <Card padded={false}>
        <InPersonPaymentsSwitch />
        <CardReaderRow />
      </Card>

      {tapToPay.applies ? (
        <Card padded={false}>
          <View style={styles.cardTitle}>
            <Text variant="label">Tap to Pay on iPhone</Text>
          </View>
          <TapToPaySettings />
        </Card>
      ) : null}

      <CheckoutSwitchCard />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.md },
  groupHead: { gap: 2, paddingHorizontal: spacing.xs },
  cardTitle: { paddingHorizontal: spacing.base, paddingTop: spacing.base },
  /** The card's title and what the switch does, above the switch (as the Checkout card under it). */
  cardHead: { gap: 2, paddingHorizontal: spacing.base, paddingTop: spacing.base },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  toggleLabel: { flex: 1, minWidth: 0, gap: 2 },
  /** Explanatory line under a toggle: inset to the label, no top padding, so it reads as part of
   *  the setting above rather than a row of its own. */
  noticeRow: { paddingHorizontal: spacing.base, paddingBottom: spacing.base },
  /** The amber note (the web's amber box): Checkout is on but takes no card in person. */
  amberBox: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
});
