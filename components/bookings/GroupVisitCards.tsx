import { StyleSheet, View } from 'react-native';

import { timeToMinutes } from '@/components/calendar/grid-layout';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { resolveAppointmentVisit } from '@/lib/booking/appointment-visit';
import { useGroupVisitBookings, type GroupVisitBookingRow } from '@/lib/queries/useGroupVisit';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { spacing } from '@/theme/index';

type GroupVisitCardsProps = {
  groupBookingId: string;
  currentBookingId: string;
  bookingDate: string;
  /** Current booking's person label, shown in the group card header. */
  personLabel?: string | null;
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
 * Multi-service visit ("Services in this visit") and group people booking
 * ("Group booking") cards — web ExpandedBookingContent parity. Read-only,
 * driven by the bookings sharing this booking's `group_booking_id`.
 */
export function GroupVisitCards({
  groupBookingId,
  currentBookingId,
  bookingDate,
  personLabel,
}: GroupVisitCardsProps) {
  const query = useGroupVisitBookings(groupBookingId);
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
              <View key={row.id} style={styles.row}>
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

  // Multi-service visit: consecutive services for one guest.
  //
  // The total is the visit's wall-clock SPAN, the same number the header shows
  // and the same one the visit is edited by. Summing the services instead gives a
  // different answer whenever a buffer or processing gap sits between two of
  // them, and two totals for one visit on one screen is worse than either. Falls
  // back to the sum only where the resolver declines to call these rows a visit
  // (a party, or cancellations leaving one service standing).
  const visit = resolveAppointmentVisit(rows);
  const totalMinutes =
    visit?.totalMinutes ?? rows.reduce((sum, row) => sum + (rowMinutes(row) ?? 0), 0);
  return (
    <Card>
      <Text variant="label">Services in this visit</Text>
      <Text variant="caption" tone="muted">
        {rows.length} consecutive services · {formatDayHeading(bookingDate)}
        {totalMinutes > 0 ? ` · ${formatTotal(totalMinutes)} total` : ''}
      </Text>
      <View style={styles.list}>
        {rows.map((row) => (
          <View key={row.id} style={[styles.row, row.id === currentBookingId && styles.currentRow]}>
            <View style={styles.rowText}>
              <Text variant="bodySmall" numberOfLines={1}>
                {offeringLine(row)}
                {row.id === currentBookingId ? ' (this booking)' : ''}
              </Text>
              <Text variant="caption" tone="muted">
                {timeRange(row)}
                {rowMinutes(row) != null ? ` · ${formatTotal(rowMinutes(row)!)}` : ''}
              </Text>
            </View>
            <StatusPill status={row.status} />
          </View>
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
    flexDirection: 'row',
    alignItems: 'center',
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
