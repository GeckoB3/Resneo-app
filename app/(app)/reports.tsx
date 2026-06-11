import { Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { BaselineMetricsCard } from '@/components/reports/BaselineMetricsCard';
import { BookingLogEmailCard } from '@/components/reports/BookingLogEmailCard';
import { ClientsTab } from '@/components/reports/ClientsTab';
import { DataExportCard } from '@/components/reports/DataExportCard';
import { HistorySection } from '@/components/reports/HistorySection';
import { SvgBarChart } from '@/components/reports/SvgBarChart';
import { bookingStatusDisplayLabel } from '@/lib/booking/infer-booking-row-model';
import { SvgLineChart } from '@/components/reports/SvgLineChart';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { addDaysToDateStr } from '@/lib/dates/venue-dates';
import { formatPence } from '@/lib/format';
import { hapticTap } from '@/lib/haptics';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import { useReports } from '@/lib/queries/useReports';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { buildAndShareCsv, aggregateSourcesByLabel } from '@/lib/reports/csv-export';
import { useVenueContext } from '@/providers/VenueProvider';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

// ─── Types ───────────────────────────────────────────────────────────────────
type RangeKey = '7d' | '30d' | '90d' | 'custom';
type MainTab = 'overview' | 'clients';

const RANGE_DAYS: Record<Exclude<RangeKey, 'custom'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const money = (pence: number): string => formatPence(pence) ?? '—';

// ─── StatRow ─────────────────────────────────────────────────────────────────
function StatRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'emerald' | 'amber' | 'red' | 'brand';
}) {
  const { colors } = useTheme();
  const valueColor =
    accent === 'emerald'
      ? colors.success
      : accent === 'amber'
        ? colors.warning
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

// ─── CardHeader (with optional export button) ────────────────────────────────
function CardHeader({
  title,
  onExport,
  exportDisabled,
}: {
  title: string;
  onExport?: () => void;
  exportDisabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.cardHeader}>
      <Text variant="label">{title}</Text>
      {onExport ? (
        <Pressable
          onPress={() => {
            if (exportDisabled) {
              Alert.alert('Nothing to export', 'No data in this range for this report.');
              return;
            }
            hapticTap();
            void onExport();
          }}
          hitSlop={12}
          style={({ pressed }) => [styles.exportBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <Text variant="caption" style={{ color: exportDisabled ? colors.textMuted : colors.brand }}>
            Export CSV
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// HorizontalBar replaced by SvgBarChart — see components/reports/SvgBarChart.tsx

// ─── Date chip ───────────────────────────────────────────────────────────────
function DateChip({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.dateChip,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Text variant="bodySmall">{label}</Text>
    </Pressable>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function ReportsScreen() {
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';

  const timeZone = venue?.timezone ?? 'Europe/London';
  const today = calendarDateInTimeZone(new Date(), timeZone);

  // Date range state
  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const [customFrom, setCustomFrom] = useState(addDaysToDateStr(today, -29));
  const [customTo, setCustomTo] = useState(today);
  // Applied range (separate so we don't refetch mid-type for custom)
  const [appliedFrom, setAppliedFrom] = useState(addDaysToDateStr(today, -29));
  const [appliedTo, setAppliedTo] = useState(today);

  // Sub-tabs
  const [mainTab, setMainTab] = useState<MainTab>('overview');

  const query = useReports(appliedFrom, appliedTo, isAdmin);

  // When a preset is tapped, immediately apply the range
  function handlePresetChange(key: RangeKey) {
    setRangeKey(key);
    if (key !== 'custom') {
      const from = addDaysToDateStr(today, -(RANGE_DAYS[key] - 1));
      setCustomFrom(from);
      setCustomTo(today);
      setAppliedFrom(from);
      setAppliedTo(today);
    }
  }

  function applyCustomRange() {
    setAppliedFrom(customFrom);
    setAppliedTo(customTo);
  }

  const data = query.data;
  const summary = data?.report1_booking_summary;
  const noShowSeries = useMemo(() => data?.report2_no_show_series ?? [], [data?.report2_no_show_series]);
  const cancellation = data?.report3_cancellation;
  const deposit = data?.report4_deposit;
  const insights = data?.report7_appointment_insights;
  const clients = data?.client_summary;
  const baseline = data?.report8_baseline_metrics;
  const baselineSnapshot = data?.report8_baseline_snapshot;
  const bookingLogConfig = data?.booking_log_email_config;
  const defaultLogEmail = data?.default_booking_log_email;

  // Determine if this is an appointment venue
  const isAppointmentVenue =
    data?.booking_model === 'practitioner_appointment' ||
    data?.booking_model === 'unified_scheduling' ||
    Boolean(insights);

  // ── No-show calculations ─────────────────────────────────────────────────
  const totalNoShows = noShowSeries.reduce((sum, row) => sum + row.no_show_count, 0);
  const totalConfirmed = noShowSeries.reduce((sum, row) => sum + row.confirmed_at_time_count, 0);
  const noShowRatePct =
    totalConfirmed > 0
      ? ((totalNoShows / totalConfirmed) * 100).toFixed(1)
      : null;

  // ── Export helpers — hoisted before early returns so hook order is stable ─
  const exportReport1 = useCallback(async () => {
    if (!summary || !data) return;
    await buildAndShareCsv(`report1-booking-summary-${data.from}-${data.to}.csv`, [
      ['Metric', 'Value'],
      ['Bookings created', String(summary.total_bookings_created)],
      [isAppointmentVenue ? 'Client places booked' : 'Covers booked', String(summary.covers_booked)],
      [isAppointmentVenue ? 'Clients seen' : 'Covers seated', String(summary.covers_seated)],
      ['By source', ''],
      ...aggregateSourcesByLabel(summary.by_source).map(({ name, value }) => [name, String(value)]),
      ['By status', ''],
      ...Object.entries(summary.by_status).map(([k, v]) => [
        bookingStatusDisplayLabel(k, !isAppointmentVenue),
        String(v),
      ]),
    ]);
  }, [summary, data, isAppointmentVenue]);

  const exportReport2 = useCallback(async () => {
    if (!noShowSeries.length || !data) return;
    await buildAndShareCsv(`report2-no-show-${data.from}-${data.to}.csv`, [
      ['Date', 'No-shows', 'Eligible', 'Rate %'],
      ...noShowSeries.map((row) => [
        row.period_start,
        String(row.no_show_count),
        String(row.confirmed_at_time_count),
        String(row.rate_pct),
      ]),
    ]);
  }, [noShowSeries, data]);

  const exportReport3 = useCallback(async () => {
    if (!cancellation || !data) return;
    await buildAndShareCsv(`report3-cancellation-${data.from}-${data.to}.csv`, [
      ['Metric', 'Value'],
      ['Bookings created', String(cancellation.total_bookings_created)],
      ['Client-initiated cancellations', String(cancellation.cancelled_guest_initiated)],
      ['Auto-cancelled', String(cancellation.cancelled_auto)],
      ['Cancellation rate %', String(cancellation.cancellation_rate_pct)],
    ]);
  }, [cancellation, data]);

  const exportReport4 = useCallback(async () => {
    if (!deposit || !data) return;
    await buildAndShareCsv(`report4-deposits-${data.from}-${data.to}.csv`, [
      ['Metric', 'Pence', 'GBP'],
      ['Collected', String(deposit.total_collected_pence), (deposit.total_collected_pence / 100).toFixed(2)],
      ['Refunded', String(deposit.total_refunded_pence), (deposit.total_refunded_pence / 100).toFixed(2)],
      ['Forfeited', String(deposit.total_forfeited_pence), (deposit.total_forfeited_pence / 100).toFixed(2)],
    ]);
  }, [deposit, data]);

  const exportReport7 = useCallback(async () => {
    if (!insights || !data) return;
    await buildAndShareCsv(`report7-team-services-${data.from}-${data.to}.csv`, [
      ['Practitioner', 'Bookings', 'Arrived/Completed'],
      ...insights.by_practitioner.map((row) => [
        row.practitioner_name,
        String(row.booking_count),
        String(row.completed_count),
      ]),
      [],
      ['Service', 'Bookings'],
      ...insights.by_service.map((row) => [row.service_name, String(row.booking_count)]),
      [],
      ['Channel', 'Bookings'],
      ...aggregateSourcesByLabel(insights.by_booking_source).map(({ name, value }) => [name, String(value)]),
      ...(insights.addon_revenue && insights.addon_revenue.total_pence > 0
        ? [
            [],
            ['Add-on', 'Group', 'Bookings', 'Revenue (pence)', 'Revenue (£)', 'Total minutes'],
            ...insights.addon_revenue.top_addons.map((row) => [
              row.addon_name_snapshot,
              row.addon_group_name_snapshot ?? '',
              String(row.bookings),
              String(row.revenue_pence),
              (row.revenue_pence / 100).toFixed(2),
              String(row.total_duration_minutes),
            ]),
          ]
        : []),
    ]);
  }, [insights, data]);

  const header = <Stack.Screen options={{ title: 'Reports' }} />;

  if (staffQuery.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  if (!isAdmin) {
    return (
      <Screen>
        {header}
        <ErrorState message="Reports are only available to venue admins." />
      </Screen>
    );
  }

  // ── Derived chart data ───────────────────────────────────────────────────
  const sourcePieData = summary?.by_source
    ? aggregateSourcesByLabel(summary.by_source)
    : [];
  const statusBarMax = summary?.by_status
    ? Math.max(...Object.values(summary.by_status), 1)
    : 1;

  const pracMax = insights
    ? Math.max(...insights.by_practitioner.map((r) => r.booking_count), 1)
    : 1;
  const svcMax = insights
    ? Math.max(...insights.by_service.map((r) => r.booking_count), 1)
    : 1;
  const channelMax = insights?.by_booking_source
    ? Math.max(...Object.values(insights.by_booking_source), 1)
    : 1;

  return (
    <Screen scroll={false} padded={false}>
      {header}

      {/* ── Toolbar: presets + sub-tabs ─────────────────────────── */}
      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        {/* Preset chips */}
        <View style={styles.presetRow}>
          {(['7d', '30d', '90d'] as const).map((key) => (
            <Pressable
              key={key}
              onPress={() => handlePresetChange(key)}
              style={({ pressed }) => [
                styles.presetChip,
                {
                  backgroundColor: rangeKey === key ? colors.brand : colors.surface,
                  borderColor: rangeKey === key ? colors.brand : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <Text
                variant="caption"
                style={{ color: rangeKey === key ? colors.onBrand : colors.textSecondary }}>
                {key === '7d' ? '7 days' : key === '30d' ? '30 days' : '90 days'}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => handlePresetChange('custom')}
            style={({ pressed }) => [
              styles.presetChip,
              {
                backgroundColor: rangeKey === 'custom' ? colors.brand : colors.surface,
                borderColor: rangeKey === 'custom' ? colors.brand : colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <Text
              variant="caption"
              style={{
                color: rangeKey === 'custom' ? colors.onBrand : colors.textSecondary,
              }}>
              Custom
            </Text>
          </Pressable>
        </View>

        {/* Custom date inputs (shown when custom is selected) */}
        {rangeKey === 'custom' ? (
          <View style={styles.customRange}>
            <DateChip
              label={`From: ${customFrom}`}
              onPress={() => {
                if (Platform.OS === 'ios') {
                  Alert.prompt(
                    'From date',
                    'Enter date (YYYY-MM-DD)',
                    (text) => {
                      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) setCustomFrom(text);
                    },
                    'plain-text',
                    customFrom,
                  );
                } else {
                  // Alert.prompt is iOS-only; on Android show an info alert instead.
                  Alert.alert(
                    'From date',
                    `Current: ${customFrom}\n\nTo change the date use the 7-day / 30-day / 90-day presets, or type a YYYY-MM-DD date directly.`,
                    [{ text: 'OK' }],
                  );
                }
              }}
            />
            <DateChip
              label={`To: ${customTo}`}
              onPress={() => {
                if (Platform.OS === 'ios') {
                  Alert.prompt(
                    'To date',
                    'Enter date (YYYY-MM-DD)',
                    (text) => {
                      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) setCustomTo(text);
                    },
                    'plain-text',
                    customTo,
                  );
                } else {
                  Alert.alert(
                    'To date',
                    `Current: ${customTo}\n\nTo change the date use the 7-day / 30-day / 90-day presets, or type a YYYY-MM-DD date directly.`,
                    [{ text: 'OK' }],
                  );
                }
              }}
            />
            <Pressable
              onPress={() => {
                hapticTap();
                applyCustomRange();
              }}
              style={({ pressed }) => [styles.applyBtn, { backgroundColor: colors.brand, opacity: pressed ? 0.7 : 1 }]}>
              <Text variant="label" style={{ color: colors.onBrand }}>
                {query.isFetching ? 'Loading…' : 'Apply'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Overview / Clients sub-tabs */}
        <Segmented
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'clients', label: 'Clients' },
          ]}
          value={mainTab}
          onChange={setMainTab}
        />
      </View>

      {/* ── Content ──────────────────────────────────────────────── */}
      {query.isLoading ? (
        <DetailSkeleton />
      ) : query.isError || !data ? (
        <View style={styles.stateWrap}>
          <ErrorState
            message={
              query.error instanceof ApiError
                ? query.error.message
                : 'Could not load reports.'
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
          {/* Range label */}
          <Text variant="caption" tone="muted" style={styles.rangeLabel}>
            {data.from} → {data.to}
          </Text>

          {/* ── CLIENTS TAB ─────────────────────────────────── */}
          {mainTab === 'clients' ? (
            <>
              {clients ? (
                <Card>
                  <CardHeader title="Client summary" />
                  <View style={styles.stats}>
                    <StatRow
                      label="Identified clients"
                      value={String(clients.identified_clients_total)}
                      accent="brand"
                    />
                    <StatRow label="New in period" value={String(clients.new_clients_in_period)} />
                    <StatRow
                      label="Returning"
                      value={String(clients.returning_clients_in_period)}
                      accent="emerald"
                    />
                    <StatRow
                      label="Anonymous visits"
                      value={String(clients.anonymous_visits_in_period)}
                    />
                  </View>
                </Card>
              ) : null}
              <Card>
                <CardHeader title="Client directory" />
                <View style={styles.clientsContent}>
                  <ClientsTab />
                </View>
              </Card>
            </>
          ) : (
            /* ── OVERVIEW TAB ─────────────────────────────────── */
            <>
              {/* Report 1: Bookings / Appointment Activity */}
              {summary ? (
                <Card>
                  <CardHeader
                    title={isAppointmentVenue ? 'Appointment activity' : 'Booking summary'}
                    onExport={exportReport1}
                    exportDisabled={!summary}
                  />
                  <View style={styles.stats}>
                    <StatRow
                      label={isAppointmentVenue ? 'Appointments created' : 'Total bookings'}
                      value={String(summary.total_bookings_created)}
                      accent="brand"
                    />
                    <StatRow
                      label={isAppointmentVenue ? 'Client places booked' : 'Covers booked'}
                      value={String(summary.covers_booked)}
                      accent="brand"
                    />
                    <StatRow
                      label={isAppointmentVenue ? 'Clients seen (arrived / completed)' : 'Covers seated'}
                      value={String(summary.covers_seated)}
                      accent="emerald"
                    />
                  </View>

                  {/* Status bar chart */}
                  {Object.keys(summary.by_status).length > 0 ? (
                    <View style={styles.chartSection}>
                      <Text variant="overline" tone="muted">
                        By status
                      </Text>
                      <SvgBarChart
                        data={Object.entries(summary.by_status).map(([status, count]) => ({
                          key: status,
                          // Appointment venues say "Started", never "Seated".
                          label: bookingStatusDisplayLabel(status, !isAppointmentVenue),
                          value: count,
                        }))}
                        color={colors.brand}
                        maxValue={statusBarMax}
                      />
                    </View>
                  ) : null}

                  {/* Source breakdown */}
                  {sourcePieData.length > 0 ? (
                    <View style={styles.chartSection}>
                      <Text variant="overline" tone="muted">
                        How they booked
                      </Text>
                      <SvgBarChart
                        data={sourcePieData.map(({ name, value }) => ({
                          key: name,
                          label: name,
                          value,
                        }))}
                        color={colors.accent}
                        maxValue={sourcePieData[0]?.value ?? 1}
                      />
                    </View>
                  ) : null}
                </Card>
              ) : null}

              {/* Booking log email settings (appointment venues) */}
              {isAppointmentVenue ? (
                <BookingLogEmailCard
                  config={bookingLogConfig}
                  defaultEmail={defaultLogEmail}
                  onSaved={() => void query.refetch()}
                />
              ) : null}

              {/* Report 8: Baseline Metrics */}
              {isAppointmentVenue ? (
                <BaselineMetricsCard metrics={baseline} snapshot={baselineSnapshot} />
              ) : null}

              {/* Report 2: No-shows */}
              <Card>
                <CardHeader
                  title="No-show rate"
                  onExport={exportReport2}
                  exportDisabled={noShowSeries.length === 0}
                />
                <View style={styles.stats}>
                  {noShowRatePct != null ? (
                    <StatRow
                      label="Overall rate"
                      value={`${noShowRatePct}%`}
                      accent={Number(noShowRatePct) > 10 ? 'red' : 'emerald'}
                    />
                  ) : null}
                  <StatRow label="Total no-shows" value={String(totalNoShows)} />
                  <StatRow label="Eligible appointments" value={String(totalConfirmed)} />
                </View>
                {noShowSeries.length > 0 ? (
                  <View style={styles.chartSection}>
                    <Text variant="overline" tone="muted">
                      Daily rate
                    </Text>
                    <SvgLineChart
                      data={noShowSeries
                        .filter((row) => row.no_show_count > 0 || row.confirmed_at_time_count > 0)
                        .slice(-14)
                        .map((row) => ({
                          key: row.period_start,
                          label: row.period_start.slice(5),
                          value: row.rate_pct,
                        }))}
                      color={colors.brand}
                      thresholdValue={10}
                      thresholdColor={colors.danger}
                      maxValue={100}
                      formatValue={(v) => `${v}%`}
                    />
                  </View>
                ) : null}
              </Card>

              {/* Report 3: Cancellations */}
              {cancellation ? (
                <Card>
                  <CardHeader
                    title="Cancellation rate"
                    onExport={exportReport3}
                    exportDisabled={!cancellation}
                  />
                  <View style={styles.stats}>
                    <StatRow
                      label="Cancellation rate"
                      value={`${cancellation.cancellation_rate_pct}%`}
                      accent={cancellation.cancellation_rate_pct > 10 ? 'red' : 'emerald'}
                    />
                    <StatRow
                      label="Client-initiated"
                      value={String(cancellation.cancelled_guest_initiated)}
                    />
                    <StatRow label="Auto-cancelled" value={String(cancellation.cancelled_auto)} />
                    <StatRow
                      label="Total created"
                      value={String(cancellation.total_bookings_created)}
                    />
                  </View>
                </Card>
              ) : null}

              {/* Report 4: Deposits / Payments */}
              {deposit ? (
                <Card>
                  <CardHeader
                    title={isAppointmentVenue ? 'Payments & deposits' : 'Deposit summary'}
                    onExport={exportReport4}
                    exportDisabled={!deposit}
                  />
                  <View style={styles.stats}>
                    <StatRow
                      label="Collected"
                      value={money(deposit.total_collected_pence)}
                      accent="emerald"
                    />
                    <StatRow
                      label="Refunded"
                      value={money(deposit.total_refunded_pence)}
                      accent="amber"
                    />
                    <StatRow
                      label="Forfeited"
                      value={money(deposit.total_forfeited_pence)}
                      accent="red"
                    />
                  </View>
                </Card>
              ) : null}

              {/* Report 7: Team, Services & Channels */}
              {insights &&
              (insights.by_practitioner.length > 0 ||
                insights.by_service.length > 0 ||
                Object.keys(insights.by_booking_source).length > 0) ? (
                <Card>
                  <CardHeader
                    title="Team, services & channels"
                    onExport={exportReport7}
                    exportDisabled={false}
                  />

                  {insights.by_practitioner.length > 0 ? (
                    <View style={styles.chartSection}>
                      <Text variant="overline" tone="muted">
                        By team member
                      </Text>
                      <SvgBarChart
                        data={insights.by_practitioner.map((row) => ({
                          key: String(row.practitioner_id),
                          label: row.practitioner_name,
                          value: row.booking_count,
                          subValue: `${row.completed_count} completed`,
                        }))}
                        color={colors.brand}
                        maxValue={pracMax}
                      />
                    </View>
                  ) : null}

                  {insights.by_service.length > 0 ? (
                    <View style={styles.chartSection}>
                      <Text variant="overline" tone="muted">
                        By service
                      </Text>
                      <SvgBarChart
                        data={insights.by_service.map((row) => ({
                          key: String(row.service_id),
                          label: row.service_name,
                          value: row.booking_count,
                        }))}
                        color={colors.accent}
                        maxValue={svcMax}
                      />
                    </View>
                  ) : null}

                  {Object.keys(insights.by_booking_source).length > 0 ? (
                    <View style={styles.chartSection}>
                      <Text variant="overline" tone="muted">
                        Channel mix
                      </Text>
                      <SvgBarChart
                        data={aggregateSourcesByLabel(insights.by_booking_source).map(
                          ({ name, value }) => ({
                            key: name,
                            label: name,
                            value,
                          }),
                        )}
                        color={colors.success}
                        maxValue={channelMax}
                      />
                    </View>
                  ) : null}

                  {/* Add-on revenue */}
                  {insights.addon_revenue && insights.addon_revenue.total_pence > 0 ? (
                    <View style={styles.chartSection}>
                      <Text variant="overline" tone="muted">
                        Add-on revenue
                      </Text>
                      <View style={styles.stats}>
                        <StatRow
                          label="Total"
                          value={money(insights.addon_revenue.total_pence)}
                          accent="emerald"
                        />
                        <StatRow
                          label="Bookings with add-ons"
                          value={String(insights.addon_revenue.bookings_with_addons)}
                        />
                      </View>
                      {insights.addon_revenue.top_addons.length > 0 ? (
                        <View style={[styles.addonTable, { borderColor: colors.border }]}>
                          <View style={[styles.addonHeader, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                            <Text variant="caption" tone="muted" style={styles.addonNameCol}>
                              Add-on
                            </Text>
                            <Text variant="caption" tone="muted" style={styles.addonGroupCol}>
                              Group
                            </Text>
                            <Text variant="caption" tone="muted" style={styles.addonRevCol}>
                              Revenue
                            </Text>
                          </View>
                          {insights.addon_revenue.top_addons.map((addon, i) => (
                            <View
                              key={`${addon.addon_group_name_snapshot ?? ''}|${addon.addon_name_snapshot}|${i}`}
                              style={[styles.addonRow, { borderBottomColor: colors.border }]}>
                              <Text
                                variant="bodySmall"
                                numberOfLines={1}
                                style={styles.addonNameCol}>
                                {addon.addon_name_snapshot}
                              </Text>
                              <Text
                                variant="caption"
                                tone="muted"
                                numberOfLines={1}
                                style={styles.addonGroupCol}>
                                {addon.addon_group_name_snapshot ?? '—'}
                              </Text>
                              <Text
                                variant="bodySmall"
                                style={[styles.addonRevCol, { fontVariant: ['tabular-nums'] }]}>
                                {money(addon.revenue_pence)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </Card>
              ) : null}

              {/* Clients summary card (overview tab) */}
              {clients ? (
                <Card>
                  <CardHeader title="Clients" />
                  <View style={styles.stats}>
                    <StatRow
                      label="Identified clients"
                      value={String(clients.identified_clients_total)}
                      accent="brand"
                    />
                    <StatRow label="New in period" value={String(clients.new_clients_in_period)} />
                    <StatRow
                      label="Returning"
                      value={String(clients.returning_clients_in_period)}
                      accent="emerald"
                    />
                    <StatRow
                      label="Anonymous visits"
                      value={String(clients.anonymous_visits_in_period)}
                    />
                  </View>
                </Card>
              ) : null}

              {/* History & trends (range-driven, independent of the toolbar presets) */}
              <HistorySection
                isAppointmentVenue={isAppointmentVenue}
                today={today}
                showClassCommerceNote={Boolean(data?.enabled_models?.includes('class_session'))}
              />

              {/* Data export */}
              <DataExportCard
                bookingWord={isAppointmentVenue ? 'Appointment' : 'Booking'}
                clientLabel="Client"
              />

              {/* Empty state for zero-activity ranges */}
              {!summary &&
              noShowSeries.length === 0 &&
              !cancellation &&
              !deposit &&
              !insights ? (
                <EmptyState
                  title="No data in this range"
                  message="Create some bookings and check back, or try a wider date range."
                />
              ) : null}
            </>
          )}

          <View style={styles.spacer} />
        </ScrollView>
      )}
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  toolbar: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  presetChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  customRange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  dateChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: minTouchTarget,
    justifyContent: 'center',
  },
  applyBtn: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    gap: spacing.base,
  },
  rangeLabel: {
    textAlign: 'center',
  },
  stats: {
    marginTop: spacing.sm,
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exportBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chartSection: {
    marginTop: spacing.base,
    gap: spacing.sm,
  },
  addonTable: {
    marginTop: spacing.sm,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
  },
  addonHeader: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
  },
  addonRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  addonNameCol: {
    flex: 2,
  },
  addonGroupCol: {
    flex: 1,
  },
  addonRevCol: {
    width: 72,
    textAlign: 'right',
  },
  clientsContent: {
    marginTop: spacing.sm,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  spacer: {
    height: spacing['2xl'],
  },
});
