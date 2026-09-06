import * as Clipboard from 'expo-clipboard';
import { format, parseISO } from 'date-fns';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { BookingNotesSection } from '@/components/bookings/BookingNotesSection';
import { BookingPaymentHistory } from '@/components/bookings/BookingPaymentHistory';
import { BookingPriceSummary } from '@/components/bookings/BookingPriceSummary';
import { ComplianceCard } from '@/components/bookings/ComplianceCard';
import { DepositSheet, type DepositTarget } from '@/components/bookings/DepositSheet';
import {
  TakePaymentSheet,
  type TakePaymentTarget,
} from '@/components/bookings/TakePaymentSheet';
import { GroupVisitCards } from '@/components/bookings/GroupVisitCards';
import { MessageGuestSection } from '@/components/bookings/MessageGuestSection';
import {
  ModifyBookingSheet,
  type ModifyBookingTarget,
} from '@/components/bookings/ModifyBookingSheet';
import { RescheduleSheet, type RescheduleTarget } from '@/components/calendar/RescheduleSheet';
import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { DocumentsSection } from '@/components/clients/DocumentsSection';
import { LinkedComplianceSection } from '@/components/linked/LinkedComplianceSection';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { MetaChip } from '@/components/ui/MetaChip';
import { QuickAction } from '@/components/ui/QuickAction';
import { Text } from '@/components/ui/Text';
import { ANALYTICS_EVENTS, track } from '@/lib/analytics';
import { ApiError } from '@/lib/api/client';
import { resolveCardHoldUiState, type CardHoldPillVariant } from '@/lib/booking/card-hold';
import {
  bookingPaymentStateLabel,
  buildPaymentHistory,
  buildPriceSummary,
  canTakeInPersonPayment,
  canRefundInPerson,
  pendingCardPayments,
  pendingCardState,
} from '@/lib/payments/payment-display';
import { usePendingCardClock } from '@/lib/payments/usePendingCardClock';
import { calendarDateInTimeZone } from '@/lib/dates/venue-dates';
import { canMarkNoShowForSlot, clampNoShowGraceMinutes } from '@/lib/booking/no-show-grace';
import { ACTION_COLORS, primaryActionColors } from '@/lib/booking/booking-action-colors';
import { useAcceptUnpaidGuard } from '@/components/bookings/AcceptUnpaidSheet';
import {
  resolveAppointmentVisit,
  visitServiceNames,
} from '@/lib/booking/appointment-visit';
import { resolveBookingCoreDurationMinutes } from '@/lib/booking/booking-core-duration';
import { bookingDetailActions } from '@/lib/booking/booking-status-actions';
import { bookingStatusVisualForKey } from '@/lib/booking/booking-status-visual';
import {
  bookingTimelineEventsForDisplay,
  formatTimelineEventTime,
} from '@/lib/booking/booking-timeline';
import {
  bookingModelShortLabel,
  isTableReservationBooking,
} from '@/lib/booking/infer-booking-row-model';
import { partySizeLabel } from '@/lib/booking/terminology';
import { formatPence, formatPositivePence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useDeleteBooking,
  useResendConfirmation,
  useSetBookingAttendance,
} from '@/lib/queries/useBookingMutations';
import { useGuestDetail } from '@/lib/queries/useGuestDetail';
import { useGroupVisitBookings } from '@/lib/queries/useGroupVisit';
import { useManagedServices } from '@/lib/queries/useServicesManage';
import { linkedDetailPolicy, type LinkedBookingContext } from '@/lib/linked/linked-detail-policy';
import { writeRebookBootstrap, type RebookBootstrapPayload } from '@/lib/rebook-bootstrap';
import type { GuestBookingHistoryRow } from '@/types/guest-detail';
import {
  canShowStaffAttendanceToggle,
  depositPillAppliesToStatus,
  hasSettleableDeposit,
  showDepositFailedPill,
} from '@/lib/booking/booking-staff-indicators';
import {
  resolveStaffBookingLocation,
  staffBookingLocationPillLabel,
} from '@/lib/booking/staff-booking-location';
import { BookingLocationCallout } from '@/components/bookings/BookingLocationCallout';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingDetail, BookingStatus } from '@/types/booking-detail';

type SymbolName = SymbolViewProps['name'];

type BookingDetailContentProps = {
  booking: BookingDetail;
  isAppointmentVenue?: boolean;
  /** Gates admin-only actions (e.g. deposit refunds). */
  isAdmin?: boolean;
  onStatusChange: (status: BookingStatus) => void;
  actionLoading?: boolean;
  /** Called after a permanent delete so the host can dismiss/navigate away. */
  onDeleted?: () => void;
  /**
   * The sheet host surfaces the primary status action in a pinned bottom bar,
   * so it hides the inline copy. The full-screen route keeps it inline.
   */
  showPrimaryAction?: boolean;
  /**
   * Service label from the originating list row. The detail GET only returns
   * `service_variant_name` (null for plain services — the base name lives in the
   * list's computed `booking_item_name`), so the host passes that through to keep
   * the service name visible in the hero. Mirrors the web detail header.
   */
  fallbackServiceName?: string | null;
  /**
   * Practitioner/staff name from the list row that opened the detail — the
   * detail GET doesn't return `practitioner_name`, so without this the hero's
   * "with {staff}" line is always blank for appointments.
   */
  fallbackPractitionerName?: string | null;
  /**
   * True while `booking` is still the lightweight /summary placeholder. Only the
   * full GET resolves an online booking's joining details from the service, so
   * without this the location callout would report "no meeting link is set" for
   * the moment before the full detail lands.
   */
  detailPending?: boolean;
  /**
   * Set when the booking belongs to a linked venue and was reached through the
   * link. The grant then decides what the panel offers (web `linkedAct`,
   * `lib/linked/linked-detail-policy`): a view-only link shows everything and
   * changes nothing; an edit grant keeps the status, attendance, Modify,
   * Reschedule, notes, messaging and deposit actions; only a full grant may
   * cancel or rebook. Our own venue's things (the guest's Records and
   * history, "Open in Contacts", "New for guest") stay off a partner's booking.
   */
  linked?: LinkedBookingContext | null;
};

const TERMINAL_STATUSES = new Set<BookingStatus>(['Cancelled', 'Completed', 'No-Show']);

function formatGuestName(booking: BookingDetail): string {
  const guest = booking.guest;
  if (guest) {
    const parts = [guest.first_name, guest.last_name].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(' ');
    }
  }
  return 'Guest';
}

/** "Friday 13 June" — the appointment's day, headline-style. */
function formatBookingDateLabel(date: string, time: string): string {
  try {
    return format(parseISO(`${date}T${time.slice(0, 5)}:00`), 'EEEE d MMMM');
  } catch {
    return date;
  }
}

/**
 * "14:00 – 15:00", falling back to the start plus the resolved core duration
 * when the row has no `booking_end_time` (every guest-created appointment), and
 * to the bare start when nothing resolves an end at all.
 */
function formatBookingTimeRange(
  time: string,
  endTime?: string | null,
  durationMinutes?: number | null,
): string {
  const start = time.slice(0, 5);
  if (endTime?.trim()) {
    return `${start} – ${endTime.slice(0, 5)}`;
  }
  if (durationMinutes != null && durationMinutes > 0) {
    // Wrap, don't clamp: `minutesToTime` pins anything past midnight to 23:59,
    // so a 23:30 appointment running an hour read "23:30 – 23:59" instead of
    // "23:30 – 00:30". The date lives elsewhere on the card, as it does for the
    // stored `booking_end_time`, which is a bare wall clock for the same reason.
    return `${start} – ${minutesToTime((timeToMinutes(start) + durationMinutes) % (24 * 60))}`;
  }
  return start;
}

const formatDeposit = formatPositivePence;

/** Web pill variants (§9.1) → app Badge tones ('info' teal maps to accent). */
const CARD_HOLD_BADGE_TONE: Record<CardHoldPillVariant, 'warning' | 'accent' | 'neutral' | 'brand'> = {
  warning: 'warning',
  info: 'accent',
  neutral: 'neutral',
  brand: 'brand',
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text variant="bodySmall" tone="muted">
        {label}
      </Text>
      <Text variant="bodyMedium" style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

/** Tappable contact line with a leading glyph (call/email). */
function ContactRow({
  icon,
  value,
  accessibilityLabel,
  onPress,
}: {
  icon: SymbolName;
  value: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.contactLine, { opacity: pressed ? 0.55 : 1 }]}>
      <SymbolView name={icon} tintColor={colors.brand} size={16} />
      <Text variant="bodySmall" color={colors.brand} numberOfLines={1} style={styles.contactLineText}>
        {value}
      </Text>
    </Pressable>
  );
}

