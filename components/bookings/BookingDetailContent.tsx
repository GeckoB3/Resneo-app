import * as Clipboard from 'expo-clipboard';
import { format, parseISO } from 'date-fns';
import { useRouter, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { ComplianceCard } from '@/components/bookings/ComplianceCard';
import { DepositSheet, type DepositTarget } from '@/components/bookings/DepositSheet';
import { EditBookingSheet, type EditBookingTarget } from '@/components/bookings/EditBookingSheet';
import { GroupVisitCards } from '@/components/bookings/GroupVisitCards';
import {
  ModifyBookingSheet,
  type ModifyBookingTarget,
} from '@/components/bookings/ModifyBookingSheet';
import { useScrollIntoViewOnFocus } from '@/components/bookings/sheet-scroll-context';
import { RescheduleSheet, type RescheduleTarget } from '@/components/calendar/RescheduleSheet';
import { timeToMinutes } from '@/components/calendar/grid-layout';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, StatusPill, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { ACTION_COLORS, primaryActionColors } from '@/lib/booking/booking-action-colors';
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
  useSendBookingMessage,
  useSetBookingAttendance,
} from '@/lib/queries/useBookingMutations';
import { useGuestDetail } from '@/lib/queries/useGuestDetail';
import { useUpdateGuest } from '@/lib/queries/useGuestMutations';
import { useManagedServices } from '@/lib/queries/useServicesManage';
import {
  canShowCancelStaffAttendanceConfirmationAction,
  canShowConfirmStaffAttendanceConfirmationAction,
} from '@/lib/booking/booking-staff-indicators';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
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

/** "14:00 – 15:00" or just the start time when there's no end. */
function formatBookingTimeRange(time: string, endTime?: string | null): string {
  const start = time.slice(0, 5);
  if (endTime?.trim()) {
    return `${start} – ${endTime.slice(0, 5)}`;
  }
  return start;
}

const formatDeposit = formatPositivePence;

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

/** Subtle, icon-led fact pill used along the hero's meta row. */
function MetaChip({ icon, label }: { icon: SymbolName; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.metaChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <SymbolView name={icon} tintColor={colors.textSecondary} size={13} />
      <Text variant="caption" tone="secondary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Circular icon + label — the row of quick actions under the contact block. */
function QuickAction({
  icon,
  label,
  onPress,
  tint,
}: {
  icon: SymbolName;
  label: string;
  onPress: () => void;
  tint?: string;
}) {
  const { colors } = useTheme();
  const color = tint ?? colors.brand;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, { opacity: pressed ? 0.55 : 1 }]}>
      <View style={[styles.quickActionIcon, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SymbolView name={icon} tintColor={color} size={20} />
      </View>
      <Text variant="caption" tone="secondary" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
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
  const detail = useGuestDetail(guestId, { bookingHistoryLimit: 10 });

  const history = (detail.data?.booking_history ?? [])
    .filter((row) => row.id !== currentBookingId)
    .slice(0, 5);

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
            <StatusPill
              status={row.status}
              isTableReservation={row.booking_model === 'table_reservation'}
            />
          </Pressable>
        ))
      )}
      <Button
        label="View contact"
        variant="ghost"
        size="sm"
        onPress={() => router.push(`/client/${guestId}` as Href)}
      />
    </View>
  );
}

