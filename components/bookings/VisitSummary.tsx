import { StyleSheet, View } from 'react-native';

import { timeToMinutes } from '@/components/calendar/grid-layout';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import type { AppointmentVisit } from '@/lib/booking/appointment-visit';
import {
  visitHistoryCaption,
  type GuestVisitHistory,
} from '@/lib/booking/guest-visit-history';
import { isTerminalVisitStatus } from '@/lib/booking/visit-status';
import { formatShortDay } from '@/lib/dates/venue-dates';
import { ACTION_COLORS } from '@/lib/booking/booking-action-colors';
import { formatPence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { buildPriceSummary, type DepositBadgeTone } from '@/lib/payments/payment-display';
import { useUpdateBookingStatus } from '@/lib/queries/useBookingMutations';
import {
  partnerLineText,
  useVisitDetail,
  type VisitPartMoney,
  type VisitPartnerLine,
} from '@/lib/queries/useVisitPartnerLines';
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
  /**
   * The guest's history BEHIND this booking — see `guestVisitHistory`. Not the
   * raw `visit_count` / `last_visit_date`: from Arrived onwards those include
   * this very booking, and the line would date the guest's "last visit" to the
   * day you ticked them in.
   */
  guestHistory: GuestVisitHistory;
  /** The deposit / card-hold badges beside the status (only when money is owed, held, charged or failed). */
  badges: VisitSummaryBadge[];
  /** Offer Start / Complete on each row of a multi-service visit. */
  canChangeServiceStatus: boolean;
  /**
   * Narrows that per row: a View only or Hidden person (roles plan §5.11) starts and completes only
   * the services on their own calendar. Omitted, every row follows `canChangeServiceStatus`.
   */
  canChangeRow?: (row: GroupVisitBookingRow) => boolean;
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

/**
 * Start, Complete, Undo start, Undo complete: the service-level lifecycle of
 * one row of a visit, the web's `segmentLifecycleActions` word for word and
 * target for target. The same colours as the panel's own action bar
 * (`bookingDetailActions`, `ACTION_COLORS`), so a row's Start reads as the
 * same act as a single booking's.
 *
 * Undo start returns the service to where it was before Start: Confirmed when
 * its attendance had been confirmed (by staff or by the guest), else Booked.
 * It used to be Confirmed every time, which confirmed a visit nobody had
 * confirmed and wrote a false "Confirmed by staff" (web QA B-4).
 */
function serviceActions(
  status: string,
  wasConfirmed: boolean,
): { label: string; target: BookingStatus; colors?: { background: string; text: string } }[] {
  switch (status) {
    case 'Booked':
    case 'Confirmed':
      return [{ label: 'Start', target: 'Seated', colors: ACTION_COLORS.start }];
    case 'Seated':
      return [
        { label: 'Complete', target: 'Completed', colors: ACTION_COLORS.complete },
        { label: 'Undo start', target: wasConfirmed ? 'Confirmed' : 'Booked' },
      ];
    case 'Completed':
      return [{ label: 'Undo complete', target: 'Seated' }];
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
  const wasConfirmed = Boolean(row.staff_attendance_confirmed_at || row.guest_attendance_confirmed_at);
  const actions = isTerminalVisitStatus(row.status) ? [] : serviceActions(row.status, wasConfirmed);
  if (actions.length === 0) return null;
  return (
    <View style={styles.rowActions}>
      {actions.map((action) => (
        <Button
          key={action.target}
          label={action.label}
          size="sm"
          variant={action.colors ? 'primary' : 'ghost'}
          customColors={action.colors}
          loading={update.isPending}
          disabled={disabledAll || update.isPending}
          accessibilityLabel={`${action.label} ${offeringLine(row)}`}
          onPress={() =>
            update.mutate(action.target, {
              onSuccess: () => hapticSuccess(),
              onError: (error) => {
                hapticWarning();
                // The server's own words when it refused (a no-show on a future
                // visit says why), else a plain fallback (web QA B-4).
                toast.error(error instanceof ApiError ? error.message : `Could not update ${offeringLine(row)}.`);
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
  guestHistory,
  badges,
  canChangeServiceStatus,
  canChangeRow,
  detailHydrating,
}: VisitSummaryProps) {
  const { colors } = useTheme();
  /**
   * A visit across businesses (web split-visit plan 7.3; owner, 2026-11-05): every service the staff
   * member may see, their own business's included when a partner's booking is opened, each with its
   * price, and each business's money. Read again when this booking's status or payment changes.
   */
  const visitDetail = useVisitDetail(
    booking.linked_visit_id,
    `${booking.status}|${booking.payment_state ?? ''}|${booking.amount_paid_pence ?? ''}`,
  );
  /** The opened booking's business: its part is the rows below, with every action on them. */
  const openedVenueId =
    visitDetail?.lines.find((l) => l.booking_id === booking.id)?.venue_id ?? booking.venue_id ?? null;
  /** The visit's services at the other businesses: read-only, never acted on here. */
  const otherPartLines = (visitDetail?.lines ?? []).filter(
    (l) => l.status !== 'Cancelled' && l.booking_id !== booking.id && l.venue_id !== openedVenueId,
  );
  /**
   * The whole visit is on the card: every business's services in time order, and each business's
   * money with who takes it. An older server sends only bare lines, listed as before.
   */
  const crossBusiness = otherPartLines.length > 0 && !visitDetail?.legacy;
  /** The other businesses, each with its services and money, in the order their first service starts. */
  const otherBusinesses = (() => {
    const byVenue = new Map<string, VisitPartnerLine[]>();
    for (const line of crossBusiness ? otherPartLines : []) {
      byVenue.set(line.venue_id, [...(byVenue.get(line.venue_id) ?? []), line]);
    }
    return [...byVenue.entries()].map(([venueId, lines]) => ({
      venueId,
      name: lines[0]!.venue_name,
      own: lines.some((l) => l.own),
      lines,
      money: visitDetail?.parts.find((part) => part.venue_id === venueId) ?? null,
    }));
  })();
  type OtherBusiness = (typeof otherBusinesses)[number];
  const openedStartHm = booking.booking_time?.slice(0, 5) ?? null;
  /** Businesses whose first service starts before the opened booking: drawn above it. */
  const businessesBefore = otherBusinesses.filter(
    (part) =>
      openedStartHm != null &&
      `${part.lines[0]!.booking_date}T${part.lines[0]!.start_time}` < `${booking.booking_date}T${openedStartHm}`,
  );
  const businessesAfter = otherBusinesses.filter((part) => !businessesBefore.includes(part));
  const openedPart: VisitPartMoney | null =
    visitDetail?.parts.find((part) => part.venue_id === openedVenueId) ?? null;
  const openedBusinessName =
    openedPart?.venue_name ?? visitDetail?.lines.find((l) => l.booking_id === booking.id)?.venue_name ?? null;
  const openedIsOwn = openedPart ? openedPart.own : !otherBusinesses.some((part) => part.own);
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
  // The single service's own price: the agreed price (else the live variant price), else the stored total
  // minus its add-ons. Both are snapshots on the booking, so the row and the
  // total below it always agree.
  const singleServicePence = (() => {
    const variant = booking.service_price_snapshot_pence ?? booking.service_variant_price_pence ?? null;
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
    const computed =
      (booking.service_price_snapshot_pence ?? booking.service_variant_price_pence ?? 0) +
      (booking.addons_total_price_pence ?? 0);
    return computed > 0 ? computed : null;
  })();
  /**
   * The deposit, paid and outstanding lines come out of the SAME server snapshot
   * as the total, so they may only be shown together.
   *
   * A modify save seeds this panel from the PATCH response, which carries the new
   * service but not yet its money; until the refetch lands the total reads as
   * unknown while `balance_due_pence` still holds the PREVIOUS service's figure.
   * Printing both put two contradictory facts about one booking side by side —
   * "Total: Not set" beside "Outstanding £55.00" for a £25 service (device test,
   * 2026-09-12). While the numbers are settling the block shows its skeleton and
   * says nothing it would have to take back.
   */
  const moneySettling = detailHydrating && totalPence == null;
  const moneyRows = moneySettling
    ? []
    : buildPriceSummary(booking).filter(
        (row) => row.key === 'deposit' || row.key === 'paid' || row.key === 'balance',
      );
  const showMoney = totalPence != null || moneyRows.length > 0 || (detailHydrating && rows.length > 0);

  const spansDays = !!visit?.spansDays;
  const spansCalendars = !!visit?.spansCalendars;
  /** First start and last end across every business on the day, for a visit across businesses. */
  const wholeVisit = (() => {
    if (!crossBusiness || spansDays) return null;
    const day = booking.booking_date;
    const sameDay = otherPartLines.filter((l) => l.booking_date === day);
    if (sameDay.length === 0) return null;
    const spans = [
      ...rows
        .filter((r) => r.status !== 'Cancelled' && (!r.booking_date || r.booking_date === day))
        .map((r) => ({ start: r.booking_time?.slice(0, 5) ?? null, end: r.booking_end_time?.slice(0, 5) ?? null })),
      ...sameDay.map((l) => ({ start: l.start_time, end: l.end_time })),
    ];
    const starts = spans.map((x) => x.start).filter((v): v is string => Boolean(v)).sort();
    const ends = spans.map((x) => x.end).filter((v): v is string => Boolean(v)).sort();
    const start = starts[0];
    if (!start) return null;
    const end = ends[ends.length - 1] ?? null;
    return {
      label: end ? `${start} – ${end}` : start,
      minutes: end ? timeToMinutes(end) - timeToMinutes(start) : null,
    };
  })();
  const headerTimeLabel = wholeVisit?.label ?? timeLabel;
  const headerMinutes = wholeVisit?.minutes ?? durationMinutes;
  const context = [
    headerMinutes != null && headerMinutes > 0 ? fmtDuration(headerMinutes) : null,
    dateLabel,
    // "First visit" is already the line under the guest's name; say it once.
    // A last-visit date adds something the count there does not, so it stays.
    guestHistory.priorVisits === 0 && !guestHistory.lastVisitDate
      ? null
      : visitHistoryCaption(guestHistory, formatShortDay),
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

  /** One money line under a total: a deposit, what is paid, or what is still owed. */
  const moneyLine = (row: { key: string; label: string; pence?: number | null; note?: string | null }) => {
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
  };

  /** What the whole visit comes to, every business's part included; null while any is unknown. */
  const wholeTotalPence =
    totalPence != null && otherBusinesses.every((part) => part.money?.total_pence != null)
      ? otherBusinesses.reduce((sum, part) => sum + (part.money?.total_pence ?? 0), totalPence)
      : null;

  /** A business's part in the money footer: its name, who takes the payment, and what it comes to. */
  const businessMoneyRow = (key: string, name: string, own: boolean, pence: number | null) => (
    <View key={key} style={[styles.moneyRow, styles.businessMoney]} testID="visit-business-money">
      <View style={styles.flex1}>
        <Text variant="bodyMedium">{own ? `${name} (you)` : name}</Text>
        <Text variant="caption" tone="muted">
          {own ? 'Yours to take' : `${name} takes this payment`}
        </Text>
      </View>
      {pence != null ? (
        <Text variant="bodyMedium" style={styles.tabular}>
          {formatPence(pence)}
        </Text>
      ) : detailHydrating ? (
        <Skeleton height={14} width={48} />
      ) : (
        <Text variant="caption" tone="muted">
          Not set
        </Text>
      )}
    </View>
  );

  /** Another business's part: what it comes to, what it has taken and what it still has to take. */
  const otherBusinessMoney = (part: OtherBusiness) => (
    <View key={part.venueId}>
      {businessMoneyRow(part.venueId, part.name, part.own, part.money?.total_pence ?? null)}
      {part.money && part.money.paid_pence > 0
        ? moneyLine({ key: 'paid', label: 'Paid so far', pence: part.money.paid_pence })
        : null}
      {part.money && part.money.outstanding_pence != null
        ? moneyLine({ key: 'balance', label: 'Outstanding', pence: part.money.outstanding_pence })
        : null}
    </View>
  );

  /** Another business's services: its name, then each service, read-only, with its price. */
  const renderOtherBusiness = (part: OtherBusiness) => (
    <View key={part.venueId} style={[styles.rows, { borderTopColor: colors.border }]} testID="visit-partner-lines">
      <Text variant="caption" tone="muted" style={styles.sectionHeading}>
        {part.own ? `${part.name} (you)` : part.name}
      </Text>
      {part.lines.map((line, index) => {
        const minutes = line.end_time ? timeToMinutes(line.end_time) - timeToMinutes(line.start_time) : null;
        const caption = [
          line.booking_date !== booking.booking_date ? formatShortDay(line.booking_date) : null,
          line.end_time ? `${line.start_time}–${line.end_time}` : line.start_time,
          minutes != null && minutes > 0 ? fmtDuration(minutes) : null,
          line.person_name ? `with ${line.person_name}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <View
            key={line.booking_id}
            style={[styles.row, index > 0 ? [styles.rowDivided, { borderTopColor: colors.border }] : null]}
            testID="visit-partner-line">
            <View style={styles.rowMain}>
              <View style={styles.rowText}>
                <Text variant="bodyMedium" numberOfLines={2}>
                  {line.service_name}
                </Text>
                <Text variant="caption" tone="muted" style={styles.tabular}>
                  {caption}
                </Text>
              </View>
              <View style={styles.rowTrailing}>
                <StatusPill status={line.status} />
                {line.price_pence != null ? (
                  <Text variant="bodyMedium" style={styles.tabular}>
                    {formatPence(line.price_pence)}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );

  return (
    <View
      style={[styles.block, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
      testID="visit-summary">
      {/* Header: when, how long, status and what is owed */}
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <View style={styles.headerText}>
          {headerTimeLabel ? (
            <Text variant="title" style={styles.tabular}>
              {headerTimeLabel}
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

      {businessesBefore.map(renderOtherBusiness)}

      {/* One row per service */}
      {visitLoading && isServiceVisit === false && booking.group_booking_id && rows.length <= 1 ? (
        <View style={[styles.rows, { borderTopColor: colors.border }]}>
          <Skeleton height={14} width="45%" />
          <Skeleton height={12} width="30%" />
        </View>
      ) : rows.length > 0 ? (
        <View style={[styles.rows, { borderTopColor: colors.border }]}>
          {crossBusiness && openedBusinessName ? (
            <Text variant="caption" tone="muted" style={styles.sectionHeading} testID="visit-business-opened">
              {openedIsOwn ? `${openedBusinessName} (you)` : openedBusinessName}
            </Text>
          ) : null}
          {rows.map((row, index) => {
            const minutes = rowMinutes(row);
            const segTime = timeRange(row);
            // A lone service runs for the whole visit, and the header already says when.
            const showSegTime =
              isServiceVisit ||
              crossBusiness ||
              segTime.replace(/\s+/g, '') !== (headerTimeLabel ?? '').replace(/\s+/g, '');
            const caption = [
              spansDays && row.booking_date ? formatShortDay(row.booking_date) : null,
              showSegTime ? segTime : null,
              minutes != null ? fmtDuration(minutes) : null,
              (spansCalendars || crossBusiness || !isServiceVisit) && row.calendar_name ? `with ${row.calendar_name}` : null,
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
                    {isServiceVisit || crossBusiness ? <StatusPill status={row.status} /> : null}
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
                {isServiceVisit && canChangeServiceStatus && (canChangeRow?.(row) ?? true) ? (
                  <ServiceRowActions row={row} disabledAll={false} />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {businessesAfter.map(renderOtherBusiness)}

      {/* An older server's bare lines for the other businesses, as before. */}
      {otherPartLines.length > 0 && !crossBusiness ? (
        <View style={[styles.rows, { borderTopColor: colors.border }]} testID="visit-partner-lines">
          {otherPartLines.map((line) => (
            <Text key={line.booking_id} variant="bodySmall" tone="secondary" style={styles.partnerLine}>
              {partnerLineText(line)}
            </Text>
          ))}
        </View>
      ) : null}

      {/* A visit across businesses: the whole visit, then each business's part and who takes it */}
      {crossBusiness ? (
        <View
          style={[styles.money, { borderTopColor: colors.border, backgroundColor: colors.surface }]}
          testID="visit-money">
          {rows.length === 0 && addons.length > 0 ? <View style={styles.addons}>{addons.map(addonLine)}</View> : null}
          <View style={styles.moneyRow}>
            <Text variant="label" tone="secondary">
              Visit total
            </Text>
            {wholeTotalPence != null ? (
              <Text variant="subheading" style={styles.tabular} testID="visit-whole-total">
                {formatPence(wholeTotalPence)}
              </Text>
            ) : detailHydrating ? (
              <Skeleton height={16} width={56} />
            ) : (
              <Text variant="caption" tone="muted">
                Not set
              </Text>
            )}
          </View>
          {businessesBefore.map(otherBusinessMoney)}
          {businessMoneyRow('opened', openedBusinessName ?? 'This business', openedIsOwn, totalPence)}
          {moneyRows.map(moneyLine)}
          {businessesAfter.map(otherBusinessMoney)}
        </View>
      ) : showMoney ? (
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
          {moneyRows.map(moneyLine)}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  partnerLine: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  sectionHeading: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  businessMoney: {
    marginTop: spacing.xs,
  },
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
