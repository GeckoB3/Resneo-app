import { StyleSheet, View } from 'react-native';

import { timeToMinutes } from '@/components/calendar/grid-layout';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { resolveAppointmentVisit } from '@/lib/booking/appointment-visit';
import { isTerminalVisitStatus } from '@/lib/booking/visit-status';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useUpdateBookingStatus } from '@/lib/queries/useBookingMutations';
import { useGroupVisitBookings, type GroupVisitBookingRow } from '@/lib/queries/useGroupVisit';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import type { BookingStatus } from '@/types/booking-detail';

type GroupVisitCardsProps = {
  groupBookingId: string;
  currentBookingId: string;
  bookingDate: string;
  /** Current booking's person label, shown in the group card header. */
  personLabel?: string | null;
  /**
   * Offer Start / Complete (and their undos) on each service. Start and
   * Complete are per service since web #187, so this card is where they live;
   * the header keeps only the visit-wide actions. Off for a partner's booking
   * without an edit grant, and for table reservations.
   */
  canChangeServiceStatus?: boolean;
  /** The partner venue a linked booking belongs to; its siblings are read across the link. */
  ownerVenueId?: string | null;
};

/** "Massage – Deep tissue + Hot stones" — web `expandedBookingOfferingLine`. */
function offeringLine(row: GroupVisitBookingRow): string {
  const parts: string[] = [];
  if (row.booking_item_name) parts.push(row.booking_item_name);
  if (row.service_variant_name) parts.push(row.service_variant_name);
  let line = parts.join(' – ') || 'Service';
  if (row.booking_addon_labels && row.booking_addon_labels.length > 0) {
    line += ` + ${row.booking_addon_labels.join(' + ')}`;
  }
  return line;
}

function rowMinutes(row: GroupVisitBookingRow): number | null {
  if (!row.booking_time || !row.booking_end_time) return null;
  const start = timeToMinutes(row.booking_time);
  const end = timeToMinutes(row.booking_end_time);
  return end > start ? end - start : null;
}

