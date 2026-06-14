/**
 * HistorySection — date-range-driven historical analytics for the Reports page.
 *
 * Web parity: bookings trend over time, deposits collected over time, and
 * client lifetime value (top clients by lifetime deposits), each with CSV
 * export. All data comes from Bearer-capable routes:
 *   - GET /api/venue/bookings/list?from=&to=&view=calendar  (trend)
 *   - GET /api/venue/guests?sort=paid_deposit_desc          (lifetime value)
 * Class-commerce KPIs are cookie-only on the web (/api/venue/class-commerce-reports
 * uses bare createClient()), so class venues get an inline web-dashboard note.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SvgBarChart } from '@/components/reports/SvgBarChart';
import { SvgLineChart } from '@/components/reports/SvgLineChart';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  addDaysToDateStr,
  addMonthsToDateStr,
  formatMonthLabel,
  getMonthRangeFromDate,
} from '@/lib/dates/venue-dates';
import { formatPence } from '@/lib/format';
import { hapticTap } from '@/lib/haptics';
import {
  bucketHistory,
  useReportHistory,
  useTopClientsByLifetimeValue,
} from '@/lib/queries/useReportHistory';
import { buildAndShareCsv } from '@/lib/reports/csv-export';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

// ─── Types ───────────────────────────────────────────────────────────────────
type HistoryRangeKey = '7d' | '30d' | '90d' | 'month';

type ExportFlash = { tone: 'success' | 'notice'; message: string };

export interface HistorySectionProps {
  /** Appointment venues say "Appointments" / "Clients seen" instead of covers wording. */
  isAppointmentVenue: boolean;
  /** Today's calendar date in the venue timezone (YYYY-MM-DD). */
  today: string;
  /** Class venues: class-commerce KPIs are cookie-only, point at the web dashboard. */
  showClassCommerceNote?: boolean;
}

const RANGE_DAYS: Record<Exclude<HistoryRangeKey, 'month'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/** Bucket the chart weekly once a range is wider than ~5 weeks of daily points. */
const WEEKLY_BUCKET_THRESHOLD_DAYS = 35;

const money = (pence: number): string => formatPence(pence) ?? '—';

// ─── Small local pieces ──────────────────────────────────────────────────────
function HistoryStatRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'emerald' | 'red' | 'brand';
}) {
  const { colors } = useTheme();
  const valueColor =
    accent === 'emerald'
      ? colors.success
      : accent === 'red'
        ? colors.danger
        : accent === 'brand'
          ? colors.brand
          : colors.text;
  return (
    <View style={styles.statRow}>
      <Text variant="bodySmall" tone="muted" style={styles.statLabel}>
        {label}
      </Text>
      <Text variant="bodyMedium" style={[styles.statValue, { color: valueColor }]}>
        {value}
      </Text>
    </View>
  );
}