/**
 * Appointment rebook block from a guest-history row, or null when the row isn't
 * a repeatable appointment (events/classes/resources pick a fresh slot). Mirrors
 * the practitioner/service id fallbacks used by the detail's Rebook action.
 */
function historyRowAppointment(
  row: GuestBookingHistoryRow,
): RebookBootstrapPayload['appointment'] | null {
  const practitionerId = row.practitioner_id ?? row.calendar_id ?? null;
  const serviceId = row.appointment_service_id ?? row.service_item_id ?? null;
  if (!practitionerId || !serviceId) return null;
  return {
    serviceId,
    practitionerId,
    variantId: row.service_variant_id ?? null,
  };
}

/** Other visits for this guest — loaded lazily on first expand. */
function GuestHistoryBody({
  guestId,
  currentBookingId,
}: {
  guestId: string;
  currentBookingId: string;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  // Fetch a few more than we list so "view all in Contacts" can be offered when
  // the guest has a deeper history than the inline cap (web parity).
  const HISTORY_FETCH_LIMIT = 25;
  const HISTORY_VISIBLE_CAP = 10;
  const detail = useGuestDetail(guestId, { bookingHistoryLimit: HISTORY_FETCH_LIMIT });

  const guest = detail.data?.guest;
  const otherVisits = (detail.data?.booking_history ?? []).filter(
    (row) => row.id !== currentBookingId,
  );
  const history = otherVisits.slice(0, HISTORY_VISIBLE_CAP);
  const hiddenCount = otherVisits.length - history.length;

  /** Rebook a past visit — re-seed its service/practitioner (when it has one) + guest. */
  const handleRebookRow = (row: GuestBookingHistoryRow) => {
    void (async () => {
      const appointment = historyRowAppointment(row);
      await writeRebookBootstrap({
        v: 1,
        guest: {
          firstName: guest?.first_name ?? undefined,
          lastName: guest?.last_name ?? undefined,
          email: guest?.email ?? null,
          phone: guest?.phone ?? null,
        },
        ...(appointment ? { appointment } : {}),
      });
      router.push({ pathname: '/booking/new' });
    })();
  };

  return (
    <View style={styles.historyBody}>
      {detail.isLoading ? (
        <Text variant="bodySmall" tone="muted">
          Loading…
        </Text>
      ) : history.length === 0 ? (
        <Text variant="bodySmall" tone="muted">
          No other bookings for this guest.
        </Text>
      ) : (
        history.map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            onPress={() => router.push(`/booking/${row.id}` as Href)}
            style={[styles.historyRow, { borderBottomColor: colors.border }]}>
            <View style={styles.historyText}>
              <Text variant="bodySmall" numberOfLines={1}>
                {row.detail_label || row.kind_label}
              </Text>
              <Text variant="caption" tone="muted">
                {row.booking_date}
                {row.booking_time ? ` · ${row.booking_time.slice(0, 5)}` : ''}
              </Text>
            </View>
            <View style={styles.historyTrailing}>
              <StatusPill
                status={row.status}
                isTableReservation={row.booking_model === 'table_reservation'}
              />
              <Button
                label="Rebook"
                variant="ghost"
                size="sm"
                onPress={() => handleRebookRow(row)}
              />
            </View>
          </Pressable>
        ))
      )}
      <Button
        label={hiddenCount > 0 ? `View all in Contacts (${otherVisits.length})` : 'View contact'}
        variant="ghost"
        size="sm"
        onPress={() => router.push(`/client/${guestId}` as Href)}
      />
    </View>
  );
}