function formatTotal(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function timeRange(row: GroupVisitBookingRow): string {
  const start = row.booking_time?.slice(0, 5) ?? '';
  const end = row.booking_end_time?.slice(0, 5) ?? '';
  return end ? `${start}–${end}` : start;
}

/**
 * The service-level actions one row offers (web `ExpandedBookingContent`'s
 * per-service Start / Complete / Undo start / Undo complete). Nothing on a
 * cancelled or no-show row, and nothing before the visit is accepted.
 */
function serviceActions(status: string): { label: string; target: BookingStatus; primary: boolean }[] {
  switch (status) {
    case 'Booked':
    case 'Confirmed':
      return [{ label: 'Start', target: 'Seated', primary: true }];
    case 'Seated':
      return [
        { label: 'Complete', target: 'Completed', primary: true },
        { label: 'Undo start', target: 'Booked', primary: false },
      ];
    case 'Completed':
      return [{ label: 'Undo complete', target: 'Seated', primary: false }];
    default:
      return [];
  }
}

/** One service of the visit: its line, its status, and its own Start / Complete. */
function VisitServiceRow({
  row,
  isCurrent,
  canAct,
  showDay,
  showCalendar,
}: {
  row: GroupVisitBookingRow;
  isCurrent: boolean;
  canAct: boolean;
  /** The visit spans days / calendars, so each row says which one it is on. */
  showDay: boolean;
  showCalendar: boolean;
}) {
  const toast = useToast();
  // PATCHes THIS row only: the server writes Seated and Completed to one
  // service (web #187), and the cache helpers invalidate the visit query.
  const update = useUpdateBookingStatus(row.id);
  const actions = canAct && !isTerminalVisitStatus(row.status) ? serviceActions(row.status) : [];
  const minutes = rowMinutes(row);
  return (
    <View style={[styles.row, isCurrent && styles.currentRow]}>
      <View style={styles.rowMain}>
        <View style={styles.rowText}>
          <Text variant="bodySmall" numberOfLines={1}>
            {offeringLine(row)}
            {isCurrent ? ' (this booking)' : ''}
          </Text>
          <Text variant="caption" tone="muted">
            {showDay && row.booking_date ? `${formatDayHeading(row.booking_date)} · ` : ''}
            {timeRange(row)}
            {minutes != null ? ` · ${formatTotal(minutes)}` : ''}
            {showCalendar && row.calendar_name ? ` · ${row.calendar_name}` : ''}
          </Text>
        </View>
        <StatusPill status={row.status} />
      </View>
      {actions.length > 0 ? (
        <View style={styles.rowActions}>
          {actions.map((action) => (
            <Button
              key={action.target}
              label={action.label}
              size="sm"
              variant={action.primary ? 'secondary' : 'ghost'}
              loading={update.isPending}
              disabled={update.isPending}
              accessibilityLabel={`${action.label} ${offeringLine(row)}`}
              onPress={() =>
                update.mutate(action.target, {
                  onSuccess: () => hapticSuccess(),
                  onError: () => {
                    hapticWarning();
                    toast.error(`Could not update ${offeringLine(row)}.`);
                  },
                })
              }
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Multi-service visit ("Services in this visit") and group people booking
 * ("Group booking") cards — web ExpandedBookingContent parity. Driven by the
 * bookings sharing this booking's `group_booking_id`; the visit card carries
 * each service's own Start / Complete.
 */
export function GroupVisitCards({
  groupBookingId,
  currentBookingId,
  bookingDate,
  personLabel,
  canChangeServiceStatus = false,
  ownerVenueId = null,
}: GroupVisitCardsProps) {
  const query = useGroupVisitBookings(groupBookingId, ownerVenueId);
  const rows = query.data ?? [];
  if (rows.length <= 1) return null;

  const isGroupPeopleVisit = rows.some((r) => !!r.person_label?.trim());

  if (isGroupPeopleVisit) {
    const others = rows.filter((r) => r.id !== currentBookingId);
    return (
      <Card>
        <View style={styles.headerRow}>
          <Badge label="Group booking" tone="accent" />
          {personLabel?.trim() ? (
            <Text variant="caption" tone="muted">
              {personLabel}
            </Text>
          ) : null}
        </View>
        {others.length > 0 ? (
          <View style={styles.list}>
            <Text variant="caption" tone="muted">
              Others in this group
            </Text>
            {others.map((row) => (
              <View key={row.id} style={styles.rowMain}>
                <View style={styles.rowText}>
                  <Text variant="bodySmall" numberOfLines={1}>
                    {row.person_label?.trim() || row.guest_name || 'Guest'}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {offeringLine(row)}
                    {row.booking_time ? ` · ${row.booking_time.slice(0, 5)}` : ''}
                  </Text>
                </View>
                <StatusPill status={row.status} />
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    );
  }

  // Multi-service visit: several services for one guest.
  //
  // The total is the visit's wall-clock SPAN, the same number the header shows
  // and the same one the visit is edited by. Summing the services instead gives a
  // different answer whenever a buffer or processing gap sits between two of
  // them, and two totals for one visit on one screen is worse than either. Falls
  // back to the sum only where the resolver declines to call these rows a visit
  // (a party, or cancellations leaving one service standing).
  const visit = resolveAppointmentVisit(rows);
  const spansDays = visit?.spansDays ?? new Set(rows.map((r) => r.booking_date ?? '')).size > 1;
  const spansCalendars =
    visit?.spansCalendars ??
    new Set(rows.map((r) => r.calendar_id ?? r.practitioner_id ?? '')).size > 1;
  // Over several days the span is not a length anyone books; the services are.
  const totalMinutes = spansDays
    ? rows.reduce((sum, row) => sum + (rowMinutes(row) ?? 0), 0)
    : (visit?.totalMinutes ?? rows.reduce((sum, row) => sum + (rowMinutes(row) ?? 0), 0));
  return (
    <Card>
      <Text variant="label">Services in this visit</Text>
      <Text variant="caption" tone="muted">
        {rows.length} services ·{' '}
        {spansDays ? `over ${new Set(rows.map((r) => r.booking_date)).size} days` : formatDayHeading(bookingDate)}
        {totalMinutes > 0 ? ` · ${formatTotal(totalMinutes)}${spansDays ? ' of services' : ' total'}` : ''}
      </Text>
      {canChangeServiceStatus ? (
        <Text variant="caption" tone="muted">
          Start and complete each service here. Confirm, arrived, cancel and no-show
          apply to the whole visit.
        </Text>
      ) : null}
      <View style={styles.list}>
        {rows.map((row) => (
          <VisitServiceRow
            key={row.id}
            row={row}
            isCurrent={row.id === currentBookingId}
            canAct={canChangeServiceStatus}
            showDay={spansDays}
            showCalendar={spansCalendars}
          />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  list: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  row: {
    gap: spacing.xs,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  currentRow: {
    opacity: 0.9,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
});
