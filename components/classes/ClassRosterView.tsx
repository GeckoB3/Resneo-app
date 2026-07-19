import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Badge, StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { type ClassSession } from '@/lib/queries/useClassSchedule';
import {
  useCancelClassInstance,
  useCheckInAll,
  useCheckInAttendee,
  useClassInstanceAttendees,
  useNoShowAttendee,
} from '@/lib/queries/useClassesManage';
import { buildAndShareCsv } from '@/lib/reports/csv-export';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import {
  CARD_HOLD_CHARGE_ACTION_LABEL,
  isRosterChargeLinkCandidate,
} from '@/lib/booking/card-hold';
import type { ClassAttendee } from '@/types/classes-manage';

type ClassRosterViewProps = {
  session: ClassSession;
  /** Resolved instructor/calendar column name, when known. */
  instructorName?: string | null;
  onBack: () => void;
  /** Open the booking command-centre (BookingDetailSheet) for an attendee. */
  onOpenBooking: (bookingId: string) => void;
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '£',
  EUR: '€',
  USD: '$',
};

function formatDeposit(row: ClassAttendee, currency: string): string | null {
  // Card-hold states carry no deposit amount (the fee lives on the hold row);
  // show the state by name so staff see the protection at a glance (§9.1).
  if (row.deposit_status === 'Card Held') return 'Card held';
  if (row.deposit_status === 'Charged') return 'No-show fee charged';
  if (row.deposit_amount_pence == null || row.deposit_amount_pence <= 0) return null;
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const amount = `${symbol}${(row.deposit_amount_pence / 100).toFixed(2)}`;
  return row.deposit_status ? `${amount} deposit (${row.deposit_status})` : `${amount} deposit`;
}

/** "14:03" style local time, or null for missing/invalid timestamps. */
function formatTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatCheckedIn(iso: string | null | undefined): string | null {
  const time = formatTime(iso);
  return time ? `Checked in ${time}` : null;
}

/**
 * Roster for one class session — attendees with status, contact, deposit and
 * a reliable check-in timestamp, sourced from the Bearer-capable
 * GET /api/venue/class-instances/[id]/attendees (the bookings/list roster does
 * NOT select `checked_in_at`).
 *
 * Staff can Check in / No-show each attendee and Check in all via the dedicated
 * attendee routes. Those are gated by the class-commerce plan flag, so a 403 is
 * caught and surfaced as a clear, non-fatal note rather than crashing. Tapping
 * an attendee still opens the existing booking detail sheet for confirm / start
 * / cancel over the shared Bearer booking routes.
 */
