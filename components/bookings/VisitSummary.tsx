import { StyleSheet, View } from 'react-native';

import { timeToMinutes } from '@/components/calendar/grid-layout';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import type { AppointmentVisit } from '@/lib/booking/appointment-visit';
import { isTerminalVisitStatus } from '@/lib/booking/visit-status';
import { formatShortDay } from '@/lib/dates/venue-dates';
import { formatPence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { buildPriceSummary, type DepositBadgeTone } from '@/lib/payments/payment-display';
import { useUpdateBookingStatus } from '@/lib/queries/useBookingMutations';
import type { GroupVisitBookingRow } from '@/lib/queries/useGroupVisit';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingDetail, BookingStatus } from '@/types/booking-detail';

/**
 * The visit at a glance, at the top of the booking panel (web #190
 * `ExpandedBookingContent`'s visit summary): when and how long, each service
 * with its time, length, status and price, the total, and what has been paid
 * or is still owed. One block in place of the time line, the separate
 * "Services in this visit" card and the price list, which spread the same
 * facts across three places.
 *
 * Every appointment gets the block, so the panel reads the same whether the
 * client booked one service or four: a single service is listed as the one
 * row it is (Start and Complete stay in the actions bar for it, they would be
 * the same buttons twice); a visit's rows carry their own. Tables, classes and
 * events are not services and produce no rows: the header then shows the
 * time, status and money only.
 */

export type VisitSummaryBadge = { label: string; tone: DepositBadgeTone | 'danger' };

type VisitSummaryProps = {
  booking: BookingDetail;
  /** The resolved multi-service visit, or null for an ordinary booking. */
  visit: AppointmentVisit | null;
  /** The visit's rows (this booking's siblings, itself included), sorted by day then start. */
  visitRows: GroupVisitBookingRow[];
  visitLoading: boolean;
  /** The status the header shows: the visit's derived one, else the booking's. */
  headerStatus: string;
  isTable: boolean;
  /** "Wed 10 Sep", or "Wed 10 Sep – Thu 11 Sep" for a visit across days. */
  dateLabel: string;
  /** The header's time span. */
  timeLabel: string | null;
  durationMinutes: number | null;
  /** The single service's name, when the booking is not a multi-service visit. */
  serviceName: string | null;
  practitionerName: string | null;
  lastVisitDate: string | null;
  /** The deposit / card-hold badges beside the status (only when money is owed, held, charged or failed). */
  badges: VisitSummaryBadge[];
  /** Offer Start / Complete on each row of a multi-service visit. */
  canChangeServiceStatus: boolean;
  /** The money picture is still arriving (summary placeholder shown). */
  detailHydrating: boolean;
};