function formatDurationLabel(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatShortDate(value: string): string {
  try {
    return format(parseISO(value), 'd MMM yyyy');
  } catch {
    return value;
  }
}

export function BookingDetailContent({
  booking,
  isAppointmentVenue = false,
  isAdmin = false,
  onStatusChange,
  actionLoading = false,
  onDeleted,
  showPrimaryAction = true,
  fallbackServiceName,
  fallbackPractitionerName,
  detailPending = false,
  linked = null,
}: BookingDetailContentProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { venue, featureFlags } = useVenueContext();
  // What a linked venue's booking lets us do; everything, for our own.
  const policy = linkedDetailPolicy(linked?.act);
  // A rebook of a partner's guest opens the form over the partner's venue.
  const linkedFormParams = linked
    ? { ownerVenueId: linked.venueId, ownerVenueName: linked.venueName }
    : undefined;
  // Resolve the service name from the staff service list when neither the detail
  // nor the list row supplied it (covers entry points other than the bookings
  // list — calendar, contacts, the full-screen route). Cached + staff-readable.
  const managedServices = useManagedServices();
  const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null);
  const [modifyTarget, setModifyTarget] = useState<ModifyBookingTarget | null>(null);
  const [depositTarget, setDepositTarget] = useState<DepositTarget | null>(null);
  const [takePaymentTarget, setTakePaymentTarget] = useState<TakePaymentTarget | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  // Two-step confirm for destructive/irreversible actions. `Alert.alert` is a
  // no-op on react-native-web, so we arm the button (label flips to "Tap to
  // confirm") and disarm after a few seconds if the user doesn't follow through.
  const [pendingConfirm, setPendingConfirm] = useState<BookingStatus | null>(null);
  const [resendArmed, setResendArmed] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resend = useResendConfirmation(booking.id);
  const attendance = useSetBookingAttendance(booking.id);
  const acceptUnpaidGuard = useAcceptUnpaidGuard();
  const deleteBooking = useDeleteBooking(booking.id);

  // Funnel: the booking detail opened (re-fires if the host swaps in a new id).
  useEffect(() => {
    track(ANALYTICS_EVENTS.bookingDetailOpened, { bookingId: booking.id });
  }, [booking.id]);

  // No-show grace guard mirrors web `canMarkNoShowForSlot`: the action stays
  // disabled until the booking start + the venue's grace window has elapsed.
  // A 60s tick re-evaluates the clock so the action unlocks without a reopen.
  const venueTimeZone = venue?.timezone?.trim() || 'Europe/London';
  // Web clamps the configured grace to 10–60 (default 15) before gating.
  const noShowGraceMinutes = clampNoShowGraceMinutes(venue?.no_show_grace_minutes);
  const [noShowTick, setNoShowTick] = useState(0);
  const noShowAllowed = canMarkNoShowForSlot(
    booking.booking_date,
    booking.booking_time,
    noShowGraceMinutes,
    venueTimeZone,
  );
  // The guard only flips from disabled→enabled when the booking is today and
  // grace hasn't lapsed; past/future days are decided. Run the minute clock only
  // for that window — and only while a no-show is even offerable (Booked /
  // Confirmed) — so terminal rows and other days never hold a timer.
  const noShowPending =
    !noShowAllowed &&
    (booking.status === 'Booked' || booking.status === 'Confirmed') &&
    booking.booking_date === calendarDateInTimeZone(new Date(), venueTimeZone);
  useEffect(() => {
    if (!noShowPending) return;
    const id = setInterval(() => setNoShowTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
    // noShowTick advances the clock each minute; re-running re-checks the guard.
  }, [noShowPending, noShowTick]);

  /**
   * Clock for ageing out a `pending` card row (see `usePendingCardClock`). Runs
   * only while there IS such a row, so an ordinary booking holds no timer.
   */
  const pendingCardNowMs = usePendingCardClock(
    pendingCardPayments(booking.payments).length > 0,
  );

  const armConfirm = (target: BookingStatus) => {
    setPendingConfirm(target);
    hapticWarning();
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setPendingConfirm(null), 4000);
  };

  const copyReference = async () => {
    await Clipboard.setStringAsync(booking.id);
    hapticSuccess();
    setCopiedRef(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedRef(false), 2000);
  };

  const guestName = formatGuestName(booking);
  // Contact this booking belongs to — drives "Open in Contacts" (web parity) and
  // the guest-history "View contact" link. Falls back to the flat guest_id.
  const guestProfileId = booking.guest?.id ?? booking.guest_id ?? null;
  // A partner's guest is not in our Contacts (web: no contacts link in a linked context).
  const openGuestContact =
    guestProfileId && policy.ownVenueOnly
      ? () => router.push(`/client/${guestProfileId}` as Href)
      : null;
  const isTable = isTableReservationBooking(booking);

  const actions = bookingDetailActions(booking.status, isTable);
  const depositLabel = formatDeposit(booking.deposit_amount_pence);
  const tableNames = (booking.table_assignments ?? []).map((t) => t.name).join(', ');
  const modelLabel = booking.inferred_booking_model
    ? bookingModelShortLabel(booking.inferred_booking_model)
    : null;
  const visitCount = booking.guest?.visit_count ?? 0;
  const partyLabel = partySizeLabel(booking.party_size, {
    isAppointment: isAppointmentVenue,
    isTableReservation: isTable,
  });
  const canReschedule = !TERMINAL_STATUSES.has(booking.status) && policy.canEdit;

  // Booked length — feeds the duration stepper on the reschedule sheet AND the
  // seed for the Modify sheet. Reads BOTH end columns: a guest-created
  // appointment has no `booking_end_time`, and treating that as "unknown length"
  // let Modify propose 30 minutes and shrink the booking on save.
  const rowDurationMinutes = resolveBookingCoreDurationMinutes(booking);

  /**
   * The whole visit, when this booking is one service of several.
   *
   * The calendar merges a visit into one bar and opens its EARLIEST segment, so
   * without this the panel reported that segment's time and length for the whole
   * thing: a visit running 10:00 to 12:15 opened showing "10:00 – 11:00 · 1h",
   * disagreeing with the bar that had just been tapped. Null for a party, for an
   * ordinary booking, and while the query is still loading — every one of which
   * wants the single-row facts below.
   *
   * The same query already backs `GroupVisitCards` further down, so this is a
   * cache hit rather than a second request.
   */
  const groupVisitQuery = useGroupVisitBookings(booking.group_booking_id);
  const visit = useMemo(
    () => resolveAppointmentVisit(groupVisitQuery.data ?? []),
    [groupVisitQuery.data],
  );

  // Booked length as the screen should read it: the visit's wall-clock span when
  // there is one, otherwise this row's own. Note this is the SPAN, gaps included
  // — not the sum of the services, which is a different number whenever a buffer
  // or processing gap sits between two of them, and which is what the visit is
  // edited by.
  const durationMinutes = visit?.totalMinutes ?? rowDurationMinutes;

  // Hero facts — the "what & when" surfaced directly under the guest header so
  // the most important info is visible before any action is taken.
  const practitionerName =
    booking.practitioner_name?.trim() || fallbackPractitionerName?.trim() || null;
  const dateLabel = formatBookingDateLabel(booking.booking_date, booking.booking_time);
  const timeRangeLabel = visit
    ? `${visit.startHm} – ${visit.endHm}`
    : formatBookingTimeRange(booking.booking_time, booking.booking_end_time, durationMinutes);
  // Prefer the detail's variant name, then the list row's service label, then the
  // service catalog by id (the detail GET omits the base name for plain services).
  const catalogServiceName =
    managedServices.data?.services.find(
      (s) => s.id === (booking.service_item_id ?? booking.appointment_service_id),
    )?.name?.trim() || null;
  const serviceName =
    booking.service_variant_name?.trim() ||
    fallbackServiceName?.trim() ||
    catalogServiceName ||
    null;
  // A visit says what it is made of, so the panel answers "how long is this and
  // what is in it" without scrolling to the breakdown card below. The per-row
  // name would otherwise be whichever service happened to be first.
  const serviceLine = [
    visit ? visitServiceNames(visit).join(', ') : serviceName,
    practitionerName ? `with ${practitionerName}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  // Where the team has to be. Null for business-venue and legacy bookings, which
  // render nothing. The address rides on the booking row so it paints with the
  // /summary placeholder; the joining details arrive with the full detail, which
  // `detailPending` keeps the callout from mistaking for an unconfigured service.
  const staffLocation = resolveStaffBookingLocation({ ...booking, detailPending });
  const statusVisual = bookingStatusVisualForKey(booking.status);
  // A failed deposit had no presence at all on this screen: staff had to open
  // the deposit card to learn the payment had bounced.
  const showDepositFailed =
    showDepositFailedPill(booking) && depositPillAppliesToStatus(booking.status);

  // Full modify (service/staff/slot) — appointment bookings in live statuses,
  // mirroring web `canStaffModifyBooking` + the appointment modify branch.
  const isAppointmentBooking = !!(
    booking.appointment_service_id ||
    booking.service_item_id ||
    booking.practitioner_id ||
    booking.calendar_id
  );
  const canModify =
    !isTable &&
    isAppointmentBooking &&
    ['Pending', 'Booked', 'Confirmed', 'Seated'].includes(booking.status) &&
    policy.canEdit;
  const complianceEnabled =
    featureFlags?.resolved?.compliance_records_enabled === true &&
    !!booking.guest &&
    !!(booking.appointment_service_id || booking.service_item_id);

  /**
   * What a visit hands the editing sheets, or null for an ordinary booking.
   *
   * Both sheets used to take this row alone, which is what let a visit come
   * apart: shortening the first service left the rest where they were (dead time
   * opens up), and moving it took the head away from the tail. With this set they
   * edit the whole visit through one endpoint instead.
   */
  const visitEdit =
    visit?.groupBookingId != null
      ? {
          groupBookingId: visit.groupBookingId,
          startHm: visit.startHm,
          endHm: visit.endHm,
          serviceCount: visit.services.length,
          serviceNames: visitServiceNames(visit),
          /** The visit's FIRST service: the row its notification is sent against. */
          leadBookingId: visit.services[0]!.id,
        }
      : null;

  const openModify = () =>
    setModifyTarget({
      id: booking.id,
      guestName,
      date: booking.booking_date,
      // A visit's schedule belongs to its FIRST service, whichever segment the
      // calendar opened.
      time: visit ? `${visit.startHm}:00` : booking.booking_time,
      durationMinutes,
      practitionerId: booking.calendar_id ?? booking.practitioner_id ?? null,
      serviceId: booking.appointment_service_id ?? booking.service_item_id ?? null,
      usesServiceItem: !booking.appointment_service_id && !!booking.service_item_id,
      serviceVariantId: booking.service_variant_id ?? null,
      visit: visitEdit,
      // A partner's booking is modified against the partner's catalogue.
      ownerVenueId: linked?.venueId ?? null,
    });

  const primaryAction = actions.find((a) => a.kind === 'primary');
  const revertAction = actions.find((a) => a.kind === 'revert');
  // Reverts (undos) apply on the first tap — no arm/confirm — mirroring the web's
  // `isBookingInstantRevertTransition`: Undo confirm (Confirmed→Booked), Undo
  // Start (Seated→Booked, appointments only), Reopen (Completed→Seated) and Undo
  // No-Show (No-Show→Booked). Table "Unseat" (Seated→Booked on a reservation) is
  // the one revert that keeps a confirm, matching web. Only the genuinely
  // destructive actions (No-Show, Cancel) still arm→confirm.
  const revertIsInstant =
    !!revertAction &&
    (booking.status !== 'Seated' || revertAction.target !== 'Booked' || !isTable);
  // Cancelling a partner's booking needs the full grant (web `canCancel`);
  // no-show is an ordinary status change and stays with an edit grant.
  const destructiveActions = actions.filter(
    (a) => a.kind === 'destructive' && (policy.canCancel || a.target !== 'Cancelled'),
  );
  const timelineEvents = bookingTimelineEventsForDisplay(booking.events ?? []);

  const guestEmail = booking.guest?.email?.trim();
  const guestPhone = booking.guest?.phone?.trim();
  const canResend = !!guestEmail && policy.canEdit;
  const hasDeposit = booking.deposit_amount_pence != null || !!booking.deposit_status;
  // Card-hold state (§9.1): when non-null the legacy deposit UI is replaced by
  // the card-aware pill/lines/actions everywhere in this component.
  const cardHoldState = resolveCardHoldUiState(
    { status: booking.status, deposit_status: booking.deposit_status ?? '' },
    booking.card_hold ?? null,
    { isAdmin },
  );
  const cardHoldHasActions =
    !!cardHoldState &&
    (cardHoldState.showResendLink ||
      cardHoldState.showWaive ||
      cardHoldState.showChargeAction ||
      cardHoldState.showRefundAction ||
      cardHoldState.showReleaseAction);
  // In-person payments (Tap to Pay §3.4/§7.8). The gate is deliberately strict:
  // when it is false the button does not exist in the tree at all, so a venue
  // that has not enabled the feature sees exactly today's screen.
  // Money actions follow the edit grant on a linked booking (web: the deposit
  // and card actions are withheld for a view-only link, the figures stay).
  const canTakePayment =
    policy.canEdit &&
    canTakeInPersonPayment({
      inPersonPaymentsEnabled: venue?.in_person_payments_enabled === true,
      isAppointmentVenue,
      status: booking.status,
      paymentState: booking.payment_state,
      balanceDuePence: booking.balance_due_pence,
    });
  const paymentStateLabel = booking.payment_state
    ? bookingPaymentStateLabel(booking.payment_state)
    : null;
  /**
   * A card payment whose Stripe webhook hasn't landed yet. Until it does the
   * booking still reads "Outstanding" with a live Take payment button, so
   * without this the only honest signal that money is already in flight is
   * invisible and the client gets charged twice. It has to be readable from the
   * COLLAPSED card too, hence the summary/expanded overrides below.
   */
  const pendingCard = pendingCardState({ payments: booking.payments, nowMs: pendingCardNowMs });
  const hasPendingCard = pendingCard.verdict !== 'none';
  const pendingCardPence = pendingCard.totalPence;
  /** A row this client watched decline, or one whose webhook is never coming,
   *  must not keep claiming money is in flight — it says what to check instead. */
  const pendingCardStale = pendingCard.verdict === 'stale';
  // Ledger history for reconciliation: pending, succeeded, failed and refunded.
  const paymentHistory = buildPaymentHistory(booking.payments, booking.id);

  /**
   * The money action is mirrored into the top toolbar beside Arrived/Confirm.
   * It previously lived only inside the collapsed "Payments & confirmation"
   * card, so collecting during a live checkout meant scrolling and expanding a
   * section with the client waiting.
   *
   * When the visit is settled the same slot reads "Paid" and still opens the
   * sheet. That is not only a status: `canTakeInPersonPayment` is false once
   * `payment_state` is 'paid', and the sheet had exactly one entry point, so a
   * fully paid booking previously had NO route to the refund UI at all.
   * Cancelled-but-paid bookings therefore keep the button too, since a refund is
   * precisely what they need.
   */
  const inPersonPaymentsOn = venue?.in_person_payments_enabled === true && isAppointmentVenue;
  const isPaidInPerson = inPersonPaymentsOn && booking.payment_state === 'paid';
  const showPaymentToolbarAction = canTakePayment || isPaidInPerson;

  const paymentSheetTarget = (initialMode?: 'menu' | 'refund'): TakePaymentTarget => ({
    id: booking.id,
    guestName,
    balanceDuePence: booking.balance_due_pence ?? null,
    visitPayment: booking.visit_payment ?? null,
    isAdmin,
    payments: booking.payments ?? [],
    cardPresentReady: venue?.card_present_ready === true,
    initialMode,
  });

  // Two zero-argument handlers rather than one that takes the mode: passed
  // straight to `onPress`, a parameterised opener would receive the press event
  // as its first argument and open the sheet on a GestureResponderEvent.
  const openTakePayment = () => setTakePaymentTarget(paymentSheetTarget());
  const openRefund = () => setTakePaymentTarget(paymentSheetTarget('refund'));

  /**
   * Refunding used to be reachable only by opening the payment sheet and
   * spotting "Refund a payment" inside it — and on a settled booking the way in
   * is a button labelled "Paid", which reads as a status rather than an action.
   * Two taps, neither of them signposted. The ledger it acts on is already right
   * here in this section, so the action belongs beside it.
   *
   * Gated exactly like the one inside the sheet, plus the venue switch: refunds
   * are admin-only, need a settled row to act on, and the server 403s every
   * payment route when in-person payments are off (the kill switch is total).
   */
  const showInPersonRefund =
    policy.canEdit &&
    canRefundInPerson({
      inPersonPaymentsEnabled: venue?.in_person_payments_enabled,
      isAppointmentVenue,
      isAdmin,
      payments: booking.payments,
    });

  // Web parity: deposit actions (send link / record cash / waive / refund) show
  // whenever the booking is active AND there is something the sheet can do;
  // cancelled bookings instead get a refund banner + a permanent-delete card.
  // Card-hold actions ignore the cancel gate: a kept late-cancellation hold stays
  // chargeable/releasable on a Cancelled booking (§9.3 amended).
  //
  // R21-1: the second half of that gate is new. This button opens `DepositSheet`,
  // whose legacy branch offers the three settle actions while a deposit is
  // outstanding and a Refund once it is `'Paid'` — nothing at all for
  // `'Not Required'`, `'Waived'`, `'Refunded'` or a booking with no deposit. It
  // used to open anyway, on a sheet whose only working control was Close (and,
  // before web tightened the route, on three buttons that quietly corrupted the
  // row). Taking money where no deposit was ever required is the in-person
  // payment path, not this one.
  const isCancelled = booking.status === 'Cancelled';
  const showDepositActions =
    policy.canEdit &&
    (cardHoldState
      ? cardHoldHasActions
      : !isCancelled &&
        (hasSettleableDeposit(booking.deposit_status) || booking.deposit_status === 'Paid'));
  const showRefundBanner =
    !cardHoldState && isCancelled && (booking.deposit_amount_pence ?? 0) > 0;

  // Add-on snapshots + price breakdown (variant/base price + add-ons).
  const addons = booking.addons ?? [];
  const addonsTotal =
    booking.addons_total_price_pence ??
    addons.reduce((sum, addon) => sum + addon.price_pence_at_booking, 0);
  const basePrice = booking.service_variant_price_pence ?? null;
  const totalPrice = basePrice != null ? basePrice + addonsTotal : addons.length ? addonsTotal : null;

  // Attendance — mirrors the web pills/actions.
  const guestConfirmed = !!booking.guest_attendance_confirmed_at;
  const staffConfirmed = !!booking.staff_attendance_confirmed_at;
  const arrived = !!booking.client_arrived_at;
  const attendanceRelevant = !TERMINAL_STATUSES.has(booking.status) || booking.status === 'Completed';
  // Web-parity gating: attendance controls hide on in-progress (Seated/Started),
  // terminal statuses, and walk-ins. Once a booking is started, attendance and
  // arrival are no longer actionable — the lifecycle has moved past them. A
  // `Confirmed` booking also drops the toggle: the "Undo confirm" status revert
  // below already cancels the confirmation, so the duplicate "Unconfirm" goes.
  const showAttendanceConfirmToggle = canShowStaffAttendanceToggle(booking, revertAction?.target);
  const showArrivedToggle =
    !isTable &&
    booking.source !== 'walk-in' &&
    booking.status !== 'Seated' &&
    !TERMINAL_STATUSES.has(booking.status);

  const toggleAttendance = (field: 'staff_attendance_confirmed' | 'client_arrived', next: boolean) => {
    const run = (acceptUnpaid: boolean) => {
      attendance.mutate(
        { [field]: next, ...(acceptUnpaid ? { accept_unpaid: true as const } : {}) },
        {
          onSuccess: () => hapticSuccess(),
          onError: (error) => {
            // Confirming attendance on a Pending booking promotes it to
            // Confirmed, so the server runs the same unpaid guard as Accept.
            if (
              !acceptUnpaid &&
              acceptUnpaidGuard.intercept(booking.id, error, () => run(true))
            ) {
              return;
            }
            toast.error(error instanceof ApiError ? error.message : 'Could not update attendance.');
          },
        },
      );
    };
    run(false);
  };

  // Resend confirmation — two-step (arm → confirm) since Alert is a web no-op.
  const handleResend = () => {
    if (!resendArmed) {
      setResendArmed(true);
      hapticWarning();
      if (resendTimer.current) clearTimeout(resendTimer.current);
      resendTimer.current = setTimeout(() => setResendArmed(false), 4000);
      return;
    }
    setResendArmed(false);
    if (resendTimer.current) clearTimeout(resendTimer.current);
    resend.mutate(undefined, {
      onSuccess: () => toast.success('Confirmation resent to the guest.'),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : 'Could not resend the confirmation.'),
    });
  };

  // Permanent delete (cancelled bookings only) — two-step arm → confirm.
  const handleDelete = () => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      hapticWarning();
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
      deleteTimer.current = setTimeout(() => setDeleteArmed(false), 4000);
      return;
    }
    setDeleteArmed(false);
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    deleteBooking.mutate(undefined, {
      onSuccess: () => {
        hapticSuccess();
        toast.success('Booking deleted.');
        onDeleted?.();
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : 'Could not delete the booking.'),
    });
  };

  // Dietary + occasion are restaurant concepts — only table reservations
  // surface them; appointment bookings show requests/internal/profile notes.
  // Price breakdown for the Payments card: items, totals, deposit, outstanding.
  const priceRows = buildPriceSummary(booking);

  const hasNotes =
    !!booking.special_requests?.trim() ||
    !!booking.internal_notes?.trim() ||
    !!booking.guest?.customer_profile_notes?.trim() ||
    (isTable && (!!booking.dietary_notes?.trim() || !!booking.occasion?.trim()));

  const handleActionPress = (target: BookingStatus, _label: string, destructive?: boolean) => {
    // Web parity: no-show is rejected before the grace window lapses. Mirror the
    // guard here so an armed button can't fire early (the backend also enforces).
    if (target === 'No-Show' && !noShowAllowed) {
      toast.error(
        `No-show can only be marked ${noShowGraceMinutes} minutes after the booking start time.`,
      );
      return;
    }
    if (destructive) {
      if (pendingConfirm === target) {
        if (confirmTimer.current) clearTimeout(confirmTimer.current);
        setPendingConfirm(null);
        track(ANALYTICS_EVENTS.bookingStatusChanged, { to: target });
        onStatusChange(target);
      } else {
        armConfirm(target);
      }
      return;
    }
    track(ANALYTICS_EVENTS.bookingStatusChanged, { to: target });
    onStatusChange(target);
  };

  // Attendance toggles + (optionally) the primary action all live in one card;
  // skip rendering it entirely when there's nothing actionable.
  const showInlinePrimary = showPrimaryAction && !!primaryAction;
  /**
   * The toggle row and the divider beneath it MUST share one condition. They
   * were two copies of the same expression, and only the row's copy gained
   * `showPaymentToolbarAction` when Take payment was added. A Started booking
   * hides both attendance toggles, so the row rendered with Take payment alone
   * while the divider vanished, leaving it flush against Undo start / Cancel.
   */
  const showToolbarRow =
    showArrivedToggle || showAttendanceConfirmToggle || showPaymentToolbarAction;
  // A view-only link has no actions at all (web: the actions bar is hidden).
  const showActionsCard =
    policy.canEdit &&
    (showInlinePrimary ||
      showArrivedToggle ||
      showAttendanceConfirmToggle ||
      showPaymentToolbarAction ||
      !!revertAction ||
      destructiveActions.length > 0);

  const attendanceBadges =
    attendanceRelevant && (guestConfirmed || staffConfirmed || arrived) ? (
      <View style={styles.heroBadges}>
        {guestConfirmed ? <Badge label="Guest confirmed" tone="success" /> : null}
        {staffConfirmed ? <Badge label="Staff confirmed" tone="success" /> : null}
        {arrived ? <Badge label="Arrived" tone="accent" /> : null}
      </View>
    ) : null;

  return (
    <View style={styles.container}>
      {/* A partner's booking says so first, with what the link lets us do (the
          web's banner copy for a view-only or edit-only grant). */}
      {linked ? (
        <View
          style={[
            styles.linkedNote,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}>
          <Badge label="Linked" tone="warning" />
          <Text variant="bodySmall" tone="secondary" style={styles.linkedNoteText}>
            {policy.banner ?? `A booking at ${linked.venueName}.`}
          </Text>
        </View>
      ) : null}

      {/* Hero — identity, then the appointment at a glance, then contact + quick actions */}
      <Card padded={false} style={styles.hero}>
        <View style={[styles.heroAccent, { backgroundColor: statusVisual.backgroundColor }]} />
        <View style={styles.heroInner}>
          <View style={styles.headerRow}>
            <Avatar name={guestName} size={52} />
            <View style={styles.headerText}>
              <View style={styles.guestNameRow}>
                <Text variant="heading" numberOfLines={1} style={styles.guestNameText}>
                  {guestName}
                </Text>
                {openGuestContact ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${guestName} in Contacts`}
                    hitSlop={8}
                    onPress={openGuestContact}
                    style={({ pressed }) => [styles.openContact, { opacity: pressed ? 0.55 : 1 }]}>
                    <SymbolView
                      name={{
                        ios: 'person.crop.circle',
                        android: 'account_circle',
                        web: 'account_circle',
                      }}
                      tintColor={colors.brand}
                      size={20}
                    />
                  </Pressable>
                ) : null}
              </View>
              <Text variant="caption" tone="muted">
                {visitCount > 0
                  ? `${visitCount} previous visit${visitCount === 1 ? '' : 's'}`
                  : 'First visit'}
              </Text>
            </View>
            <StatusPill status={booking.status} isTableReservation={isTable} />
          </View>

          {/* When & what */}
          <View style={[styles.heroBlock, { borderTopColor: colors.border }]}>
            <Text variant="overline" tone="muted">
              {dateLabel}
            </Text>
            <Text variant="title" style={styles.heroTime}>
              {timeRangeLabel}
            </Text>
            {serviceLine ? (
              <Text variant="bodyMedium" tone="secondary">
                {serviceLine}
              </Text>
            ) : null}

            <View style={styles.metaRow}>
              {durationMinutes != null ? (
                <MetaChip
                  icon={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
                  label={formatDurationLabel(durationMinutes)}
                />
              ) : null}
              <MetaChip
                icon={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
                label={partyLabel}
              />
              {modelLabel ? (
                <MetaChip icon={{ ios: 'tag', android: 'sell', web: 'sell' }} label={modelLabel} />
              ) : null}
            </View>

            {/* Above the badges on purpose: for an off-site or online booking, where
                to be outranks the deposit state for whoever is about to travel. */}
            {staffLocation ? (
              <View style={styles.locationCallout}>
                <BookingLocationCallout view={staffLocation} />
              </View>
            ) : null}

            {(cardHoldState?.pill ||
              (!cardHoldState && booking.deposit_status === 'Pending') ||
              showDepositFailed ||
              (isTable && booking.occasion?.trim()) ||
              attendanceBadges) ? (
              <View style={styles.heroBadges}>
                {cardHoldState?.pill ? (
                  <Badge
                    label={cardHoldState.pill.label}
                    tone={CARD_HOLD_BADGE_TONE[cardHoldState.pill.variant]}
                  />
                ) : !cardHoldState && booking.deposit_status === 'Pending' ? (
                  <Badge label="Deposit pending" tone="warning" />
                ) : null}
                {/* Shown even alongside a card-hold pill: a `Failed` hold row is
                    exactly the case staff must not miss, and it is the signal
                    that the Accept guard is about to fire. */}
                {showDepositFailed ? <Badge label="Deposit failed" tone="danger" /> : null}
                {isTable && booking.occasion?.trim() ? (
                  <Badge label={booking.occasion} tone="accent" />
                ) : null}
                {guestConfirmed ? <Badge label="Guest confirmed" tone="success" /> : null}
                {staffConfirmed ? <Badge label="Staff confirmed" tone="success" /> : null}
                {arrived ? <Badge label="Arrived" tone="accent" /> : null}
              </View>
            ) : null}
          </View>

          {/* Contact + quick actions */}
          {guestPhone || guestEmail || canReschedule || canModify || booking.guest_id ? (
            <View style={[styles.heroBlock, { borderTopColor: colors.border }]}>
              {guestPhone ? (
                <ContactRow
                  icon={{ ios: 'phone.fill', android: 'call', web: 'call' }}
                  value={guestPhone}
                  accessibilityLabel={`Call ${guestName}`}
                  onPress={() => void Linking.openURL(`tel:${guestPhone.replace(/\s+/g, '')}`)}
                />
              ) : null}
              {guestEmail ? (
                <ContactRow
                  icon={{ ios: 'envelope.fill', android: 'mail', web: 'mail' }}
                  value={guestEmail}
                  accessibilityLabel={`Email ${guestName}`}
                  onPress={() => void Linking.openURL(`mailto:${guestEmail}`)}
                />
              ) : null}

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.quickActions}>
                {guestPhone ? (
                  <QuickAction
                    icon={{ ios: 'phone.fill', android: 'call', web: 'call' }}
                    label="Call"
                    onPress={() => void Linking.openURL(`tel:${guestPhone.replace(/\s+/g, '')}`)}
                  />
                ) : null}
                {guestEmail ? (
                  <QuickAction
                    icon={{ ios: 'envelope.fill', android: 'mail', web: 'mail' }}
                    label="Email"
                    onPress={() => void Linking.openURL(`mailto:${guestEmail}`)}
                  />
                ) : null}
                {canReschedule ? (
                  <QuickAction
                    icon={{ ios: 'calendar', android: 'event', web: 'event' }}
                    label="Reschedule"
                    onPress={() =>
                      setRescheduleTarget({
                        id: booking.id,
                        guestName,
                        date: booking.booking_date,
                        time: visit ? `${visit.startHm}:00` : booking.booking_time,
                        durationMinutes,
                        visit: visitEdit,
                      })
                    }
                  />
                ) : null}
                {canModify ? (
                  <QuickAction
                    icon={{ ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }}
                    label="Modify"
                    onPress={openModify}
                  />
                ) : null}
                {booking.guest_id && policy.canRebook ? (
                  <QuickAction
                    icon={{ ios: 'arrow.clockwise', android: 'autorenew', web: 'autorenew' }}
                    label="Rebook"
                    onPress={() => {
                      // Pre-select the same service/practitioner/variant (for an
                      // appointment) AND the guest, via the one-shot rebook
                      // bootstrap that /booking/new applies on mount. Falls back to
                      // the guest-id prefill when there's no appointment to repeat.
                      void (async () => {
                        const g = booking.guest;
                        // Mirror openModify's id fallbacks (calendar_id /
                        // service_item_id) so unified-scheduling bookings rebook too.
                        const practitionerId =
                          booking.practitioner_id ?? booking.calendar_id ?? null;
                        const serviceId =
                          booking.appointment_service_id ?? booking.service_item_id ?? null;
                        const hasAppointment = Boolean(practitionerId && serviceId);
                        if (hasAppointment || g) {
                          await writeRebookBootstrap({
                            v: 1,
                            guest: {
                              firstName: g?.first_name ?? undefined,
                              lastName: g?.last_name ?? undefined,
                              email: g?.email ?? null,
                              phone: g?.phone ?? null,
                            },
                            ...(hasAppointment
                              ? {
                                  appointment: {
                                    serviceId: serviceId as string,
                                    practitionerId: practitionerId as string,
                                    variantId: booking.service_variant_id ?? null,
                                    // THIS row's length, not the visit's span:
                                    // rebooking seeds one service, so a visit's
                                    // 135 minutes would propose a 135-minute
                                    // booking of a 60-minute service.
                                    durationMinutes: rowDurationMinutes ?? null,
                                  },
                                }
                              : {}),
                          });
                          // A partner's guest is rebooked at the partner's venue
                          // (web: the rebook form opens over the owner venue).
                          router.push({
                            pathname: '/booking/new',
                            ...(linkedFormParams ? { params: linkedFormParams } : {}),
                          });
                          return;
                        }
                        router.push({
                          pathname: '/booking/new',
                          params: linkedFormParams ?? { guestId: booking.guest_id },
                        });
                      })();
                    }}
                  />
                ) : null}
                {booking.guest_id && policy.ownVenueOnly ? (
                  <QuickAction
                    icon={{ ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }}
                    label="New for guest"
                    onPress={() => {
                      // Blank new booking pre-seeded with ONLY this guest's
                      // contact (no service/practitioner) so staff can pick a
                      // fresh offering. The bootstrap omits `appointment`; the
                      // guest field is the only required part of the payload.
                      void (async () => {
                        const g = booking.guest;
                        await writeRebookBootstrap({
                          v: 1,
                          guest: {
                            firstName: g?.first_name ?? undefined,
                            lastName: g?.last_name ?? undefined,
                            email: g?.email ?? null,
                            phone: g?.phone ?? null,
                          },
                        });
                        router.push({ pathname: '/booking/new' });
                      })();
                    }}
                  />
                ) : null}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Card>

      {/* Status & attendance — primary transition (inline contexts only), then
          arrived/confirm toggles, then a divided revert/destructive row. */}
      {showActionsCard ? (
        <Card>
          {showInlinePrimary && primaryAction ? (
            <Button
              label={primaryAction.label}
              variant="primary"
              customColors={primaryActionColors(primaryAction.target)}
              size="md"
              fullWidth
              loading={actionLoading}
              onPress={() => handleActionPress(primaryAction.target, primaryAction.label)}
              style={styles.primaryAction}
            />
          ) : null}
          {showToolbarRow ? (
            <View style={styles.toolbarGrid}>
              {showPaymentToolbarAction ? (
                <View style={styles.toolbarCell}>
                  <Button
                    label={isPaidInPerson ? 'Paid' : 'Take payment'}
                    variant="secondary"
                    customColors={
                      isPaidInPerson ? ACTION_COLORS.complete : ACTION_COLORS.payment
                    }
                    size="sm"
                    fullWidth
                    onPress={openTakePayment}
                  />
                </View>
              ) : null}
              {showArrivedToggle ? (
                <View style={styles.toolbarCell}>
                  <Button
                    label={arrived ? 'Clear arrived' : 'Arrived'}
                    variant="secondary"
                    customColors={arrived ? undefined : ACTION_COLORS.arrived}
                    size="sm"
                    fullWidth
                    loading={attendance.isPending}
                    onPress={() => toggleAttendance('client_arrived', !arrived)}
                  />
                </View>
              ) : null}
              {showAttendanceConfirmToggle ? (
                <View style={styles.toolbarCell}>
                  <Button
                    label={staffConfirmed ? 'Unconfirm' : 'Confirm'}
                    variant="secondary"
                    customColors={staffConfirmed ? undefined : ACTION_COLORS.confirm}
                    size="sm"
                    fullWidth
                    loading={attendance.isPending}
                    onPress={() => toggleAttendance('staff_attendance_confirmed', !staffConfirmed)}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
          {revertAction || destructiveActions.length > 0 ? (
            <>
              {showInlinePrimary || showToolbarRow ? (
                <View style={[styles.toolbarDivider, { backgroundColor: colors.border }]} />
              ) : null}
              <View style={styles.toolbarGrid}>
                {revertAction ? (
                  <View style={styles.toolbarCell}>
                    <Button
                      label={
                        !revertIsInstant && pendingConfirm === revertAction.target
                          ? 'Tap to confirm'
                          : revertAction.label
                      }
                      variant="ghost"
                      size="sm"
                      fullWidth
                      loading={actionLoading}
                      onPress={() =>
                        handleActionPress(revertAction.target, revertAction.label, !revertIsInstant)
                      }
                    />
                  </View>
                ) : null}
                {destructiveActions.map((action) => {
                  // No-show stays disabled until the venue's grace window lapses.
                  const noShowGated = action.target === 'No-Show' && !noShowAllowed;
                  return (
                    <View key={`${action.target}-${action.label}`} style={styles.toolbarCell}>
                      <Button
                        label={pendingConfirm === action.target ? 'Tap to confirm' : action.label}
                        variant="danger"
                        size="sm"
                        fullWidth
                        disabled={noShowGated}
                        loading={actionLoading}
                        onPress={() =>
                          handleActionPress(action.target, action.label, action.destructive)
                        }
                      />
                    </View>
                  );
                })}
              </View>
              {destructiveActions.some((a) => a.target === 'No-Show') && !noShowAllowed ? (
                <Text variant="caption" tone="muted" style={styles.noShowHint}>
                  No-show can be marked {noShowGraceMinutes} minutes after the start time.
                </Text>
              ) : null}
            </>
          ) : null}
        </Card>
      ) : null}

      {/* Multi-service visit / group booking (web parity, read-only) */}
      {booking.group_booking_id ? (
        <GroupVisitCards
          groupBookingId={booking.group_booking_id}
          currentBookingId={booking.id}
          bookingDate={booking.booking_date}
          personLabel={booking.person_label}
        />
      ) : null}

      {/* Details — secondary facts, collapsed by default (compact-first) */}
      <CollapsibleCard
        title="Details"
        summary={[
          partyLabel,
          cardHoldState
            ? cardHoldState.pill?.label ?? 'Card hold'
            : booking.deposit_status ?? (depositLabel ? 'Deposit' : null),
        ]
          .filter(Boolean)
          .join(' · ')}>
        <View style={styles.details}>
          <DetailRow label="Party" value={partyLabel} />
          {serviceName ? <DetailRow label="Service" value={serviceName} /> : null}
          {practitionerName ? <DetailRow label="With" value={practitionerName} /> : null}
          {modelLabel ? <DetailRow label="Type" value={modelLabel} /> : null}
          {/* Short marker only — the hero callout carries the address itself, and
              repeating it here would give the same text two touch targets. */}
          {staffLocation ? (
            <DetailRow label="Location" value={staffBookingLocationPillLabel(staffLocation.kind)} />
          ) : null}
          {booking.area_name ? <DetailRow label="Area" value={booking.area_name} /> : null}
          {tableNames ? <DetailRow label="Table" value={tableNames} /> : null}
          {cardHoldState ? (
            <DetailRow
              label="Card hold"
              value={cardHoldState.pill?.label ?? cardHoldState.lines[0] ?? 'Card hold'}
            />
          ) : depositLabel || booking.deposit_status ? (
            <DetailRow
              label="Deposit"
              value={
                depositLabel
                  ? `${depositLabel}${booking.deposit_status ? ` · ${booking.deposit_status}` : ''}`
                  : booking.deposit_status ?? ''
              }
            />
          ) : null}
          <DetailRow
            label="Previous visit"
            value={
              booking.guest?.last_visit_date
                ? formatShortDate(booking.guest.last_visit_date)
                : 'None yet'
            }
          />
          <DetailRow label="Visits" value={visitCount > 0 ? String(visitCount) : 'First visit'} />
          {booking.source ? <DetailRow label="Source" value={booking.source} /> : null}
          {booking.checked_in_at ? (
            <DetailRow label="Checked in" value={formatTimelineEventTime(booking.checked_in_at)} />
          ) : null}
          {booking.created_at ? (
            <DetailRow
              label="Created"
              value={`${formatTimelineEventTime(booking.created_at)}${
                booking.created_by_name ? ` · ${booking.created_by_name}` : ''
              }`}
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy booking reference"
            onPress={() => void copyReference()}
            style={styles.detailRow}>
            <Text variant="bodySmall" tone="muted">
              Reference
            </Text>
            <Text variant="bodyMedium" color={colors.brand} style={styles.detailValue}>
              {copiedRef ? 'Copied ✓' : `#${booking.id.slice(0, 8)}`}
            </Text>
          </Pressable>
        </View>

        {addons.length > 0 ? (
          <View style={[styles.details, styles.detailsDivided, { borderTopColor: colors.border }]}>
            <Text variant="caption" tone="muted">
              Add-ons
            </Text>
            {addons.map((addon, index) => (
              <View key={addon.id ?? `${addon.addon_id}-${index}`} style={styles.detailRow}>
                <Text variant="bodySmall" numberOfLines={1} style={styles.addonName}>
                  {addon.addon_name_snapshot}
                  {addon.duration_minutes_at_booking > 0
                    ? ` (+${addon.duration_minutes_at_booking}m)`
                    : ''}
                </Text>
                <Text variant="bodySmall" tone="secondary">
                  {addon.price_pence_at_booking > 0
                    ? `+${formatPence(addon.price_pence_at_booking)}`
                    : 'Free'}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {totalPrice != null && totalPrice > 0 ? (
          <View style={[styles.details, styles.detailsDivided, { borderTopColor: colors.border }]}>
            <View style={styles.detailRow}>
              <Text variant="label">Total</Text>
              <Text variant="label" tone="brand">
                {formatPence(totalPrice)}
              </Text>
            </View>
          </View>
        ) : null}
      </CollapsibleCard>

      {/* Notes — inline-editable booking notes + persistent customer notes & tags.
          animateLayout off: the fields grow on focus, and a height tween there
          fights the keyboard/scroll and strands a white gap (Android/Fabric). */}
      <CollapsibleCard
        title="Notes"
        summary={hasNotes ? 'Added' : 'None'}
        animateLayout={false}>
        <BookingNotesSection
          booking={booking}
          isTable={isTable}
          readOnly={policy.viewOnly}
          customerReadOnly={policy.linked}
        />
      </CollapsibleCard>

      {/* Guest history — other visits, lazy-loaded on first expand. A partner's
          guest is read from our own guests route, which does not know them. */}
      {booking.guest_id && policy.ownVenueOnly ? (
        <CollapsibleCard title="Guest history" lazy>
          <GuestHistoryBody guestId={booking.guest_id} currentBookingId={booking.id} />
        </CollapsibleCard>
      ) : null}

      {/* Compliance — requirement states + guest records (feature-flagged). A
          partner's booking reads its state through the link, read only, when
          the link shares personal details (R24-4). */}
      {linked ? (
        linked.pii ? (
          <LinkedComplianceSection bookingId={booking.id} />
        ) : null
      ) : complianceEnabled ? (
        <ComplianceCard
          bookingId={booking.id}
          guestId={booking.guest?.id ?? booking.guest_id}
          guestEmail={guestEmail}
          guestPhone={guestPhone}
        />
      ) : null}

      {/* Payments & confirmation — deposit state, actions, resend (web parity) */}
      {showDepositActions ||
      hasDeposit ||
      canResend ||
      canTakePayment ||
      priceRows.length > 0 ||
      paymentHistory.length > 0 ||
      booking.cancellation_deadline ? (
        <CollapsibleCard
          title="Payments & confirmation"
          summary={
            // An in-flight card payment outranks everything else on the header:
            // it is the one fact that changes what staff should do next.
            hasPendingCard
              ? pendingCardStale
                ? 'Card payment unconfirmed'
                : 'Card payment processing'
              : cardHoldState
                ? cardHoldState.pill?.label ?? 'Card hold'
                : // The outstanding balance is the most actionable money fact, so it
                  // shows on the collapsed header rather than only inside.
                  booking.balance_due_pence != null && booking.balance_due_pence > 0
                  ? `${formatPence(booking.balance_due_pence)} due`
                  : booking.deposit_status ?? null
          }
          defaultExpanded={
            hasPendingCard ||
            (cardHoldState
              ? cardHoldState.kind === 'awaiting_card' || cardHoldHasActions
              : booking.deposit_status === 'Pending')
          }>
          <View style={styles.manage}>
            {/* What the visit costs, what has been paid, what is left. */}
            <BookingPriceSummary rows={priceRows} />
            {hasPendingCard ? (
              <View style={styles.cardStack}>
                <Text variant="bodyMedium" color={colors.warning}>
                  {pendingCardStale ? 'Card payment unconfirmed' : 'Card payment processing'}
                  {pendingCardPence > 0 ? ` · ${formatPence(pendingCardPence)}` : ''}
                </Text>
                {/* Two registers: "wait a moment" vs "stop waiting, here is where
                    to find out". Nothing in the app can settle a stuck row (see
                    Docs/TAP_TO_PAY.md, "Backend requirements"), so the stale copy
                    has to name the places that can answer. */}
                <Text variant="caption" tone="muted">
                  {pendingCardStale
                    ? 'This started a while ago and has not been confirmed, so it may or may not have gone through. Check the payment history below, or the payment in your Stripe dashboard, before taking another card payment.'
                    : "This usually clears within a few seconds. Don't take another payment until it does. If it is still here in a few minutes, check the payment in your Stripe dashboard before collecting again."}
                </Text>
              </View>
            ) : null}
            {cardHoldState ? (
              <>
                <View style={styles.detailRow}>
                  <Text variant="bodySmall" tone="muted">
                    Card hold
                  </Text>
                  <Text variant="bodyMedium" style={styles.detailValue}>
                    {cardHoldState.pill?.label ?? 'Card hold'}
                  </Text>
                </View>
                {cardHoldState.lines.map((line) => (
                  <Text key={line} variant="caption" tone="muted">
                    {line}
                  </Text>
                ))}
              </>
            ) : hasDeposit ? (
              <View style={styles.detailRow}>
                <Text variant="bodySmall" tone="muted">
                  Deposit
                </Text>
                <Text variant="bodyMedium" style={styles.detailValue}>
                  {depositLabel
                    ? `${depositLabel}${booking.deposit_status ? ` · ${booking.deposit_status}` : ''}`
                    : booking.deposit_status ?? '—'}
                </Text>
              </View>
            ) : null}
            {/* In-person payment state — neutral information, never a nag or a
                required action (§3.4 rule 4). */}
            {paymentStateLabel &&
            (booking.payment_state === 'paid' ||
              booking.payment_state === 'refunded' ||
              booking.payment_state === 'partially_paid') ? (
              <View style={styles.detailRow}>
                <Text variant="bodySmall" tone="muted">
                  Payment
                </Text>
                <Text variant="bodyMedium" style={styles.detailValue}>
                  {paymentStateLabel}
                  {booking.amount_paid_pence
                    ? ` · ${formatPositivePence(booking.amount_paid_pence) ?? ''}`
                    : ''}
                </Text>
              </View>
            ) : null}
            {/* Every ledger row, so end-of-day reconciliation and a failed or
                stuck attempt are both visible without opening a sheet. */}
            <BookingPaymentHistory rows={paymentHistory} />
            {/* Take payment (Tap to Pay / card reader / cash). Optional, per
                appointment: nothing depends on it and nothing auto-opens it. */}
            {canTakePayment ? (
              <Button label="Take payment" fullWidth onPress={openTakePayment} />
            ) : null}
            {/* Beside the ledger it acts on, rather than two unsignposted taps
                behind a button labelled "Paid". */}
            {showInPersonRefund ? (
              <Button
                label="Refund a payment"
                variant="ghost"
                fullWidth
                onPress={openRefund}
              />
            ) : null}
            {showDepositActions ? (
              // No "Take deposit / payment" label any more: since R21-1 this button
              // only appears when the booking HAS a deposit to settle or refund, so
              // the no-deposit label could never be reached. Taking money on a
              // booking that never owed a deposit is the in-person payment button.
              <Button
                label={cardHoldState ? 'Card hold actions' : 'Deposit actions'}
                variant="secondary"
                fullWidth
                onPress={() =>
                  setDepositTarget({
                    id: booking.id,
                    guestName,
                    amountPence: booking.deposit_amount_pence,
                    status: booking.deposit_status,
                    cardHold: cardHoldState,
                  })
                }
              />
            ) : null}
            {canResend ? (
              <Button
                label={resendArmed ? 'Tap to confirm resend' : 'Resend confirmation'}
                variant="secondary"
                fullWidth
                loading={resend.isPending}
                onPress={handleResend}
              />
            ) : null}
            {booking.cancellation_deadline ? (
              <Text variant="caption" tone="muted">
                Guest can self-cancel until{' '}
                {formatTimelineEventTime(booking.cancellation_deadline)}
              </Text>
            ) : null}
          </View>
        </CollapsibleCard>
      ) : null}

      {/* Records: the guest's documents and photos, the same card the contact
          screen shows. They belong to the person, not this booking, so every
          booking for the guest shows the same files (web 2026-09-05). */}
      {guestProfileId && policy.ownVenueOnly ? (
        <DocumentsSection guestId={guestProfileId} collapsible />
      ) : null}

      {/* Refund banner — cancelled booking that still holds a deposit (web parity) */}
      {showRefundBanner ? (
        <Card>
          <View style={styles.cardStack}>
            <Text variant="overline" tone="muted">
              Deposit refund
            </Text>
            <Text variant="bodyMedium">
              {depositLabel ?? formatDeposit(booking.deposit_amount_pence)}
              {booking.deposit_status ? ` · ${booking.deposit_status}` : ''}
            </Text>
            {booking.cancellation_deadline ? (
              <Text variant="caption" tone="muted">
                Guest could self-cancel until{' '}
                {formatTimelineEventTime(booking.cancellation_deadline)}
              </Text>
            ) : null}
            {booking.deposit_status === 'Paid' && policy.canEdit ? (
              <Button
                label="Refund deposit"
                variant="danger"
                fullWidth
                onPress={() =>
                  setDepositTarget({
                    id: booking.id,
                    guestName,
                    amountPence: booking.deposit_amount_pence,
                    status: booking.deposit_status,
                  })
                }
              />
            ) : null}
          </View>
        </Card>
      ) : null}

      {/* Permanent delete — cancelled bookings only (web "Remove from diary");
          a partner's needs the full grant, as the route requires. */}
      {isCancelled && policy.canCancel ? (
        <Card>
          <View style={styles.cardStack}>
            <Text variant="overline" tone="danger">
              Remove from diary
            </Text>
            <Text variant="bodySmall" tone="muted">
              Permanently delete this cancelled booking and its communications log. This can&apos;t
              be undone.
            </Text>
            <Button
              label={deleteArmed ? 'Tap to confirm delete' : 'Delete permanently'}
              variant="danger"
              fullWidth
              loading={deleteBooking.isPending}
              onPress={handleDelete}
            />
          </View>
        </Card>
      ) : null}

      {/* SMS / Email the guest — composer + sent log (web parity) */}
      <MessageGuestSection booking={booking} readOnly={policy.viewOnly} />

      {/* Activity timeline */}
      {timelineEvents.length > 0 ? (
        <CollapsibleCard title="Activity" summary={`${timelineEvents.length} events`}>
          <View style={styles.timeline}>
            {timelineEvents.map((event) => (
              <View key={event.id} style={styles.timelineRow}>
                <View style={styles.timelineMarker}>
                  <View style={[styles.timelineDot, { backgroundColor: colors.accent }]} />
                </View>
                <View style={styles.timelineBody}>
                  <Text variant="bodySmall">{event.title}</Text>
                  {event.detail ? (
                    <Text variant="caption" tone="muted">
                      {event.detail}
                    </Text>
                  ) : null}
                  <Text variant="caption" tone="muted">
                    {formatTimelineEventTime(event.created_at)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </CollapsibleCard>
      ) : null}

      {/* Confirming attendance on a Pending booking is a promotion, so it can
          trip the server's unpaid guard exactly like Accept does. */}
      {acceptUnpaidGuard.sheet}
      <RescheduleSheet target={rescheduleTarget} onClose={() => setRescheduleTarget(null)} />
      <ModifyBookingSheet target={modifyTarget} onClose={() => setModifyTarget(null)} />
      <DepositSheet target={depositTarget} onClose={() => setDepositTarget(null)} />
      {/* The target only carries WHICH booking is open; the balance and ledger
          rows are fed live from the booking so a refetch (or a payment taken
          moments ago) is reflected without closing and reopening the sheet. */}
      <TakePaymentSheet
        target={
          takePaymentTarget
            ? {
                ...takePaymentTarget,
                balanceDuePence: booking.balance_due_pence ?? null,
                payments: booking.payments ?? [],
              }
            : null
        }
        onClose={() => setTakePaymentTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.base,
  },
  linkedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
  },
  linkedNoteText: {
    flex: 1,
  },
  hero: {
    overflow: 'hidden',
    flexDirection: 'row',
  },
  heroAccent: {
    width: 4,
  },
  heroInner: {
    flex: 1,
    padding: spacing.base,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  guestNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  guestNameText: {
    flexShrink: 1,
  },
  openContact: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  heroBlock: {
    marginTop: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  heroTime: {
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  heroBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  locationCallout: {
    marginTop: spacing.md,
  },
  contactLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  contactLineText: {
    flex: 1,
    minWidth: 0,
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.base,
    paddingTop: spacing.md,
    paddingRight: spacing.sm,
  },
  primaryAction: {
    marginBottom: spacing.sm,
  },
  toolbarDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.sm,
  },
  noShowHint: {
    marginTop: spacing.sm,
  },
  details: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  detailsDivided: {
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.base,
  },
  detailValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  toolbarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  toolbarCell: {
    flexBasis: '47%',
    flexGrow: 1,
  },
  timeline: {
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  timelineMarker: {
    width: 12,
    alignItems: 'center',
    paddingTop: 4,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timelineBody: {
    flex: 1,
    gap: 1,
  },
  manage: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  cardStack: {
    gap: spacing.sm,
  },
  addonName: {
    flex: 1,
    minWidth: 0,
  },
  historyBody: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  historyTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
