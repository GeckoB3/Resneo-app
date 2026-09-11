import { Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { BaselineMetricsCard } from '@/components/reports/BaselineMetricsCard';
import { BookedRevenueSection } from '@/components/reports/BookedRevenueSection';
import { BookingLogEmailCard } from '@/components/reports/BookingLogEmailCard';
import { ClientsTab } from '@/components/reports/ClientsTab';
import { DataExportCard } from '@/components/reports/DataExportCard';
import { EventTicketTiersCard } from '@/components/reports/EventTicketTiersCard';
import { HistorySection } from '@/components/reports/HistorySection';
import { CardHeader, StatRow, useReportCsvExport } from '@/components/reports/ReportCardParts';
import { SvgBarChart } from '@/components/reports/SvgBarChart';
import { SvgLineChart } from '@/components/reports/SvgLineChart';
import {
  ResourceUtilisationCard,
  TableUtilisationCard,
} from '@/components/reports/UtilisationCards';
import { Card } from '@/components/ui/Card';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { bookingStatusDisplayLabel } from '@/lib/booking/infer-booking-row-model';
import { addDaysToDateStr } from '@/lib/dates/venue-dates';
import { formatPence } from '@/lib/format';
import { hapticTap } from '@/lib/haptics';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import { useReports } from '@/lib/queries/useReports';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { aggregateSourcesByLabel } from '@/lib/reports/csv-export';
import {
  buildReport1Csv,
  buildReport2Csv,
  buildReport3Csv,
  buildReport4Csv,
  buildReport7Csv,
  noShowOverallRatePct,
  showTableUtilisation,
  type ReportCsvContext,
} from '@/lib/reports/overview-report';
import {
  buildModelBreakdownCsvRows,
  modelBreakdownCsvFilename,
  modelDepositDisplay,
  modelRowLabel,
  showBookingTypeBreakdown,
  visibleModelRows,
} from '@/lib/reports/report-by-model';
import { isAppointmentFromVenue } from '@/lib/venue/venue-experience';
import { useVenueContext } from '@/providers/VenueProvider';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

// ─── Types ───────────────────────────────────────────────────────────────────
type RangeKey = '7d' | '30d' | '90d' | 'custom';
type MainTab = 'overview' | 'revenue' | 'clients';

const RANGE_DAYS: Record<Exclude<RangeKey, 'custom'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const money = (pence: number): string => formatPence(pence) ?? '—';

/** "YYYY-MM-DD" → a local-noon Date (noon avoids any tz day-boundary slip). */
function ymdToLocalNoon(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function ReportsScreen() {
  const { colors } = useTheme();
  const { venue, terminology, pricingTier, bookingModel } = useVenueContext();
  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  const exportCsv = useReportCsvExport();

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

  // The To picker takes a Date for its lower bound. Build it from the
  // YYYY-MM-DD string at local noon (avoids any tz day-boundary slip), memoised
  // so the picker doesn't see a new Date identity every render. Neither end is
  // capped at today: the web's inputs are unbounded, and a range that runs into
  // the future is a legitimate thing to ask a report for.
  const customFromDate = useMemo(() => ymdToLocalNoon(customFrom), [customFrom]);

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

  // YYYY-MM-DD compares chronologically as a plain string, so keep To ≥ From by
  // clamping the other end whenever one date moves past it.
  function handleCustomFromChange(iso: string) {
    setCustomFrom(iso);
    if (iso > customTo) setCustomTo(iso);
  }

  function handleCustomToChange(iso: string) {
    setCustomTo(iso);
    if (iso < customFrom) setCustomFrom(iso);
  }

  function applyCustomRange() {
    // Guard: never send an inverted range to the API.
    const from = customFrom <= customTo ? customFrom : customTo;
    const to = customFrom <= customTo ? customTo : customFrom;
    setAppliedFrom(from);
    setAppliedTo(to);
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
  const tableUtilisation = useMemo(
    () => data?.report5_table_utilisation ?? [],
    [data?.report5_table_utilisation],
  );
  const eventTiers = useMemo(
    () => data?.report_event_ticket_tiers ?? [],
    [data?.report_event_ticket_tiers],
  );
  const resourceUtilisation = useMemo(
    () => data?.report_resource_utilisation ?? [],
    [data?.report_resource_utilisation],
  );

  /*
    Per-booking-model breakdown. The web shows it as soon as more than one
    booking type had activity in range, whatever the venue has enabled
    (ReportsView.tsx:598) — a venue can take bookings of a type it has since
    switched off, and a single row only restates the headline summary.
  */
  const modelRows = useMemo(
    () => visibleModelRows(data?.report_by_booking_model),
    [data?.report_by_booking_model],
  );
  const showModelBreakdown = showBookingTypeBreakdown(data?.report_by_booking_model);

  /*
    The web's `appointmentDashboardExperience` (ReportsView.tsx:320-328): the
    Appointments plan, the venue's booking model, or unified scheduling enabled
    as a secondary tab. The server computes the same thing when it decides
    whether to send report 7, so that answer stands in when the venue bootstrap
    has not loaded.
  */
  const isAppointmentVenue =
    isAppointmentFromVenue(
      data?.pricing_tier ?? pricingTier,
      data?.booking_model ?? bookingModel,
      data?.enabled_models,
    ) || Boolean(insights);

  const clientWord = terminology.client;
  const clientLower = clientWord.toLowerCase();
  const bookingWord = terminology.booking;
  const bookingLower = bookingWord.toLowerCase();
  const staffWord = terminology.staff;
  const staffLower = staffWord.toLowerCase();

  // ── No-show calculations ─────────────────────────────────────────────────
  const totalNoShows = noShowSeries.reduce((sum, row) => sum + row.no_show_count, 0);
  const totalConfirmed = noShowSeries.reduce((sum, row) => sum + row.confirmed_at_time_count, 0);
  // The web prints this rate even when nothing was eligible: 0.0%, not a blank
  // (ReportsView.tsx:614-616, 1076-1078).
  const noShowRatePct = noShowOverallRatePct(noShowSeries);

  const hasAppointmentInsights = Boolean(
    insights &&
      (insights.by_practitioner.length > 0 ||
        insights.by_service.length > 0 ||
        Object.keys(insights.by_booking_source).length > 0),
  );

  // ── Export helpers — hoisted before early returns so hook order is stable ─
  const csvContext = useMemo<ReportCsvContext>(
    () => ({ appointment: isAppointmentVenue, terminology }),
    [isAppointmentVenue, terminology],
  );

  const exportReport1 = useCallback(async () => {
    if (!summary || !data) return;
    const csv = buildReport1Csv(summary, data, csvContext);
    await exportCsv(csv.filename, csv.rows);
  }, [summary, data, csvContext, exportCsv]);

  const exportReport2 = useCallback(async () => {
    if (!noShowSeries.length || !data) return;
    const csv = buildReport2Csv(noShowSeries, data, csvContext);
    await exportCsv(csv.filename, csv.rows);
  }, [noShowSeries, data, csvContext, exportCsv]);

  const exportReport3 = useCallback(async () => {
    if (!cancellation || !data) return;
    const csv = buildReport3Csv(cancellation, data, csvContext);
    await exportCsv(csv.filename, csv.rows);
  }, [cancellation, data, csvContext, exportCsv]);

  const exportReport4 = useCallback(async () => {
    if (!deposit || !data) return;
    const csv = buildReport4Csv(deposit, data);
    await exportCsv(csv.filename, csv.rows);
  }, [deposit, data, exportCsv]);

  const exportReport7 = useCallback(async () => {
    if (!insights || !data) return;
    const csv = buildReport7Csv(insights, data, csvContext);
    await exportCsv(csv.filename, csv.rows);
  }, [insights, data, csvContext, exportCsv]);

  const exportModelBreakdown = useCallback(async () => {
    if (!modelRows.length || !data) return;
    await exportCsv(
      modelBreakdownCsvFilename(data.from, data.to),
      buildModelBreakdownCsvRows(modelRows),
    );
  }, [modelRows, data, exportCsv]);

  const header = <Stack.Screen options={{ headerShown: true, title: 'Reports' }} />;

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

  const rangeLabel = data ? `${data.from} → ${data.to}` : '';

  return (
    <Screen scroll={false} padded={false}>
      {header}

      {/* ── Toolbar: presets + sub-tabs ─────────────────────────── */}
      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        {/* Preset chips. The Revenue tab carries its own range (web parity:
            the date-range card is hidden there). */}
        {mainTab !== 'revenue' ? (
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
        ) : null}

        {/* Custom date inputs (shown when custom is selected) — native OS pickers
            so the range works on iOS and Android alike. */}
        {mainTab !== 'revenue' && rangeKey === 'custom' ? (
          <View style={styles.customRange}>
            <View style={styles.dateField}>
              <Text variant="caption" tone="muted">
                From
              </Text>
              <DatePickerField
                value={customFrom}
                onChange={handleCustomFromChange}
                accessibilityLabel="Report range start date"
              />
            </View>
            <View style={styles.dateField}>
              <Text variant="caption" tone="muted">
                To
              </Text>
              <DatePickerField
                value={customTo}
                onChange={handleCustomToChange}
                accessibilityLabel="Report range end date"
                minimumDate={customFromDate}
              />
            </View>
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

        {/* Overview / Revenue / Clients sub-tabs (web #191 added Revenue) */}
        <Segmented
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'revenue', label: 'Revenue' },
            { value: 'clients', label: `${clientWord}s` },
          ]}
          value={mainTab}
          onChange={setMainTab}
        />
      </View>

      {/* ── Content ──────────────────────────────────────────────── */}
      {mainTab === 'revenue' ? (
        // Booked revenue has its own query and range (web #191); it does not
        // wait on the overview payload.
        <ScrollView contentContainerStyle={styles.content}>
          <BookedRevenueSection bookingWord={bookingWord} today={today} enabled={isAdmin} />
          <View style={styles.spacer} />
        </ScrollView>
      ) : query.isLoading ? (
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
            {rangeLabel}
          </Text>

          {/* ── CLIENTS TAB ─────────────────────────────────── */}
          {mainTab === 'clients' ? (
            <Card>
              <CardHeader title={`${clientWord} directory`} />
              <Text variant="caption" tone="muted" style={styles.rangeCaption}>
                {rangeLabel}
              </Text>
              {clients ? (
                <>
                  {/* The web's tiles, labels and meaning cues (ClientsSection.tsx:294-317). */}
                  <View style={styles.tiles}>
                    <StatTile
                      label={`Known ${clientLower}s (all-time)`}
                      value={String(clients.identified_clients_total)}
                      style={styles.tile}
                    />
                    <StatTile
                      label="New this period"
                      value={String(clients.new_clients_in_period)}
                      caption={rangeLabel}
                      style={styles.tile}
                    />
                    <StatTile
                      label="Returning this period"
                      value={String(clients.returning_clients_in_period)}
                      caption={rangeLabel}
                      style={styles.tile}
                    />
                    <StatTile
                      label={
                        isAppointmentVenue
                          ? `Anonymous ${bookingLower}s (period)`
                          : 'Anonymous visits (period)'
                      }
                      value={String(clients.anonymous_visits_in_period)}
                      caption={rangeLabel}
                      style={styles.tile}
                    />
                  </View>
                  {clients.anonymous_visits_in_period > 0 ? (
                    <Text variant="bodySmall" tone="muted" style={styles.cardIntro}>
                      {`Walk-in visits without contact details are counted but not shown in the ${clientLower} list below.`}
                    </Text>
                  ) : null}
                </>
              ) : null}
              <View style={styles.clientsContent}>
                <ClientsTab
                  clientWord={clientWord}
                  bookingWord={bookingWord}
                  isAppointment={isAppointmentVenue}
                />
              </View>
            </Card>
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
                    exportBlockedMessage={
                      isAppointmentVenue
                        ? 'There is no appointment activity to export for this period.'
                        : 'There is no booking summary to export for this period.'
                    }
                  />
                  <View style={styles.stats}>
                    <StatRow
                      label={
                        isAppointmentVenue ? `${bookingWord}s created` : `Total ${bookingLower}s`
                      }
                      value={String(summary.total_bookings_created)}
                      accent="brand"
                    />
                    <StatRow
                      label={isAppointmentVenue ? `${clientWord} places booked` : 'Covers booked'}
                      value={String(summary.covers_booked)}
                      accent="brand"
                    />
                    <StatRow
                      label={
                        isAppointmentVenue
                          ? `${clientWord}s seen (arrived / completed)`
                          : 'Covers seated'
                      }
                      value={String(summary.covers_seated)}
                      accent="emerald"
                    />
                  </View>

                  {/* Status bar chart */}
                  {Object.keys(summary.by_status).length > 0 ? (
                    <View style={styles.chartSection}>
                      <Text variant="overline" tone="muted">
                        {isAppointmentVenue ? 'Appointment status (latest)' : 'By status (latest)'}
                      </Text>
                      <SvgBarChart
                        data={Object.entries(summary.by_status).map(([status, count]) => ({
                          key: status,
                          // Appointment venues say "Started", never "Seated".
                          label: isAppointmentVenue
                            ? bookingStatusDisplayLabel(status, false)
                            : status,
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
                        {isAppointmentVenue
                          ? 'How they booked (when created)'
                          : 'By source (when created)'}
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

              {/* Per-booking-model breakdown (more than one type with activity) */}
              {showModelBreakdown ? (
                <Card>
                  <CardHeader
                    title="By booking type"
                    onExport={exportModelBreakdown}
                    exportDisabled={modelRows.length === 0}
                    exportBlockedMessage="There is no booking-type breakdown to export for this period."
                  />
                  <Text variant="bodySmall" tone="secondary" style={styles.cardIntro}>
                    {`How this period’s ${bookingLower}s split across your active booking types, inferred from each ${bookingLower}. Covers / guests is the total headcount; deposits is the amount marked collected.`}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={[styles.modelTable, { borderColor: colors.border }]}>
                      <View
                        style={[
                          styles.modelHeader,
                          { borderBottomColor: colors.border, backgroundColor: colors.surface },
                        ]}>
                        <Text variant="caption" tone="muted" style={styles.modelNameCol}>
                          Type
                        </Text>
                        <Text variant="caption" tone="muted" style={styles.modelNumCol}>
                          {`${bookingWord}s`}
                        </Text>
                        <Text variant="caption" tone="muted" style={styles.modelWideCol}>
                          Covers / guests
                        </Text>
                        <Text variant="caption" tone="muted" style={styles.modelNumCol}>
                          Completed
                        </Text>
                        <Text variant="caption" tone="muted" style={styles.modelNumCol}>
                          Cancelled
                        </Text>
                        <Text variant="caption" tone="muted" style={styles.modelNumCol}>
                          Checked in
                        </Text>
                        <Text variant="caption" tone="muted" style={styles.modelMoneyCol}>
                          Deposits
                        </Text>
                      </View>
                      {modelRows.map((row) => (
                        <View
                          key={row.booking_model}
                          style={[styles.modelRow, { borderBottomColor: colors.border }]}>
                          <Text variant="bodySmall" numberOfLines={1} style={styles.modelNameCol}>
                            {modelRowLabel(row)}
                          </Text>
                          <Text variant="bodySmall" style={[styles.modelNumCol, styles.modelNum]}>
                            {row.booking_count}
                          </Text>
                          <Text variant="bodySmall" style={[styles.modelWideCol, styles.modelNum]}>
                            {row.covers}
                          </Text>
                          <Text
                            variant="bodySmall"
                            style={[styles.modelNumCol, styles.modelNum, { color: colors.success }]}>
                            {row.completed_count}
                          </Text>
                          <Text
                            variant="bodySmall"
                            style={[styles.modelNumCol, styles.modelNum, { color: colors.warning }]}>
                            {row.cancelled_count}
                          </Text>
                          <Text variant="bodySmall" style={[styles.modelNumCol, styles.modelNum]}>
                            {row.checked_in_count}
                          </Text>
                          <Text variant="bodyMedium" style={[styles.modelMoneyCol, styles.modelNum]}>
                            {modelDepositDisplay(row)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
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
                  exportBlockedMessage="There is no no-show rate data to export for this period."
                />
                {isAppointmentVenue ? (
                  <Text variant="bodySmall" tone="secondary" style={styles.cardIntro}>
                    {`${clientWord}s who confirmed an online ${bookingLower} but did not attend (walk-ins excluded from the denominator). Use this to track reliability and follow-up.`}
                  </Text>
                ) : null}
                <View style={styles.stats}>
                  <StatRow
                    label="Overall rate"
                    value={`${noShowRatePct.toFixed(1)}%`}
                    accent={noShowRatePct > 10 ? 'red' : 'emerald'}
                  />
                  <StatRow label="Total no-shows" value={String(totalNoShows)} />
                  <StatRow label="Eligible appointments" value={String(totalConfirmed)} />
                </View>
                {noShowSeries.length > 0 ? (
                  <View style={styles.chartSection}>
                    <Text variant="overline" tone="muted">
                      Daily rate
                    </Text>
                    {/* The whole series, days with no activity included, exactly
                        as the web plots it (ReportsView.tsx:1084-1090). */}
                    <SvgLineChart
                      data={noShowSeries.map((row) => ({
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
                ) : (
                  <Text variant="bodySmall" tone="muted" style={styles.cardIntro}>
                    No data for this period
                  </Text>
                )}
              </Card>

              {/* Report 3: Cancellations */}
              {cancellation ? (
                <Card>
                  <CardHeader
                    title="Cancellation rate"
                    onExport={exportReport3}
                    exportDisabled={!cancellation}
                    exportBlockedMessage="There is no cancellation data to export for this period."
                  />
                  {isAppointmentVenue ? (
                    <Text variant="bodySmall" tone="secondary" style={styles.cardIntro}>
                      {`Auto (unpaid) counts ${bookingLower}s that moved from Pending to Cancelled - for example when a required deposit was not completed in time.`}
                    </Text>
                  ) : null}
                  <View style={styles.stats}>
                    <StatRow
                      label="Cancellation rate"
                      value={`${cancellation.cancellation_rate_pct}%`}
                      accent={cancellation.cancellation_rate_pct > 10 ? 'red' : 'emerald'}
                    />
                    <StatRow
                      label={isAppointmentVenue ? `${clientWord}-initiated` : 'Guest-initiated'}
                      value={String(cancellation.cancelled_guest_initiated)}
                    />
                    <StatRow label="Auto (unpaid)" value={String(cancellation.cancelled_auto)} />
                    <StatRow
                      label={isAppointmentVenue ? `${bookingWord}s created` : 'Total created'}
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
                    exportBlockedMessage={
                      isAppointmentVenue
                        ? 'There is no payment summary to export for this period.'
                        : 'There is no deposit summary to export for this period.'
                    }
                  />
                  <View style={styles.stats}>
                    <StatRow
                      label="Total collected"
                      value={money(deposit.total_collected_pence)}
                      accent="emerald"
                    />
                    <StatRow
                      label="Total refunded"
                      value={money(deposit.total_refunded_pence)}
                      accent="amber"
                    />
                    <StatRow
                      label="Total forfeited"
                      value={money(deposit.total_forfeited_pence)}
                      accent="red"
                    />
                    {/* Card holds are shown separately from deposits collected:
                        a charged no-show fee is not a deposit payment (spec §13). */}
                    <StatRow
                      label="No-show fees charged"
                      value={`${money(deposit.no_show_fees_charged_pence ?? 0)} (${deposit.no_show_fees_charged_count ?? 0})`}
                      accent="teal"
                    />
                    <StatRow
                      label="Active card holds"
                      value={String(deposit.card_holds_active_count ?? 0)}
                    />
                  </View>
                </Card>
              ) : null}

              {/* Table utilisation — table venues that are not on the appointment model */}
              {showTableUtilisation(
                data.booking_model ?? bookingModel,
                data.table_management_enabled,
              ) ? (
                <TableUtilisationCard rows={tableUtilisation} range={data} />
              ) : null}

              {/* Event ticket-tier sales (D2a) */}
              {eventTiers.length > 0 ? (
                <EventTicketTiersCard rows={eventTiers} range={data} bookingWord={bookingWord} />
              ) : null}

              {/* Resource utilisation (D2b) */}
              {resourceUtilisation.length > 0 ? (
                <ResourceUtilisationCard rows={resourceUtilisation} range={data} />
              ) : null}

              {/* Report 7: Team, Services & Channels — the card is always there
                  for an appointment venue, with an explanation when the range is
                  empty (ReportsView.tsx:895-925). */}
              {isAppointmentVenue ? (
                <Card>
                  <CardHeader
                    title="Team, services & channels"
                    onExport={exportReport7}
                    exportDisabled={!hasAppointmentInsights}
                    exportBlockedMessage="There is no appointment breakdown to export for this period."
                  />
                  <Text variant="bodySmall" tone="secondary" style={styles.cardIntro}>
                    {`Non-cancelled ${bookingLower}s in this date range. Volume is split by ${staffLower} (calendar), by service, and by how the ${clientLower} booked. The "Arrived or completed" bar counts marked arrival, started, or completed visits.`}
                  </Text>

                  {!insights || !hasAppointmentInsights ? (
                    <Text variant="bodySmall" tone="muted" style={styles.cardIntro}>
                      {`No appointment data in this range yet. After ${bookingLower}s are created, you will see performance by ${staffLower} and service here.`}
                    </Text>
                  ) : (
                    <>
                      {insights.by_practitioner.length > 0 ? (
                        <View style={styles.chartSection}>
                          <Text variant="overline" tone="muted">
                            {`By ${staffLower}`}
                          </Text>
                          <SvgBarChart
                            data={insights.by_practitioner.map((row) => ({
                              key: String(row.practitioner_id),
                              label: row.practitioner_name,
                              value: row.booking_count,
                              subValue: `${row.completed_count} arrived or completed`,
                            }))}
                            color={colors.brand}
                            maxValue={pracMax}
                          />
                        </View>
                      ) : null}

                      {insights.by_service.length > 0 ? (
                        <View style={styles.chartSection}>
                          <Text variant="overline" tone="muted">
                            Top services by volume
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
                            {`How ${clientLower}s booked (channel mix)`}
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
                              label="Total add-on revenue"
                              value={money(insights.addon_revenue.total_pence)}
                              accent="emerald"
                            />
                            <StatRow
                              label={`${bookingWord}s with add-ons`}
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
                                <Text variant="caption" tone="muted" style={styles.addonCountCol}>
                                  {`${bookingWord}s`}
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
                                    style={[styles.addonCountCol, { fontVariant: ['tabular-nums'] }]}>
                                    {addon.bookings}
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
                    </>
                  )}
                </Card>
              ) : null}

              {/* Clients summary card (overview tab) */}
              {clients ? (
                <Card>
                  <CardHeader title={`${clientWord}s`} />
                  <View style={styles.stats}>
                    <StatRow
                      label={`Known ${clientLower}s (all-time)`}
                      value={String(clients.identified_clients_total)}
                      accent="brand"
                    />
                    <StatRow
                      label="New this period"
                      value={String(clients.new_clients_in_period)}
                    />
                    <StatRow
                      label="Returning this period"
                      value={String(clients.returning_clients_in_period)}
                      accent="emerald"
                    />
                    <StatRow
                      label={
                        isAppointmentVenue
                          ? `Anonymous ${bookingLower}s (period)`
                          : 'Anonymous visits (period)'
                      }
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
                bookingWord={bookingWord}
                clientLabel={clientWord}
                isAppointment={isAppointmentVenue}
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
    alignItems: 'flex-end',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  dateField: {
    gap: spacing.xs,
  },
  applyBtn: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: minTouchTarget,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    gap: spacing.base,
  },
  rangeLabel: {
    textAlign: 'center',
  },
  rangeCaption: {
    marginTop: spacing.xs,
  },
  stats: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  cardIntro: {
    marginTop: spacing.sm,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
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
  addonCountCol: {
    width: 56,
    textAlign: 'right',
  },
  addonRevCol: {
    width: 72,
    textAlign: 'right',
  },
  modelTable: {
    marginTop: spacing.sm,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
  },
  modelHeader: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  modelNameCol: {
    width: 132,
  },
  modelNumCol: {
    width: 78,
    textAlign: 'right',
    paddingLeft: spacing.xs,
  },
  modelWideCol: {
    width: 104,
    textAlign: 'right',
    paddingLeft: spacing.xs,
  },
  modelMoneyCol: {
    width: 90,
    textAlign: 'right',
    paddingLeft: spacing.xs,
  },
  modelNum: {
    fontVariant: ['tabular-nums'],
  },
  clientsContent: {
    marginTop: spacing.base,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  spacer: {
    height: spacing['2xl'],
  },
});
