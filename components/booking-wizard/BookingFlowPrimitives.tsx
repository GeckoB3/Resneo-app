import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ComplianceWarningNotice } from '@/components/compliance/ComplianceWarningNotice';
import { StaffAddCardSheet } from '@/components/booking-wizard/StaffAddCardSheet';
import { StaffCardConfirmation } from '@/components/booking-wizard/StaffCardConfirmation';
import { StaffCardRequestControls } from '@/components/booking-wizard/StaffChargeControls';
import { StaffPaymentLinkLines } from '@/components/booking-wizard/StaffPaymentLinkLines';
import {
  DEFAULT_STAFF_CARD_REQUEST,
  staffCardRequestFields,
  useStaffCardLookup,
  type StaffCardRequestState,
} from '@/components/booking-wizard/staff-card-request';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { PressableScale } from '@/components/ui/PressableScale';
import { ApiError } from '@/lib/api/client';
import { accessRefusalMessage } from '@/lib/roles/roles';
import {
  CARD_STATE_WAITING,
  parseStaffCreateCardOnFile,
  resolveStaffEntityCardHold,
  staffCancelIfNoCardAllowed,
  staffCardHoldFeeLine,
  type StaffCreateCardOnFile,
} from '@/lib/booking/card-hold';
import { formatPence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useCreateBooking,
  type ComplianceBookingWarning,
  type CreateBookingPayload,
} from '@/lib/queries/useCreateBooking';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

// ---------------------------------------------------------------------------
// Step heading
// ---------------------------------------------------------------------------