function NoteBlock({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) {
    return null;
  }
  return (
    <View style={styles.noteBlock}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="bodySmall">{value}</Text>
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

/** Service delivery location — "Online" or the client's address (web parity). */
function locationLabel(booking: BookingDetail): string | null {
  if (booking.location_type === 'online') return 'Online';
  if (booking.location_type === 'client_address' || booking.client_address_line1) {
    const parts = [
      booking.client_address_line1,
      booking.client_address_line2,
      booking.client_address_city,
      booking.client_address_postcode,
    ].filter((p): p is string => !!p?.trim());
    return parts.length > 0 ? parts.join(', ') : "Client's address";
  }
  return null;
}

/** Web parity: green for delivered, red for failures, amber while pending. */
function commStatusTone(status: string): BadgeTone {
  const s = status.toLowerCase();
  if (s === 'sent' || s === 'delivered') return 'success';
  if (s === 'failed' || s === 'bounced' || s === 'error') return 'danger';
  return 'warning';
}

type MessageChannel = 'email' | 'sms' | 'both';

/**
 * Inline SMS/email compose — mirrors the web's guest-communications
 * accordion: channel selector, message box, send with inline feedback.
 */
function MessageGuestCompose({
  bookingId,
  guestEmail,
  guestPhone,
}: {
  bookingId: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
}) {
  const sendMessage = useSendBookingMessage(bookingId);
  const hasEmail = !!guestEmail?.trim();
  const hasPhone = !!guestPhone?.trim();
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState<MessageChannel>(hasEmail ? 'email' : 'sms');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null,
  );
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { ref: composeRef, handleFocus } = useScrollIntoViewOnFocus();

  const showFeedback = (tone: 'success' | 'danger', text: string) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback({ tone, text });
    // Web parity: success/error notices auto-dismiss after 8s.
    feedbackTimer.current = setTimeout(() => setFeedback(null), 8000);
  };

  const channels: { value: MessageChannel; label: string; enabled: boolean }[] = [
    { value: 'email', label: 'Email', enabled: hasEmail },
    { value: 'sms', label: 'SMS', enabled: hasPhone },
    { value: 'both', label: 'Both', enabled: hasEmail && hasPhone },
  ];

  const handleSend = () => {
    const text = message.trim();
    if (!text) return;
    sendMessage.mutate(
      { message: text, channel },
      {
        onSuccess: () => {
          hapticSuccess();
          setMessage('');
          showFeedback(
            'success',
            channel === 'both'
              ? 'Message sent by email and SMS.'
              : channel === 'sms'
                ? 'SMS sent to the guest.'
                : 'Email sent to the guest.',
          );
        },
        onError: (error) => {
          hapticWarning();
          showFeedback(
            'danger',
            error instanceof ApiError ? error.message : 'Could not send the message.',
          );
        },
      },
    );
  };

  return (
    <View style={styles.composeBlock} ref={composeRef}>
      <View style={styles.composeChannels}>
        {channels
          .filter((c) => c.enabled)
          .map((c) => (
            <Chip
              key={c.value}
              label={c.label}
              selected={channel === c.value}
              onPress={() => setChannel(c.value)}
            />
          ))}
      </View>
      <Input
        placeholder="Write a message to the guest…"
        value={message}
        onChangeText={setMessage}
        onFocus={handleFocus}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />
      {feedback ? (
        <Text variant="bodySmall" tone={feedback.tone}>
          {feedback.text}
        </Text>
      ) : null}
      <Button
        label={sendMessage.isPending ? 'Sending…' : 'Send message'}
        variant="secondary"
        size="sm"
        fullWidth
        loading={sendMessage.isPending}
        disabled={!message.trim() || sendMessage.isPending}
        onPress={handleSend}
      />
    </View>
  );
}