function HistoryCardHeader({
  title,
  onExport,
  exportDisabled,
  onExportBlocked,
}: {
  title: string;
  onExport: () => void;
  exportDisabled: boolean;
  onExportBlocked: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.cardHeader}>
      <Text variant="label">{title}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Export ${title} as CSV`}
        onPress={() => {
          if (exportDisabled) {
            onExportBlocked();
            return;
          }
          hapticTap();
          onExport();
        }}
        hitSlop={12}
        style={({ pressed }) => [styles.exportBtn, { opacity: pressed ? 0.7 : 1 }]}>
        <Text variant="caption" style={{ color: exportDisabled ? colors.textMuted : colors.brand }}>
          Export CSV
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Main section ────────────────────────────────────────────────────────────
export function HistorySection({
  isAppointmentVenue,
  today,
  showClassCommerceNote = false,
}: HistorySectionProps) {
  const { colors } = useTheme();

  const [rangeKey, setRangeKey] = useState<HistoryRangeKey>('30d');
  const [monthAnchor, setMonthAnchor] = useState(today);

  // Inline export feedback — Alert.alert is a no-op on web, so never rely on it.
  const [flash, setFlash] = useState<ExportFlash | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((tone: ExportFlash['tone'], message: string) => {
    setFlash({ tone, message });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 4500);
  }, []);
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  // ── Resolve the applied range ─────────────────────────────────────────────
  const { from, to } = useMemo(() => {
    if (rangeKey === 'month') {
      const monthRange = getMonthRangeFromDate(monthAnchor);
      // Don't query into the future for the current month.
      const clampedTo = monthRange.from <= today && monthRange.to > today ? today : monthRange.to;
      return { from: monthRange.from, to: clampedTo };
    }
    const days = RANGE_DAYS[rangeKey];
    return { from: addDaysToDateStr(today, -(days - 1)), to: today };
  }, [rangeKey, monthAnchor, today]);

  const isCurrentMonth =
    getMonthRangeFromDate(monthAnchor).from === getMonthRangeFromDate(today).from;

  const history = useReportHistory(from, to);
  const topClients = useTopClientsByLifetimeValue(8);

  const days = useMemo(() => history.data?.days ?? [], [history.data?.days]);
  const totals = history.data?.totals;
  const buckets = useMemo(
    () => bucketHistory(days, days.length > WEEKLY_BUCKET_THRESHOLD_DAYS ? 7 : 1),
    [days],
  );
  const isWeekly = days.length > WEEKLY_BUCKET_THRESHOLD_DAYS;
  const hasActivity = (totals?.bookings ?? 0) > 0;
  const hasDeposits = (totals?.deposit_paid_pence ?? 0) > 0;

  // ── Wording (appointment venues: "Started" / "Clients seen") ─────────────
  const bookingsWord = isAppointmentVenue ? 'Appointments' : 'Bookings';
  const coversBookedLabel = isAppointmentVenue ? 'Client places booked' : 'Covers booked';
  const coversSeenLabel = isAppointmentVenue ? 'Clients seen (arrived / completed)' : 'Covers seated';

  // ── CSV exports ───────────────────────────────────────────────────────────
  const exportHistory = useCallback(async () => {
    if (!days.length) return;
    const result = await buildAndShareCsv(`history-${from}-${to}.csv`, [
      ['Date', bookingsWord, coversBookedLabel, coversSeenLabel, 'No-shows', 'Deposits collected (£)'],
      ...days.map((day) => [
        day.date,
        String(day.bookings),
        String(day.covers),
        String(day.seen_covers),
        String(day.no_shows),
        (day.deposit_paid_pence / 100).toFixed(2),
      ]),
    ]);
    if (!result.ok) {
      notify('notice', 'Could not export.');
      return;
    }
    notify('success', 'History CSV export started.');
  }, [days, from, to, bookingsWord, coversBookedLabel, coversSeenLabel, notify]);

  const clients = useMemo(() => topClients.data?.guests ?? [], [topClients.data?.guests]);
  const clientsWithValue = useMemo(
    () => clients.filter((guest) => (guest.paid_deposit_pence ?? 0) > 0),
    [clients],
  );

  const exportClients = useCallback(async () => {
    if (!clients.length) return;
    const result = await buildAndShareCsv('client-lifetime-value.csv', [
      ['Client', `Total ${bookingsWord.toLowerCase()}`, 'Visits', 'No-shows', 'Lifetime deposits (£)', 'Last visit'],
      ...clients.map((guest) => [
        [guest.first_name, guest.last_name].filter(Boolean).join(' ') || 'Anonymous',
        String(guest.total_bookings),
        String(guest.visit_count),
        String(guest.no_show_count),
        ((guest.paid_deposit_pence ?? 0) / 100).toFixed(2),
        guest.last_visit_date ?? '—',
      ]),
    ]);
    if (!result.ok) {
      notify('notice', 'Could not export.');
      return;
    }
    notify('success', 'Client lifetime value CSV export started.');
  }, [clients, bookingsWord, notify]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Inline export feedback (never Alert-only — must work on web) */}
      {flash ? (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.flash,
            {
              backgroundColor: flash.tone === 'success' ? colors.successSurface : colors.warningSurface,
              borderColor: flash.tone === 'success' ? colors.success : colors.warning,
            },
          ]}>
          <Text variant="caption" style={{ color: flash.tone === 'success' ? colors.success : colors.warning }}>
            {flash.message}
          </Text>
        </View>
      ) : null}

      {/* ── History card: trends over time ─────────────────────────────── */}
      <Card>
        <HistoryCardHeader
          title={isAppointmentVenue ? 'Appointment history' : 'Booking history'}
          onExport={() => void exportHistory()}
          exportDisabled={!hasActivity}
          onExportBlocked={() => notify('notice', 'No history to export in this range.')}
        />

        <View style={styles.rangeControls}>
          <Segmented
            options={[
              { value: '7d', label: '7 days' },
              { value: '30d', label: '30 days' },
              { value: '90d', label: '90 days' },
              { value: 'month', label: 'Month' },
            ]}
            value={rangeKey}
            onChange={setRangeKey}
          />
          {rangeKey === 'month' ? (
            <View style={styles.monthRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                onPress={() => {
                  hapticTap();
                  setMonthAnchor((current) => addMonthsToDateStr(current, -1));
                }}
                style={({ pressed }) => [
                  styles.monthBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}>
                <Text variant="label">‹</Text>
              </Pressable>
              <Text variant="bodyMedium" style={styles.monthLabel}>
                {formatMonthLabel(monthAnchor)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next month"
                disabled={isCurrentMonth}
                onPress={() => {
                  hapticTap();
                  setMonthAnchor((current) => addMonthsToDateStr(current, 1));
                }}
                style={({ pressed }) => [
                  styles.monthBtn,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: isCurrentMonth ? 0.4 : pressed ? 0.7 : 1,
                  },
                ]}>
                <Text variant="label">›</Text>
              </Pressable>
            </View>
          ) : null}
          <Text variant="caption" tone="muted">
            {from} → {to}
            {isWeekly ? '  ·  weekly totals' : ''}
          </Text>
        </View>

        {history.isLoading ? (
          <View style={styles.loading}>
            <Skeleton height={14} />
            <Skeleton height={14} width="80%" />
            <Skeleton height={120} />
          </View>
        ) : history.isError ? (
          <View style={styles.inlineError}>
            <Text variant="bodySmall" tone="danger">
              {history.error instanceof ApiError ? history.error.message : 'Could not load history.'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void history.refetch()}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <Text variant="caption" style={{ color: colors.brand }}>
                Retry
              </Text>
            </Pressable>
          </View>
        ) : !hasActivity ? (
          <Text variant="bodySmall" tone="muted" style={styles.emptyNote}>
            No {bookingsWord.toLowerCase()} in this range yet. Try a wider range.
          </Text>
        ) : (
          <>
            <View style={styles.stats}>
              <HistoryStatRow label={bookingsWord} value={String(totals?.bookings ?? 0)} accent="brand" />
              <HistoryStatRow label={coversBookedLabel} value={String(totals?.covers ?? 0)} />
              <HistoryStatRow
                label={coversSeenLabel}
                value={String(totals?.seen_covers ?? 0)}
                accent="emerald"
              />
              <HistoryStatRow
                label="No-shows"
                value={String(totals?.no_shows ?? 0)}
                accent={(totals?.no_shows ?? 0) > 0 ? 'red' : undefined}
              />
              <HistoryStatRow
                label="Deposits collected"
                value={money(totals?.deposit_paid_pence ?? 0)}
                accent="emerald"
              />
            </View>

            <View style={styles.chartSection}>
              <Text variant="overline" tone="muted">
                {bookingsWord} over time
              </Text>
              <SvgLineChart
                data={buckets.map((bucket) => ({
                  key: bucket.key,
                  label: bucket.label,
                  value: bucket.bookings,
                }))}
                color={colors.brand}
              />
            </View>

            {hasDeposits ? (
              <View style={styles.chartSection}>
                <Text variant="overline" tone="muted">
                  Deposits collected over time
                </Text>
                <SvgLineChart
                  data={buckets.map((bucket) => ({
                    key: bucket.key,
                    label: bucket.label,
                    value: bucket.deposit_paid_pence,
                  }))}
                  color={colors.success}
                  formatValue={(value) => money(Math.round(value))}
                />
              </View>
            ) : null}
          </>
        )}

        {showClassCommerceNote ? (
          <Text variant="caption" tone="muted" style={styles.webNote}>
            Class credit & checkout revenue reports are available on the web dashboard.
          </Text>
        ) : null}
      </Card>

      {/* ── Client lifetime value card ─────────────────────────────────── */}
      <Card>
        <HistoryCardHeader
          title="Client lifetime value"
          onExport={() => void exportClients()}
          exportDisabled={clients.length === 0}
          onExportBlocked={() => notify('notice', 'No clients to export yet.')}
        />
        <Text variant="caption" tone="muted" style={styles.ltvCaption}>
          Top clients by lifetime deposits collected (all time).
        </Text>

        {topClients.isLoading ? (
          <View style={styles.loading}>
            <Skeleton height={14} />
            <Skeleton height={14} width="70%" />
          </View>
        ) : topClients.isError ? (
          <View style={styles.inlineError}>
            <Text variant="bodySmall" tone="danger">
              {topClients.error instanceof ApiError
                ? topClients.error.message
                : 'Could not load client value.'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void topClients.refetch()}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <Text variant="caption" style={{ color: colors.brand }}>
                Retry
              </Text>
            </Pressable>
          </View>
        ) : clientsWithValue.length > 0 ? (
          <View style={styles.chartSection}>
            <SvgBarChart
              data={clientsWithValue.map((guest) => ({
                key: guest.id,
                label: [guest.first_name, guest.last_name].filter(Boolean).join(' ') || 'Anonymous',
                value: guest.paid_deposit_pence ?? 0,
                subValue: `${guest.visit_count} visit${guest.visit_count === 1 ? '' : 's'}`,
              }))}
              color={colors.accent}
              formatValue={(value) => money(Math.round(value))}
              labelWidth={120}
            />
          </View>
        ) : (
          <Text variant="bodySmall" tone="muted" style={styles.emptyNote}>
            No deposits collected yet — lifetime value appears once clients pay deposits.
          </Text>
        )}
      </Card>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flash: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exportBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  rangeControls: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.base,
  },
  monthBtn: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
  },
  monthLabel: {
    minWidth: 130,
    textAlign: 'center',
  },
  loading: {
    marginTop: spacing.base,
    gap: spacing.sm,
  },
  inlineError: {
    marginTop: spacing.base,
    gap: spacing.xs,
  },
  emptyNote: {
    marginTop: spacing.base,
  },
  stats: {
    marginTop: spacing.base,
    gap: spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.base,
  },
  statLabel: {
    flex: 1,
  },
  statValue: {
    fontVariant: ['tabular-nums'],
  },
  chartSection: {
    marginTop: spacing.base,
    gap: spacing.sm,
  },
  webNote: {
    marginTop: spacing.base,
  },
  ltvCaption: {
    marginTop: spacing.xs,
  },
});
