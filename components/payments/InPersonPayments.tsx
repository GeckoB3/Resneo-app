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
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Where "Taking payment in person" lives (owner, 2026-10-15, matching the web's Settings, Booking
 * Settings): in Booking settings, for admins of an Appointments-plan venue. Everyone else, who
 * cannot open Booking settings or would not find the group there, keeps the card reader row and
 * Tap to Pay on iPhone in More, as before.
 */
export function inPersonPaymentsInBookingSettings(input: { isAdmin: boolean; pricingTier: string | null | undefined }): boolean {
  return input.isAdmin && isAppointmentPlanTier(input.pricingTier);
}

/**
 * "Take card payments at your venue": the venue's in-person payments switch (Tap to Pay §6.7), for
 * admins, matching the route's own `requireAdmin`. With it, the Stripe-not-connected caveat and the
 * reassurance that taking payment is never compulsory.
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

  async function toggle(next: boolean) {
    setBusy(true);
    setOptimistic(next);
    try {
      await updateVenue.mutateAsync({ in_person_payments_enabled: next });
      toast.success(next ? 'In-person payments turned on.' : 'In-person payments turned off.');
    } catch (e) {
      setOptimistic(null);
      toast.error(e instanceof ApiError ? e.message : 'Could not change in-person payments. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={styles.toggleRow}>
        <View style={styles.toggleLabel}>
          <Text variant="bodyMedium">Take card payments at your venue</Text>
          <Text variant="caption" tone="muted">
            Let your team collect an appointment&apos;s balance in person by tapping the client&apos;s card or
            phone. Money goes straight to your Stripe account.
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={(v) => void toggle(v)}
          disabled={busy}
          accessibilityLabel="Take card payments at your venue"
          trackColor={{ true: colors.brand }}
        />
      </View>

      {/* The flag alone does nothing without a connected account: `card_present_ready` is
          `enabled && stripe_connected_account_id`. Connect onboarding is a hosted Stripe flow, so
          it stays on web. */}
      {enabled && !stripeConnected ? (
        <View style={styles.noticeRow}>
          <Text variant="caption" color={colors.warning}>
            Connect Stripe first. Card payments are paid into your own Stripe account, so this has no
            effect until that is set up. Open Plan &amp; payments on the web dashboard to finish.
          </Text>
        </View>
      ) : null}

      {/* Taking payment is never compulsory: the frictionless-off guarantee (§1.3) is a promise to
          staff, so say it here too. */}
      {enabled ? (
        <View style={styles.noticeRow}>
          <Text variant="caption" tone="muted">
            Taking a payment is always your team&apos;s choice, appointment by appointment. An
            appointment can still be completed with a balance outstanding.
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
 * Booking settings, "Taking payment in person" (the web's group of the same name): the in-person
 * switch with the card reader row, Tap to Pay on iPhone (iOS, an entitled build, a venue ready for
 * card payments), and the Checkout switch. The caller shows it to admins of an Appointments-plan
 * venue (`inPersonPaymentsInBookingSettings`).
 */
export function BookingSettingsPayments() {
  const { venue } = useVenueContext();
  const tapToPay = useTapToPay();
  const posOn = isPosEnabled(venue);
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Text variant="overline" tone="muted">
          Payments
        </Text>
        <Text variant="subheading" accessibilityRole="header">
          Taking payment in person
        </Text>
        <Text variant="caption" tone="muted">
          {posOn
            ? 'Take cards at your venue, from the ResNeo app and your counter card readers.'
            : "Collect an appointment's outstanding balance at your venue, straight from the ResNeo app."}
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.base,
  },
  toggleLabel: { flex: 1, minWidth: 0, gap: 2 },
  /** Explanatory line under a toggle: inset to the label, no top padding, so it reads as part of
   *  the setting above rather than a row of its own. */
  noticeRow: { paddingHorizontal: spacing.base, paddingBottom: spacing.base },
});