function fmtDuration(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function rowMinutes(row: { booking_time: string | null; booking_end_time?: string | null }): number | null {
  if (!row.booking_time || !row.booking_end_time) return null;
  const start = timeToMinutes(row.booking_time);
  const end = timeToMinutes(row.booking_end_time);
  return end > start ? end - start : null;
}

function timeRange(row: { booking_time: string | null; booking_end_time?: string | null }): string {
  const start = row.booking_time?.slice(0, 5) ?? '';
  const end = row.booking_end_time?.slice(0, 5) ?? '';
  return end ? `${start}–${end}` : start;
}

/** "Massage – Deep tissue + Hot stones" — web `expandedBookingOfferingLine`. */
function offeringLine(row: { booking_item_name?: string | null; service_variant_name?: string | null; booking_addon_labels?: string[] }): string {
  const parts: string[] = [];
  if (row.booking_item_name) parts.push(row.booking_item_name);
  if (row.service_variant_name) parts.push(row.service_variant_name);
  let line = parts.join(' – ') || 'Service';
  if (row.booking_addon_labels && row.booking_addon_labels.length > 0) {
    line += ` + ${row.booking_addon_labels.join(' + ')}`;
  }
  return line;
}

/** Start, Complete, Undo start, Undo complete: the service-level lifecycle of one row of a visit. */
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

/** One service of a multi-service visit, with its own Start / Complete. */
function ServiceRowActions({ row, disabledAll }: { row: GroupVisitBookingRow; disabledAll: boolean }) {
  const toast = useToast();
  // PATCHes THIS row only: the server writes Seated and Completed to one
  // service (web #187), and the cache helpers invalidate the visit query.
  const update = useUpdateBookingStatus(row.id);
  const actions = isTerminalVisitStatus(row.status) ? [] : serviceActions(row.status);
  if (actions.length === 0) return null;
  return (
    <View style={styles.rowActions}>
      {actions.map((action) => (
        <Button
          key={action.target}
          label={action.label}
          size="sm"
          variant={action.primary ? 'secondary' : 'ghost'}
          loading={update.isPending}
          disabled={disabledAll || update.isPending}
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
  );
}

export function VisitSummary({
  booking,
  visit,
  visitRows,
  visitLoading,
  headerStatus,
  isTable,
  dateLabel,
  timeLabel,
  durationMinutes,
  serviceName,
  practitionerName,
  lastVisitDate,
  badges,
  canChangeServiceStatus,
  detailHydrating,
}: VisitSummaryProps) {
  const { colors } = useTheme();
  const isServiceVisit = !!visit && visitRows.length > 1;
  const isAppointment = !!(
    booking.appointment_service_id ||
    booking.service_item_id ||
    booking.practitioner_id ||
    booking.calendar_id
  );
  const addons = booking.addons ?? [];

  /* ---- The rows ---- */
  const rows: GroupVisitBookingRow[] = isServiceVisit
    ? visitRows
    : isAppointment && !isTable
      ? [
          {
            id: booking.id,
            booking_date: booking.booking_date,
            booking_time: booking.booking_time,
            booking_end_time: booking.booking_end_time ?? null,
            status: booking.status,
            booking_item_name: serviceName,
            service_variant_name: null,
            booking_addon_labels: [],
            calendar_name: practitionerName,
          },
        ]
      : [];

  /* ---- Money ---- */
  const visitPayment = booking.visit_payment ?? null;
  const visitLines = visitPayment && visitPayment.booking_count > 1 ? (visitPayment.lines ?? []) : [];
  const useVisitLinePrices = isServiceVisit && visitLines.length > 1;
  // The single service's own price: the variant price, else the stored total
  // minus its add-ons. Both are snapshots on the booking, so the row and the
  // total below it always agree.
  const singleServicePence = (() => {
    const variant = booking.service_variant_price_pence ?? null;
    if (variant != null) return variant;
    const total = booking.booking_total_price_pence ?? null;
    if (total == null) return null;
    return total - (booking.addons_total_price_pence ?? 0);
  })();
  const rowPricePence = (rowId: string): number | null => {
    if (useVisitLinePrices) return visitLines.find((l) => l.booking_id === rowId)?.total_pence ?? null;
    return rows.length === 1 ? singleServicePence : null;
  };
  // Mirrors buildPriceSummary: the visit's total for a multi-service visit,
  // else the stored total, else variant + add-ons, else genuinely unknown.
  const totalPence = (() => {
    if (visitPayment && visitPayment.booking_count > 1) return visitPayment.total_pence;
    const stored = booking.booking_total_price_pence;
    if (stored != null && stored > 0) return stored;
    const computed = (booking.service_variant_price_pence ?? 0) + (booking.addons_total_price_pence ?? 0);
    return computed > 0 ? computed : null;
  })();
  const moneyRows = buildPriceSummary(booking).filter(
    (row) => row.key === 'deposit' || row.key === 'paid' || row.key === 'balance',
  );
  const showMoney = totalPence != null || moneyRows.length > 0 || (detailHydrating && rows.length > 0);

  const spansDays = !!visit?.spansDays;
  const spansCalendars = !!visit?.spansCalendars;
  const context = [
    durationMinutes != null && durationMinutes > 0 ? fmtDuration(durationMinutes) : null,
    dateLabel,
    lastVisitDate ? `Last visit ${formatShortDay(lastVisitDate)}` : 'First visit',
  ]
    .filter(Boolean)
    .join(' · ');

  const addonLine = (a: (typeof addons)[number], index: number) => (
    <View key={a.id ?? `${a.addon_id}-${index}`} style={styles.addonRow}>
      <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.flex1}>
        {'+ '}
        {a.addon_group_name_snapshot ? `${a.addon_group_name_snapshot}: ` : ''}
        {a.addon_name_snapshot}
        {a.duration_minutes_at_booking > 0 ? ` (+${a.duration_minutes_at_booking} min)` : ''}
      </Text>
      <Text variant="caption" tone="secondary" style={styles.tabular}>
        {formatPence(a.price_pence_at_booking)}
      </Text>
    </View>
  );

  return (
    <View
      style={[styles.block, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
      testID="visit-summary">
      {/* Header: when, how long, status and what is owed */}
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <View style={styles.headerText}>
          {timeLabel ? (
            <Text variant="title" style={styles.tabular}>
              {timeLabel}
            </Text>
          ) : null}
          <Text variant="caption" tone="muted">
            {context}
          </Text>
        </View>
        <View style={styles.headerBadges}>
          {badges.map((b) => (
            <Badge key={b.label} label={b.label} tone={b.tone} />
          ))}
          <StatusPill status={headerStatus} isTableReservation={isTable} />
        </View>
      </View>

      {/* One row per service */}
      {visitLoading && isServiceVisit === false && booking.group_booking_id && rows.length <= 1 ? (
        <View style={[styles.rows, { borderTopColor: colors.border }]}>
          <Skeleton height={14} width="45%" />
          <Skeleton height={12} width="30%" />
        </View>
      ) : rows.length > 0 ? (
        <View style={[styles.rows, { borderTopColor: colors.border }]}>
          {rows.map((row, index) => {
            const minutes = rowMinutes(row);
            const segTime = timeRange(row);
            // A lone service runs for the whole visit, and the header already says when.
            const showSegTime =
              isServiceVisit || segTime.replace(/\s+/g, '') !== (timeLabel ?? '').replace(/\s+/g, '');
            const caption = [
              spansDays && row.booking_date ? formatShortDay(row.booking_date) : null,
              showSegTime ? segTime : null,
              minutes != null ? fmtDuration(minutes) : null,
              (spansCalendars || !isServiceVisit) && row.calendar_name ? `with ${row.calendar_name}` : null,
            ]
              .filter(Boolean)
              .join(' · ');
            const pence = rowPricePence(row.id);
            const isCurrent = isServiceVisit && row.id === booking.id;
            return (
              <View
                key={row.id}
                style={[styles.row, index > 0 ? [styles.rowDivided, { borderTopColor: colors.border }] : null]}>
                <View style={styles.rowMain}>
                  <View style={styles.rowText}>
                    <Text variant="bodyMedium" numberOfLines={2}>
                      {offeringLine(row)}
                      {isCurrent ? ' (this booking)' : ''}
                    </Text>
                    {caption ? (
                      <Text variant="caption" tone="muted" style={styles.tabular}>
                        {caption}
                      </Text>
                    ) : null}
                    {!isServiceVisit && addons.length > 0 ? (
                      <View style={styles.addons}>{addons.map(addonLine)}</View>
                    ) : null}
                  </View>
                  <View style={styles.rowTrailing}>
                    {isServiceVisit ? <StatusPill status={row.status} /> : null}
                    {pence != null ? (
                      <Text variant="bodyMedium" style={styles.tabular}>
                        {formatPence(pence)}
                      </Text>
                    ) : detailHydrating ? (
                      <Skeleton height={14} width={48} />
                    ) : (
                      <Text variant="caption" tone="muted">
                        Price not set
                      </Text>
                    )}
                  </View>
                </View>
                {isServiceVisit && canChangeServiceStatus ? (
                  <ServiceRowActions row={row} disabledAll={false} />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Money: the total, then what has been paid and what is owed */}
      {showMoney ? (
        <View style={[styles.money, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          {rows.length === 0 && addons.length > 0 ? <View style={styles.addons}>{addons.map(addonLine)}</View> : null}
          <View style={styles.moneyRow}>
            <Text variant="label" tone="secondary">
              {isServiceVisit ? 'Visit total' : 'Total'}
            </Text>
            {totalPence != null ? (
              <Text variant="subheading" style={styles.tabular}>
                {formatPence(totalPence)}
              </Text>
            ) : detailHydrating ? (
              <Skeleton height={16} width={56} />
            ) : (
              <Text variant="caption" tone="muted">
                Not set
              </Text>
            )}
          </View>
          {moneyRows.map((row) => {
            const isBalance = row.key === 'balance';
            const owed = isBalance && row.pence != null && row.pence > 0;
            const settled = isBalance && row.pence === 0;
            return (
              <View key={row.key} style={styles.moneyRow}>
                <Text variant="bodySmall" tone={isBalance ? 'secondary' : 'muted'}>
                  {row.label}
                </Text>
                <Text
                  variant="bodySmall"
                  color={owed ? colors.warning : settled ? colors.success : undefined}
                  tone={owed || settled ? undefined : isBalance ? 'muted' : 'secondary'}
                  style={styles.tabular}>
                  {row.pence != null ? formatPence(row.pence) : (row.note ?? '')}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerText: {
    flex: 1,
    minWidth: 140,
    gap: 2,
  },
  headerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'flex-end',
  },
  rows: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  // The status pill and the price on one line, pill first (owner's ask); the
  // price wraps under the pill only when the row is too narrow for both.
  rowTrailing: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    flexShrink: 0,
    maxWidth: '55%',
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  addons: {
    marginTop: 2,
    gap: 1,
  },
  addonRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  money: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  moneyRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