export function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.headingWrap}>
      <Text variant="heading">{title}</Text>
      {subtitle ? (
        <Text variant="bodySmall" tone="muted">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Selectable card row — used by every "pick a class/event/resource/session" list
// ---------------------------------------------------------------------------

type SelectableRowProps = {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  trailing?: string | null;
  /** Left colour dot (e.g. a class type's colour). */
  accentColour?: string | null;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
};

export function SelectableRow({
  title,
  subtitle,
  meta,
  trailing,
  accentColour,
  selected = false,
  disabled = false,
  onPress,
  accessibilityLabel,
}: SelectableRowProps) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      haptic
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ selected, disabled }}
      style={[
        styles.row,
        {
          backgroundColor: selected ? colors.brandSubtle : colors.surfaceRaised,
          borderColor: selected ? colors.brand : colors.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}>
      {accentColour ? <View style={[styles.dot, { backgroundColor: accentColour }]} /> : null}
      <View style={styles.rowBody}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" tone="secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowTrailing}>
        {trailing ? (
          <Text variant="bodySmall" tone={selected ? 'brand' : 'muted'} style={styles.trailingText}>
            {trailing}
          </Text>
        ) : null}
        {/* A row that cannot be picked (a full session, a sold-out event) has no
            chevron: nothing opens from it. */}
        {selected || !disabled ? (
          <SymbolView
            name={
              selected
                ? { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }
                : { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }
            }
            tintColor={selected ? colors.brand : colors.textMuted}
            size={20}
          />
        ) : null}
      </View>
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------
// Shared confirm step — review summary, pick phone/walk-in, create the booking
// ---------------------------------------------------------------------------

export type SummaryRowItem = { label: string; value: string };

type BuildPayloadArgs = {
  source: 'phone' | 'walk-in';
  requireDeposit: boolean;
};

type BookingFlowConfirmProps = {
  /** Big line at the top of the summary card (e.g. the class/event/resource name). */
  headerTitle: string;
  /** Secondary line under the header (e.g. "60 min · with Jane"). */
  headerSubtitle?: string;
  rows: SummaryRowItem[];
  /** Total price in pence (shown as a Total row when > 0). */
  totalPence?: number | null;
  /** Deposit in pence — when > 0 a "Require deposit" toggle appears. */
  depositPence?: number | null;
  /**
   * The offering's resolved `payment_requirement`. When it is `card_hold` with
   * a positive fee the card line shows (web card-on-file-plan §6.2): a card on
   * file found for the client, or "Send a card request" (on by default, C2),
   * and the payload carries `require_card_hold` (plus `use_card_on_file` and
   * `cancel_if_no_card` when chosen).
   */
  paymentRequirement?: string | null;
  /** Per-unit no-show fee in pence (per person for classes/events, flat otherwise). */
  cardHoldFeePerUnitPence?: number | null;
  /** Units the fee multiplies by (spots / tickets); defaults to 1. */
  cardHoldUnits?: number;
  /** Build the create payload for the chosen source/deposit flags. */
  buildPayload: (args: BuildPayloadArgs) => CreateBookingPayload;
  guestName: string;
  successTitle: string;
  successSubtitle: string;
  initialSource?: 'phone' | 'walk-in';
  /**
   * Controlled booking source. When `source`/`onSourceChange` are supplied the
   * flow owns the Phone/Walk-in choice (e.g. surfaced on the guest step) and the
   * internal "Booking type" selector is hidden. Omit both for the default
   * uncontrolled selector shown here.
   */
  source?: 'phone' | 'walk-in';
  onSourceChange?: (source: 'phone' | 'walk-in') => void;
  onCreated: (bookingId: string) => void;
  onBookAnother?: () => void;
};

interface Confirmation {
  booking_id: string;
  payment_url?: string;
  requires_deposit?: boolean;
  deposit_amount_pence?: number;
  /** Card hold requested at create (§7.6): shows the card-request notice. */
  card_hold_requested?: boolean;
  card_hold_fee_pence?: number | null;
  /** False when the client has no email or phone, so the link was not sent (web QA BKG-A-F9). */
  payment_link_sent?: boolean;
  /** A walk-in: booked straight away, never cancelled for a missing card (web QA BKG-A-F9). */
  walk_in?: boolean;
  /** Card on file (web card-on-file-plan §10); absent from older servers. */
  card_on_file?: StaffCreateCardOnFile | null;
  cancel_if_no_card?: boolean;
  /** The client's email, else phone: where a card request went. */
  guest_contact?: string;
  compliance_warnings?: ComplianceBookingWarning[];
}

const money = (pence: number): string => formatPence(pence) ?? 'Unknown';

function SummaryRow({ label, value }: SummaryRowItem) {
  return (
    <View style={styles.summaryRow}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="bodyMedium">{value}</Text>
    </View>
  );
}

export function BookingFlowConfirm({
  headerTitle,
  headerSubtitle,
  rows,
  totalPence = null,
  depositPence = null,
  paymentRequirement = null,
  cardHoldFeePerUnitPence = null,
  cardHoldUnits,
  buildPayload,
  guestName,
  successTitle,
  successSubtitle,
  initialSource = 'phone',
  source: controlledSource,
  onSourceChange,
  onCreated,
  onBookAnother,
}: BookingFlowConfirmProps) {
  const { colors } = useTheme();
  const createBooking = useCreateBooking();
  // Controlled when the flow passes source/onSourceChange (it then renders the
  // selector itself, e.g. on the guest step); otherwise own the state here.
  const [internalSource, setInternalSource] = useState<'phone' | 'walk-in'>(initialSource);
  const source = controlledSource ?? internalSource;
  const setSource = onSourceChange ?? setInternalSource;
  // Sent for payload-shape compatibility only: the server ignores require_deposit
  // for classes, events and resources (see the note where the toggle used to be),
  // so there is nothing here for staff to change.
  const requireDeposit = false;
  // The card line (web card-on-file-plan §6.2): "Send a card request" on by
  // default (C2), the optional tick off. Walk-ins included, without the tick.
  const [cardRequest, setCardRequest] = useState<StaffCardRequestState>(DEFAULT_STAFF_CARD_REQUEST);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [complianceError, setComplianceError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const staffCardHold = resolveStaffEntityCardHold({
    paymentRequirement,
    feePerUnitPence: cardHoldFeePerUnitPence,
    units: cardHoldUnits,
  });

  // Who the booking is for, as the payload names them (the flows own the guest step).
  const guestPreview = buildPayload({ source, requireDeposit });
  // A booking at another business (a linked or collective partner's): the card line answers for it.
  const partnerVenueId = guestPreview.owner_venue_id ?? null;
  const cardLookup = useStaffCardLookup(guestPreview.guest_id, Boolean(staffCardHold), partnerVenueId);
  const cardNotPossible = cardLookup.canTakeCards === false;
  const cardTickAllowed =
    source !== 'walk-in' &&
    (staffCancelIfNoCardAllowed({ walkIn: false, email: guestPreview.email, phone: guestPreview.phone }) ||
      Boolean(guestPreview.guest_id));
  const cardFields = staffCardHold
    ? staffCardRequestFields(cardRequest, {
        cardFound: cardLookup.card !== null,
        tickAllowed: cardTickAllowed,
        notPossible: cardNotPossible,
      })
    : null;
  const guestContact = guestPreview.email?.trim() || guestPreview.phone?.trim() || undefined;

  const hasDeposit = depositPence != null && depositPence > 0;
  const depositLabel = hasDeposit ? money(depositPence) : null;

  const submit = () => {
    setComplianceError(null);
    setSubmitError(null);
    const payload: CreateBookingPayload = {
      ...buildPayload({ source, requireDeposit }),
      // The card line's fields, sent explicitly: an omitted `require_card_hold`
      // keeps an older app's meaning (no card request) on the server.
      ...(cardFields ?? {}),
    };
    createBooking.mutate(payload, {
      onSuccess: (response) => {
        hapticSuccess();
        setConfirmation({
          booking_id: response.booking_id,
          payment_url: response.payment_url,
          // The 201 carries no deposit figure (web `POST /api/venue/bookings`):
          // a `payment_url` is the deposit request, as the web's card reads it.
          card_hold_requested: response.card_hold_requested,
          card_hold_fee_pence: staffCardHold?.feePence ?? null,
          card_on_file: parseStaffCreateCardOnFile(response.card_on_file),
          cancel_if_no_card: Boolean(cardFields?.cancel_if_no_card),
          guest_contact: guestContact,
          payment_link_sent: response.payment_link_sent,
          walk_in: source === 'walk-in',
          compliance_warnings: response.compliance_warnings,
        });
      },
      onError: (error) => {
        const apiError = error instanceof ApiError ? error : null;
        const body = apiError?.body as { error?: string; message?: string } | null | undefined;
        // Staff are never blocked by compliance (web 2026-09-01): unmet rules
        // arrive as `compliance_warnings` on the 201. The 409 is kept as the
        // helper's contract for the online context.
        if (apiError?.status === 409 && body?.error === 'COMPLIANCE_REQUIREMENT_UNMET') {
          hapticWarning();
          setComplianceError(body?.message ?? 'A compliance requirement is unmet for this guest.');
          return;
        }
        hapticWarning();
        // The roles refusals (CONTACT_BELONGS_TO_OTHER_CLIENT, DIARY_VIEW_ONLY) in the server's words.
        setSubmitError(
          accessRefusalMessage(error) ??
            (apiError ? apiError.message : 'Could not create booking. Please try again.'),
        );
      },
    });
  };

  if (confirmation) {
    return (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.successHeader}>
          <SymbolView
            name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
            tintColor={colors.success}
            size={44}
          />
          <Text variant="heading">{successTitle}</Text>
          <Text variant="bodyMedium" tone="muted" style={styles.center}>
            {successSubtitle}
          </Text>
        </View>

        <Card>
          <View style={[styles.cardHeader, { borderBottomColor: colors.border }]}>
            <Text variant="subheading">{headerTitle}</Text>
            {headerSubtitle ? (
              <Text variant="bodySmall" tone="muted">
                {headerSubtitle}
              </Text>
            ) : null}
          </View>
          {rows.map((row) => (
            <SummaryRow key={row.label} label={row.label} value={row.value} />
          ))}
          {confirmation.card_on_file ? (
            <StaffCardConfirmation
              cardOnFile={confirmation.card_on_file}
              feePence={confirmation.card_hold_fee_pence ?? null}
              sentTo={confirmation.guest_contact ?? null}
              paymentUrl={confirmation.payment_url ?? null}
              linkSent={confirmation.payment_link_sent}
              onAddCardNow={guestPreview.guest_id ? () => setAddCardOpen(true) : undefined}
            />
          ) : confirmation.card_hold_requested ? (
            // An older server, which says only that a card request went.
            <View style={[styles.depositNotice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text variant="bodySmall" tone="brand">
                {CARD_STATE_WAITING}
                {confirmation.card_hold_fee_pence != null && confirmation.card_hold_fee_pence > 0
                  ? `. ${staffCardHoldFeeLine(confirmation.card_hold_fee_pence)}.`
                  : ''}
              </Text>
              <StaffPaymentLinkLines
                cardHold
                paymentUrl={confirmation.payment_url}
                linkSent={confirmation.payment_link_sent}
                walkIn={Boolean(confirmation.walk_in)}
                cancelIfNoCard={confirmation.cancel_if_no_card}
              />
            </View>
          ) : confirmation.payment_url ||
            (confirmation.requires_deposit &&
              confirmation.deposit_amount_pence != null &&
              confirmation.deposit_amount_pence > 0) ? (
            <View style={[styles.depositNotice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text variant="bodySmall" tone="brand">
                {confirmation.deposit_amount_pence != null && confirmation.deposit_amount_pence > 0
                  ? `Deposit required: ${money(confirmation.deposit_amount_pence)}`
                  : 'Deposit requested'}
              </Text>
              {confirmation.payment_url ? (
                <StaffPaymentLinkLines
                  cardHold={false}
                  paymentUrl={confirmation.payment_url}
                  linkSent={confirmation.payment_link_sent}
                  walkIn={Boolean(confirmation.walk_in)}
                />
              ) : null}
            </View>
          ) : null}
        </Card>

        <ComplianceWarningNotice
          warnings={confirmation.compliance_warnings}
          onCapture={() => onCreated(confirmation.booking_id)}
        />

        <View style={styles.actions}>
          <Button label="View booking" fullWidth onPress={() => onCreated(confirmation.booking_id)} />
          {onBookAnother ? (
            <Button label="Book another" variant="secondary" fullWidth onPress={onBookAnother} />
          ) : null}
        </View>
      <StaffAddCardSheet
        open={addCardOpen}
        onClose={() => setAddCardOpen(false)}
        guestId={guestPreview.guest_id}
        bookingId={confirmation.booking_id}
        clientFirstName={guestPreview.first_name?.trim() ?? ''}
        hasContact={Boolean(guestContact || guestPreview.guest_id)}
        savesWith={cardLookup.addSavesWith}
        onSaved={cardLookup.refresh}
      />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}>
      <Text variant="heading">Review &amp; confirm</Text>

      <Card>
        <View style={[styles.cardHeader, { borderBottomColor: colors.border }]}>
          <Text variant="subheading">{headerTitle}</Text>
          {headerSubtitle ? (
            <Text variant="bodySmall" tone="muted">
              {headerSubtitle}
            </Text>
          ) : null}
        </View>
        {rows.map((row) => (
          <SummaryRow key={row.label} label={row.label} value={row.value} />
        ))}
        <SummaryRow label="Guest" value={guestName || 'Not given'} />
        {totalPence != null && totalPence > 0 ? (
          <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
            <Text variant="label">Total</Text>
            <Text variant="label" tone="brand">
              {money(totalPence)}
            </Text>
          </View>
        ) : null}
        {depositLabel ? (
          <View style={styles.depositRow}>
            <Text variant="caption" tone="muted">
              Deposit
            </Text>
            <Text variant="bodySmall">{depositLabel}</Text>
          </View>
        ) : null}
        {staffCardHold ? (
          <View style={styles.depositRow}>
            <Text variant="caption" tone="muted">
              No-show fee
            </Text>
            <Text variant="bodySmall">{money(staffCardHold.feePence)}</Text>
          </View>
        ) : null}
      </Card>

      {/* Hidden when the flow controls the source (it renders the selector
          itself, e.g. on the guest step) to avoid a duplicate toggle. */}
      {onSourceChange ? null : (
        <View style={styles.sourceBlock}>
          <Text variant="label" tone="secondary">
            Booking type
          </Text>
          <Segmented
            options={[
              { value: 'phone', label: 'Phone' },
              { value: 'walk-in', label: 'Walk-in' },
            ]}
            value={source}
            onChange={setSource}
          />
        </View>
      )}

      {staffCardHold ? (
        <StaffCardRequestControls
          walkIn={source === 'walk-in'}
          value={cardRequest}
          onChange={setCardRequest}
          feePence={staffCardHold.feePence}
          foundCard={cardLookup.card}
          notPossible={cardNotPossible}
          tickAllowed={cardTickAllowed}
          onAddCardNow={
            guestPreview.guest_id && !cardNotPossible && !partnerVenueId ? () => setAddCardOpen(true) : undefined
          }
        />
      ) : null}
      <StaffAddCardSheet
        open={addCardOpen}
        onClose={() => setAddCardOpen(false)}
        guestId={guestPreview.guest_id}
        bookingId={null}
        clientFirstName={guestPreview.first_name?.trim() ?? ''}
        hasContact={Boolean(guestContact || guestPreview.guest_id)}
        savesWith={cardLookup.addSavesWith}
        onSaved={cardLookup.refresh}
      />

      {/* No "Require deposit" toggle here. This component is used ONLY by the
          class, event and resource flows, and the server honours `require_deposit`
          for appointments and tables alone — for these three the deposit is derived
          unconditionally from the offering's own payment_requirement. The control
          therefore promised a choice it could not keep: it defaulted to OFF, so
          staff who deliberately left it unticked ("no deposit for this one") still
          had the server create the deposit and send the guest a payment link. The
          web's equivalents have no such toggle, for the same reason. */}

      {complianceError ? (
        <View style={[styles.complianceBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text variant="bodySmall" tone="danger">
            {complianceError}
          </Text>
          <Text variant="caption" tone="muted">
            Collect the required record or send the form, then try again.
          </Text>
        </View>
      ) : null}

      {submitError ? (
        <Text variant="bodySmall" tone="danger">
          {submitError}
        </Text>
      ) : null}

      <Button
        label="Create booking"
        fullWidth
        loading={createBooking.isPending}
        onPress={submit}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { gap: spacing.lg, paddingBottom: spacing.xl },
  headingWrap: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.base,
  },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  rowBody: { flex: 1, gap: 2 },
  rowTrailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trailingText: { maxWidth: 120, textAlign: 'right' },
  cardHeader: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
    marginBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryRow: { gap: 2, marginBottom: spacing.md },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  depositRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  depositNotice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  sourceBlock: { gap: spacing.sm },
  depositToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  depositToggleLabel: { flex: 1, minWidth: 0 },
  check: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { fontSize: 13, fontFamily: fonts.bold, lineHeight: 16 },
  complianceBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.md,
  },
  successHeader: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.sm },
  center: { textAlign: 'center' },
  actions: { gap: spacing.md },
});