/** Guest tags with inline add/remove — mirrors the web GuestTagsEditor. */
function GuestTagsEditor({ guestId, tags }: { guestId: string; tags: string[] }) {
  const { colors } = useTheme();
  const toast = useToast();
  const update = useUpdateGuest(guestId);
  const [draft, setDraft] = useState('');
  const { ref: tagRef, handleFocus } = useScrollIntoViewOnFocus();

  const commit = (next: string[]) => {
    update.mutate(
      { tags: next },
      {
        onError: (error) => {
          toast.error(error instanceof ApiError ? error.message : 'Could not update tags.');
        },
      },
    );
  };

  const addTag = () => {
    const tag = draft.trim();
    if (!tag) return;
    setDraft('');
    if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    commit([...tags, tag]);
  };

  return (
    <View style={styles.tagsBlock} ref={tagRef}>
      <Text variant="caption" tone="muted">
        Tags
      </Text>
      {tags.length > 0 ? (
        <View style={styles.tagsRow}>
          {tags.map((tag) => (
            <Pressable
              key={tag}
              accessibilityRole="button"
              accessibilityLabel={`Remove tag ${tag}`}
              onPress={() => commit(tags.filter((t) => t !== tag))}
              style={({ pressed }) => [
                styles.tagPill,
                { backgroundColor: colors.brandSubtle, opacity: pressed ? 0.6 : 1 },
              ]}>
              <Text variant="caption" color={colors.brand}>
                {tag} ×
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.tagAddRow}>
        <View style={styles.tagInput}>
          <Input
            placeholder="Add tag"
            value={draft}
            onChangeText={setDraft}
            onFocus={handleFocus}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={addTag}
          />
        </View>
        <Button
          label="Add"
          variant="secondary"
          size="sm"
          onPress={addTag}
          loading={update.isPending}
          disabled={!draft.trim()}
        />
      </View>
    </View>
  );
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
}: BookingDetailContentProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { featureFlags } = useVenueContext();
  // Resolve the service name from the staff service list when neither the detail
  // nor the list row supplied it (covers entry points other than the bookings
  // list — calendar, contacts, the full-screen route). Cached + staff-readable.
  const managedServices = useManagedServices();
  const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null);
  const [modifyTarget, setModifyTarget] = useState<ModifyBookingTarget | null>(null);
  const [depositTarget, setDepositTarget] = useState<DepositTarget | null>(null);
  const [editTarget, setEditTarget] = useState<EditBookingTarget | null>(null);
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
  const deleteBooking = useDeleteBooking(booking.id);

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
  const isTable = isTableReservationBooking(booking);

  const openEdit = () =>
    setEditTarget({
      id: booking.id,
      guestFirstName: booking.guest?.first_name ?? '',
      guestLastName: booking.guest?.last_name ?? '',
      guestPhone: booking.guest?.phone ?? '',
      guestEmail: booking.guest?.email ?? '',
      specialRequests: booking.special_requests ?? '',
      dietaryNotes: booking.dietary_notes ?? '',
      occasion: booking.occasion ?? '',
      internalNotes: booking.internal_notes ?? '',
      isTableReservation: isTable,
    });

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
  const canReschedule = !TERMINAL_STATUSES.has(booking.status);

  // Booked length — feeds the duration stepper on the reschedule sheet.
  const startMinutes = timeToMinutes(booking.booking_time);
  const endMinutes = booking.booking_end_time ? timeToMinutes(booking.booking_end_time) : null;
  const durationMinutes =
    endMinutes != null && endMinutes > startMinutes ? endMinutes - startMinutes : null;

  const communications = booking.communications ?? [];

  // Hero facts — the "what & when" surfaced directly under the guest header so
  // the most important info is visible before any action is taken.
  const practitionerName = booking.practitioner_name?.trim() || null;
  const dateLabel = formatBookingDateLabel(booking.booking_date, booking.booking_time);
  const timeRangeLabel = formatBookingTimeRange(booking.booking_time, booking.booking_end_time);
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
  const serviceLine = [
    serviceName,
    practitionerName ? `with ${practitionerName}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const location = locationLabel(booking);
  const locationIcon: SymbolName =
    booking.location_type === 'online'
      ? { ios: 'video.fill', android: 'videocam', web: 'videocam' }
      : { ios: 'mappin.and.ellipse', android: 'place', web: 'place' };
  const statusVisual = bookingStatusVisualForKey(booking.status);

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
    ['Pending', 'Booked', 'Confirmed', 'Seated'].includes(booking.status);
  const complianceEnabled =
    featureFlags?.resolved?.compliance_records_enabled === true &&
    !!booking.guest &&
    !!(booking.appointment_service_id || booking.service_item_id);

  const openModify = () =>
    setModifyTarget({
      id: booking.id,
      guestName,
      date: booking.booking_date,
      time: booking.booking_time,
      durationMinutes,
      practitionerId: booking.calendar_id ?? booking.practitioner_id ?? null,
      serviceId: booking.appointment_service_id ?? booking.service_item_id ?? null,
      usesServiceItem: !booking.appointment_service_id && !!booking.service_item_id,
      serviceVariantId: booking.service_variant_id ?? null,
    });

  const primaryAction = actions.find((a) => a.kind === 'primary');
  const revertAction = actions.find((a) => a.kind === 'revert');
  const destructiveActions = actions.filter((a) => a.kind === 'destructive');
  const timelineEvents = bookingTimelineEventsForDisplay(booking.events ?? []);

  const guestEmail = booking.guest?.email?.trim();
  const guestPhone = booking.guest?.phone?.trim();
  const canMessage = !!guestEmail || !!guestPhone;
  const canResend = !!guestEmail;
  const hasDeposit = booking.deposit_amount_pence != null || !!booking.deposit_status;
  // Web parity: deposit actions (send link / record cash / waive / refund) show
  // whenever the booking is active; cancelled bookings instead get a refund
  // banner + a permanent-delete card.
  const isCancelled = booking.status === 'Cancelled';
  const showDepositActions = !isCancelled;
  const showRefundBanner = isCancelled && (booking.deposit_amount_pence ?? 0) > 0;

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
  // arrival are no longer actionable — the lifecycle has moved past them.
  const showAttendanceConfirmToggle =
    canShowConfirmStaffAttendanceConfirmationAction(booking) ||
    canShowCancelStaffAttendanceConfirmationAction(booking);
  const showArrivedToggle =
    !isTable &&
    booking.source !== 'walk-in' &&
    booking.status !== 'Seated' &&
    !TERMINAL_STATUSES.has(booking.status);

  const toggleAttendance = (field: 'staff_attendance_confirmed' | 'client_arrived', next: boolean) => {
    attendance.mutate(
      { [field]: next },
      {
        onSuccess: () => hapticSuccess(),
        onError: (error) => {
          toast.error(error instanceof ApiError ? error.message : 'Could not update attendance.');
        },
      },
    );
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
  const hasNotes =
    !!booking.special_requests?.trim() ||
    !!booking.internal_notes?.trim() ||
    !!booking.guest?.customer_profile_notes?.trim() ||
    (isTable && (!!booking.dietary_notes?.trim() || !!booking.occasion?.trim()));

  const handleActionPress = (target: BookingStatus, _label: string, destructive?: boolean) => {
    if (destructive) {
      if (pendingConfirm === target) {
        if (confirmTimer.current) clearTimeout(confirmTimer.current);
        setPendingConfirm(null);
        onStatusChange(target);
      } else {
        armConfirm(target);
      }
      return;
    }
    onStatusChange(target);
  };

  // Attendance toggles + (optionally) the primary action all live in one card;
  // skip rendering it entirely when there's nothing actionable.
  const showInlinePrimary = showPrimaryAction && !!primaryAction;
  const showActionsCard =
    showInlinePrimary ||
    showArrivedToggle ||
    showAttendanceConfirmToggle ||
    !!revertAction ||
    destructiveActions.length > 0;

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
      {/* Hero — identity, then the appointment at a glance, then contact + quick actions */}
      <Card padded={false} style={styles.hero}>
        <View style={[styles.heroAccent, { backgroundColor: statusVisual.backgroundColor }]} />
        <View style={styles.heroInner}>
          <View style={styles.headerRow}>
            <Avatar name={guestName} size={52} />
            <View style={styles.headerText}>
              <Text variant="heading" numberOfLines={1}>
                {guestName}
              </Text>
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
              {location ? <MetaChip icon={locationIcon} label={location} /> : null}
              {modelLabel ? (
                <MetaChip icon={{ ios: 'tag', android: 'sell', web: 'sell' }} label={modelLabel} />
              ) : null}
            </View>

            {(booking.deposit_status === 'Pending' ||
              (isTable && booking.occasion?.trim()) ||
              attendanceBadges) ? (
              <View style={styles.heroBadges}>
                {booking.deposit_status === 'Pending' ? (
                  <Badge label="Deposit pending" tone="warning" />
                ) : null}
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
                        time: booking.booking_time,
                        durationMinutes,
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
                {booking.guest_id ? (
                  <QuickAction
                    icon={{ ios: 'arrow.clockwise', android: 'autorenew', web: 'autorenew' }}
                    label="Rebook"
                    onPress={() =>
                      router.push({
                        pathname: '/booking/new',
                        params: { guestId: booking.guest_id },
                      })
                    }
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
          {showArrivedToggle || showAttendanceConfirmToggle ? (
            <View style={styles.toolbarGrid}>
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
              {showInlinePrimary || showArrivedToggle || showAttendanceConfirmToggle ? (
                <View style={[styles.toolbarDivider, { backgroundColor: colors.border }]} />
              ) : null}
              <View style={styles.toolbarGrid}>
                {revertAction ? (
                  <View style={styles.toolbarCell}>
                    <Button
                      label={
                        pendingConfirm === revertAction.target ? 'Tap to confirm' : revertAction.label
                      }
                      variant="ghost"
                      size="sm"
                      fullWidth
                      loading={actionLoading}
                      onPress={() => handleActionPress(revertAction.target, revertAction.label, true)}
                    />
                  </View>
                ) : null}
                {destructiveActions.map((action) => (
                  <View key={`${action.target}-${action.label}`} style={styles.toolbarCell}>
                    <Button
                      label={pendingConfirm === action.target ? 'Tap to confirm' : action.label}
                      variant="danger"
                      size="sm"
                      fullWidth
                      loading={actionLoading}
                      onPress={() => handleActionPress(action.target, action.label, action.destructive)}
                    />
                  </View>
                ))}
              </View>
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
        summary={[partyLabel, booking.deposit_status ?? (depositLabel ? 'Deposit' : null)]
          .filter(Boolean)
          .join(' · ')}>
        <View style={styles.details}>
          <DetailRow label="Party" value={partyLabel} />
          {serviceName ? <DetailRow label="Service" value={serviceName} /> : null}
          {practitionerName ? <DetailRow label="With" value={practitionerName} /> : null}
          {modelLabel ? <DetailRow label="Type" value={modelLabel} /> : null}
          {location ? <DetailRow label="Location" value={location} /> : null}
          {booking.area_name ? <DetailRow label="Area" value={booking.area_name} /> : null}
          {tableNames ? <DetailRow label="Table" value={tableNames} /> : null}
          {depositLabel || booking.deposit_status ? (
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

      {/* Notes — expanded when there's content, tucked away otherwise */}
      <CollapsibleCard title="Notes" summary={hasNotes ? null : 'None'} defaultExpanded={hasNotes}>
        <View style={styles.notesHeaderRow}>
          <Button label="Edit" variant="ghost" size="sm" onPress={openEdit} />
        </View>
        {hasNotes ? (
          <View style={styles.notes}>
            <NoteBlock label="Special requests" value={booking.special_requests} />
            {isTable ? <NoteBlock label="Dietary" value={booking.dietary_notes} /> : null}
            <NoteBlock label="Internal" value={booking.internal_notes} />
            <NoteBlock label="Guest profile" value={booking.guest?.customer_profile_notes} />
          </View>
        ) : (
          <Text variant="bodySmall" tone="muted" style={styles.notes}>
            No notes for this booking.
          </Text>
        )}
        {booking.guest ? (
          <GuestTagsEditor guestId={booking.guest.id} tags={booking.guest.tags ?? []} />
        ) : null}
      </CollapsibleCard>

      {/* Guest history — other visits, lazy-loaded on first expand */}
      {booking.guest_id ? (
        <CollapsibleCard title="Guest history" lazy>
          <GuestHistoryBody guestId={booking.guest_id} currentBookingId={booking.id} />
        </CollapsibleCard>
      ) : null}

      {/* Compliance — requirement states + guest records (feature-flagged) */}
      {complianceEnabled ? (
        <ComplianceCard
          bookingId={booking.id}
          guestId={booking.guest?.id ?? booking.guest_id}
          guestEmail={guestEmail}
          guestPhone={guestPhone}
        />
      ) : null}

      {/* Payments & confirmation — deposit state, actions, resend (web parity) */}
      {showDepositActions || hasDeposit || canResend || booking.cancellation_deadline ? (
        <CollapsibleCard
          title="Payments & confirmation"
          summary={booking.deposit_status ?? null}
          defaultExpanded={booking.deposit_status === 'Pending'}>
          <View style={styles.manage}>
            {hasDeposit ? (
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
            {showDepositActions ? (
              <Button
                label={hasDeposit ? 'Deposit actions' : 'Take deposit / payment'}
                variant="secondary"
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
            {booking.deposit_status === 'Paid' ? (
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

      {/* Permanent delete — cancelled bookings only (web "Remove from diary") */}
      {isCancelled ? (
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

      {/* SMS / Email the guest — compose + sent log (web accordion parity) */}
      {canMessage || communications.length > 0 ? (
        <CollapsibleCard
          title="SMS / Email guest"
          summary={communications.length > 0 ? `${communications.length} sent` : null}>
          {canMessage ? (
            <MessageGuestCompose
              bookingId={booking.id}
              guestEmail={guestEmail}
              guestPhone={guestPhone}
            />
          ) : null}
          <View style={styles.commList}>
            {communications.length === 0 ? (
              <Text variant="bodySmall" tone="muted">
                No messages sent to this guest yet.
              </Text>
            ) : null}
            {communications.map((row) => (
              <View key={row.id} style={[styles.commRow, { borderBottomColor: colors.border }]}>
                <View style={styles.commHeader}>
                  <Badge label={(row.channel ?? '').toUpperCase()} tone="brand" />
                  <Badge label={row.status} tone={commStatusTone(row.status ?? '')} />
                </View>
                <Text variant="bodySmall">{(row.message_type ?? '').replace(/_/g, ' ')}</Text>
                {row.recipient ? (
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {row.recipient}
                  </Text>
                ) : null}
                <Text variant="caption" tone="muted">
                  {formatTimelineEventTime(row.created_at)}
                </Text>
                {row.error_message ? (
                  <Text variant="caption" tone="danger">
                    {row.error_message}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </CollapsibleCard>
      ) : null}

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

      <RescheduleSheet target={rescheduleTarget} onClose={() => setRescheduleTarget(null)} />
      <ModifyBookingSheet target={modifyTarget} onClose={() => setModifyTarget(null)} />
      <DepositSheet target={depositTarget} onClose={() => setDepositTarget(null)} />
      <EditBookingSheet target={editTarget} onClose={() => setEditTarget(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.base,
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
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
  },
  heroBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
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
  quickAction: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 64,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryAction: {
    marginBottom: spacing.sm,
  },
  toolbarDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.sm,
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
  notesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  notes: {
    marginTop: spacing.sm,
  },
  noteBlock: {
    gap: 2,
    marginBottom: spacing.sm,
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
  tagsBlock: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  tagAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tagInput: {
    flex: 1,
  },
  composeBlock: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  composeChannels: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  commList: {
    marginTop: spacing.sm,
  },
  commRow: {
    gap: 2,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: 2,
  },
});