export function ClassRosterView({
  session,
  instructorName,
  onBack,
  onOpenBooking,
}: ClassRosterViewProps) {
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const toast = useToast();
  const isAdmin = venue?.current_user_role === 'admin';
  const currency = venue?.currency ?? 'GBP';
  const query = useClassInstanceAttendees(session.classInstanceId);

  const checkIn = useCheckInAttendee();
  const noShow = useNoShowAttendee();
  const checkInAll = useCheckInAll();
  const cancelInstance = useCancelClassInstance();

  // Admin cancel-and-notify for the whole session (web parity: this lives in the
  // roster header on web). Distinct from per-attendee no-show: it cancels active
  // bookings, refunds per policy and notifies guests.
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Set once a check-in/no-show route returns 403 (commerce flag off). The
  // attendance actions stay hidden after that so staff aren't offered a
  // capability the plan doesn't include.
  const [commerceLocked, setCommerceLocked] = useState(false);
  // The booking_id with an in-flight attendance mutation (drives a spinner).
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);

  const attendees = useMemo(() => query.data?.attendees ?? [], [query.data]);

  /** Translate a thrown error into a toast; latch the commerce lock on 403. */
  const handleAttendanceError = useCallback(
    (e: unknown, fallback: string) => {
      hapticWarning();
      if (e instanceof ApiError && e.status === 403) {
        setCommerceLocked(true);
        toast.error('Class check-in is not included in this plan. Manage it on the web dashboard.');
        return;
      }
      toast.error(e instanceof ApiError ? e.message : fallback);
    },
    [toast],
  );

  const onCheckIn = useCallback(
    (row: ClassAttendee) => {
      setPendingBookingId(row.booking_id);
      checkIn.mutate(
        { classInstanceId: session.classInstanceId, bookingId: row.booking_id },
        {
          onSuccess: () => {
            hapticSuccess();
            toast.success(`${row.guest_name} checked in.`);
          },
          onError: (e) => handleAttendanceError(e, 'Could not check in this guest.'),
          onSettled: () => setPendingBookingId(null),
        },
      );
    },
    [checkIn, session.classInstanceId, toast, handleAttendanceError],
  );

  const onNoShow = useCallback(
    (row: ClassAttendee) => {
      setPendingBookingId(row.booking_id);
      noShow.mutate(
        { classInstanceId: session.classInstanceId, bookingId: row.booking_id },
        {
          onSuccess: () => {
            hapticSuccess();
            toast.success(`${row.guest_name} marked as no-show.`);
          },
          onError: (e) => handleAttendanceError(e, 'Could not mark this guest as no-show.'),
          onSettled: () => setPendingBookingId(null),
        },
      );
    },
    [noShow, session.classInstanceId, toast, handleAttendanceError],
  );

  const onCheckInAll = useCallback(() => {
    checkInAll.mutate(session.classInstanceId, {
      onSuccess: (result) => {
        hapticSuccess();
        const count = result?.checked_in ?? 0;
        toast.success(count > 0 ? `Checked in ${count} guest${count === 1 ? '' : 's'}.` : 'Everyone is already checked in.');
      },
      onError: (e) => handleAttendanceError(e, 'Could not check everyone in.'),
    });
  }, [checkInAll, session.classInstanceId, toast, handleAttendanceError]);

  const onExport = useCallback(async () => {
    if (attendees.length === 0) {
      toast.info('No attendees to export yet.');
      return;
    }
    try {
      const header = ['Guest', 'Status', 'Party size', 'Checked in', 'Phone', 'Email'];
      const rows = attendees.map((row) => [
        row.guest_name ?? 'Guest',
        row.status ?? '',
        String(row.party_size ?? ''),
        formatTime(row.checked_in_at) ?? '',
        row.guest_phone ?? '',
        row.guest_email ?? '',
      ]);
      const filename = `class-roster-${session.name.replace(/[^a-z0-9]+/gi, '-')}-${session.date}.csv`;
      const result = await buildAndShareCsv(filename, [header, ...rows]);
      if (!result.ok) {
        toast.error('Could not export the roster.');
        return;
      }
      toast.success('Roster export started.');
    } catch {
      toast.error('Could not export the roster.');
    }
  }, [attendees, session.name, session.date, toast]);

  const onCancelSession = useCallback(() => {
    const reason = cancelReason.trim();
    cancelInstance.mutate(
      { classInstanceId: session.classInstanceId, cancel_reason: reason || undefined },
      {
        onSuccess: (result) => {
          hapticSuccess();
          setCancelOpen(false);
          setCancelReason('');
          const n = result.bookings_cancelled ?? 0;
          toast.success(
            n > 0
              ? `Session cancelled. ${n} booking${n === 1 ? '' : 's'} refunded and notified.`
              : 'Session cancelled.',
          );
          // Leave the roster — the session is gone.
          onBack();
        },
        onError: (e) => {
          hapticWarning();
          toast.error(
            e instanceof ApiError ? e.message : 'Could not cancel the session. Please try again.',
          );
        },
      },
    );
  }, [cancelReason, cancelInstance, session.classInstanceId, toast, onBack]);

  const activeAttendees = attendees.filter((row) => row.status !== 'Cancelled');
  const activeSpots = activeAttendees.reduce((sum, row) => sum + (row.party_size || 1), 0);
  const capacityLabel =
    session.capacity != null && session.capacity > 0
      ? `${activeSpots} / ${session.capacity} booked`
      : `${activeSpots} booked`;

  // "Check in all" is useful only when at least one active guest is not yet in.
  // Canonical status is 'No-Show' (web D9 fixed the roster's 'No Show' string).
  const anyCheckable = !commerceLocked && activeAttendees.some(
    (row) => row.status !== 'No-Show' && !row.checked_in_at,
  );

  return (
    <>
    <View style={styles.root}>
      {/* Session header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <IconButton
          icon={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
          accessibilityLabel="Back to timetable"
          tint={colors.brand}
          iconSize={22}
          onPress={onBack}
        />
        <View style={styles.headerText}>
          <Text variant="subheading" numberOfLines={1}>
            {session.name}
          </Text>
          <Text variant="bodySmall" tone="secondary">
            {formatDayHeading(session.date)} · {session.startTime} – {session.endTime}
          </Text>
          {instructorName ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {instructorName}
            </Text>
          ) : null}
        </View>
        <View
          style={[
            styles.capacityChip,
            { backgroundColor: colors.brandSubtle, borderColor: colors.brandBorder },
          ]}>
          <Text variant="caption" color={colors.brand}>
            {capacityLabel}
          </Text>
        </View>
        <IconButton
          icon={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
          accessibilityLabel="Export roster as CSV"
          tint={colors.brand}
          iconSize={20}
          disabled={attendees.length === 0}
          onPress={() => void onExport()}
        />
        {isAdmin ? (
          <IconButton
            icon={{ ios: 'xmark.circle', android: 'cancel', web: 'cancel' }}
            accessibilityLabel="Cancel session and notify guests"
            tint={colors.danger}
            iconSize={20}
            onPress={() => {
              setCancelReason('');
              setCancelOpen(true);
            }}
          />
        ) : null}
      </View>

      {query.isLoading ? (
        <ListSkeleton avatar />
      ) : query.isError ? (
        <View style={styles.stateWrap}>
          <ErrorState
            message={
              query.error instanceof ApiError
                ? query.error.message
                : 'Could not load the roster for this session.'
            }
            onRetry={() => void query.refetch()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
            />
          }>
          {anyCheckable ? (
            <Button
              label="Check in all"
              variant="secondary"
              fullWidth
              loading={checkInAll.isPending}
              onPress={onCheckInAll}
            />
          ) : null}

          {attendees.length === 0 ? (
            <EmptyState
              title="No bookings yet"
              message="When guests book this session, they will appear here."
            />
          ) : (
            attendees.map((row) => {
              const deposit = formatDeposit(row, currency);
              const presence = formatCheckedIn(row.checked_in_at);
              const contact = row.guest_phone ?? row.guest_email ?? null;
              const isCancelled = row.status === 'Cancelled';
              const isNoShow = row.status === 'No-Show';
              const isCheckedIn = !!row.checked_in_at;
              const rowBusy = pendingBookingId === row.booking_id;
              // Attendance buttons only when the action is meaningful and the
              // commerce gate hasn't 403'd.
              const showActions = !commerceLocked && !isCancelled;
              return (
                <Card
                  key={row.booking_id}
                  style={styles.attendeeCard}
                  onPress={() => onOpenBooking(row.booking_id)}
                  accessibilityLabel={`Open booking for ${row.guest_name}`}>
                  <View style={styles.attendeeHeader}>
                    <Text variant="bodyMedium" numberOfLines={1} style={styles.attendeeName}>
                      {row.guest_name}
                    </Text>
                    {isCheckedIn ? <Badge label="Checked in" tone="success" /> : null}
                    <StatusPill status={row.status} />
                  </View>
                  <Text variant="caption" tone="secondary">
                    {row.party_size === 1 ? '1 spot' : `${row.party_size} spots`}
                    {contact ? ` · ${contact}` : ''}
                  </Text>
                  {deposit ? (
                    <Text variant="caption" tone="muted">
                      {deposit}
                    </Text>
                  ) : null}
                  {/* Roster charge affordance (§9.2): the attendees payload lacks
                      the hold row fields, so chargeable-looking rows point admins
                      at the booking detail, where the real gate re-derives. */}
                  {isAdmin &&
                  isRosterChargeLinkCandidate({
                    status: row.status,
                    deposit_status: row.deposit_status ?? null,
                  }) ? (
                    <Text variant="caption" tone="danger">
                      {CARD_HOLD_CHARGE_ACTION_LABEL}: open this booking
                    </Text>
                  ) : null}
                  {presence ? (
                    <Text variant="caption" color={colors.success}>
                      {presence}
                    </Text>
                  ) : null}

                  {showActions ? (
                    <View style={styles.attendeeActions}>
                      <Button
                        label={isCheckedIn ? 'Checked in' : 'Check in'}
                        variant="secondary"
                        size="sm"
                        style={styles.flex1}
                        disabled={isCheckedIn || rowBusy}
                        loading={rowBusy && checkIn.isPending}
                        onPress={() => onCheckIn(row)}
                      />
                      <Button
                        label="No-show"
                        variant="ghost"
                        size="sm"
                        style={styles.flex1}
                        disabled={isNoShow || rowBusy}
                        loading={rowBusy && noShow.isPending}
                        onPress={() => onNoShow(row)}
                      />
                    </View>
                  ) : null}
                </Card>
              );
            })
          )}

          {/* Capability note. */}
          <View
            style={[
              styles.note,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            <Text variant="caption" tone="secondary">
              {commerceLocked
                ? 'Class check-in is not included in this plan — manage attendance on the web dashboard. Tap an attendee to update their booking (confirm, start or cancel).'
                : isAdmin
                  ? 'Tap an attendee to update their booking (confirm, start or cancel). Use the ✕ in the header to cancel the whole session and notify guests.'
                  : 'Tap an attendee to update their booking (confirm, start or cancel).'}
            </Text>
          </View>
          <View style={styles.spacer} />
        </ScrollView>
      )}
    </View>

      {/* Admin cancel-and-notify for the whole session (web parity). A Sheet —
          Alert.alert's confirm is a no-op on web. */}
      <Sheet
        visible={cancelOpen}
        onClose={() => {
          if (!cancelInstance.isPending) setCancelOpen(false);
        }}>
        <View style={styles.cancelSheet}>
          <Text variant="subheading">Cancel session</Text>
          <Text variant="bodySmall" tone="secondary">
            Cancel &quot;{session.name}&quot; on {formatDayHeading(session.date)} at{' '}
            {session.startTime}?{' '}
            {activeSpots > 0
              ? `${activeSpots} booking(s) will be cancelled, refunded per your policy, and the guests notified.`
              : 'This frees the calendar slot and notifies any booked guests.'}
          </Text>
          <Input
            label="Reason for guests"
            optional
            value={cancelReason}
            onChangeText={setCancelReason}
            maxLength={500}
            placeholder="e.g. Instructor unavailable"
          />
          <View style={styles.cancelActions}>
            <Button
              label="Keep session"
              variant="secondary"
              style={styles.flex1}
              disabled={cancelInstance.isPending}
              onPress={() => setCancelOpen(false)}
            />
            <Button
              label="Cancel session"
              variant="danger"
              style={styles.flex1}
              loading={cancelInstance.isPending}
              onPress={onCancelSession}
            />
          </View>
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  capacityChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  content: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  attendeeCard: {
    minHeight: minTouchTarget,
    gap: spacing.xs,
  },
  attendeeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  attendeeName: {
    flex: 1,
  },
  attendeeActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  flex1: {
    flex: 1,
  },
  note: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  spacer: {
    height: spacing.xl,
  },
  cancelSheet: {
    gap: spacing.md,
  },
  cancelActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
