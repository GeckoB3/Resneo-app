import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { BaselineMetricsCard } from '@/components/reports/BaselineMetricsCard';
import { BookedRevenueSection } from '@/components/reports/BookedRevenueSection';
import { NewBookingsSection } from '@/components/reports/NewBookingsSection';
import { SmsUsageBanner } from '@/components/reports/SmsUsageBanner';
import { CommissionSection, SalesSection, TakingsSection, VouchersSection } from '@/components/reports/PosReportSections';
import { BookingLogEmailCard } from '@/components/reports/BookingLogEmailCard';
import { ClientsTab } from '@/components/reports/ClientsTab';
import { ChangePill, ComparisonCaption, CompareWithControl } from '@/components/reports/ComparisonParts';
import { ReportTable, type Column } from '@/components/reports/pos/PosReportUi';
import {
  CalendarRefusal,
  CalendarScopeNote,
  ReportCalendarPicker,
  ReportCalendarProvider,
  useReportCalendarFilter,
} from '@/components/reports/ReportCalendarFilter';
import { StaffPosReportsPanel } from '@/components/reports/pos/StaffPosReportsPanel';
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
import { Chip } from '@/components/ui/Chip';
import { Segmented } from '@/components/ui/Segmented';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { bookingStatusDisplayLabel } from '@/lib/booking/infer-booking-row-model';
import { addDaysToDateStr, formatReportRangeLabel } from '@/lib/dates/venue-dates';
import { formatPence } from '@/lib/format';
import { hapticTap } from '@/lib/haptics';
import { isPosEnabled, isVouchersEnabled } from '@/lib/pos/pos-enabled';
import { reportsCopy } from '@/lib/pos/reports-copy';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import { usePosReportAccess } from '@/lib/queries/usePos';
import { useVenue } from '@/lib/queries/useVenue';
import { useReports } from '@/lib/queries/useReports';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { aggregateSourcesByLabel } from '@/lib/reports/csv-export';
import { reportCalendarCopy } from '@/lib/reports/report-calendar';
import { describeChange, type ChangeKind } from '@/lib/reports/report-comparison';
import { NEW_BOOKING_CHANNELS, NEW_BOOKING_CHANNEL_LABELS } from '@/lib/reports/new-bookings';
import { bookingScopeQuery, isPartnerShowing, reportScopeCopy, scopeRefusalMessage } from '@/lib/reports/report-scope';
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
import { useSelectedPillScroll } from '@/lib/ui/useSelectedPillScroll';
import { isAppointmentFromVenue } from '@/lib/venue/venue-experience';
import { useVenueContext } from '@/providers/VenueProvider';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { OverviewBusinessRow, OverviewHeadline } from '@/types/reports';

// ─── Types ───────────────────────────────────────────────────────────────────
type RangeKey = '7d' | '30d' | '90d' | 'custom';
type MainTab = 'overview' | 'new-bookings' | 'revenue' | 'clients' | 'takings' | 'sales' | 'vouchers' | 'commission';

const TAB_PARAMS: MainTab[] = ['new-bookings', 'revenue', 'clients', 'takings', 'sales', 'vouchers', 'commission'];

const RANGE_DAYS: Record<Exclude<RangeKey, 'custom'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const money = (pence: number): string => formatPence(pence) ?? 'None';

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
  const venueQuery = useVenue();
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
  // `?tab=new-bookings` opens that tab (Today's New bookings card links here,
  // as the web's does), and so do `takings`, `sales`, `vouchers` and
  // `commission` where they exist; anything else the Overview.
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [mainTab, setMainTab] = useState<MainTab>(() =>
    (TAB_PARAMS as string[]).includes(tabParam ?? '') ? (tabParam as MainTab) : 'overview',
  );

  /**
   * The Showing picker (lib/reports/report-scope.ts): your whole venue, one of your calendars, a
   * business you may report on, one of its calendars, or everyone together, with "Compare with"
   * beside it. It lives here, above the tabs, so both choices hold while moving between them, and
   * reaches each section through `ReportCalendarProvider`. A team member's panel has its own,
   * without businesses.
   */
  const calendarFilter = useReportCalendarFilter(isAdmin);
  const showing = calendarFilter.showing;
  const compare = calendarFilter.compare;
  const scopeQuery = useMemo(() => ({ ...bookingScopeQuery(showing), compare }), [showing, compare]);

  const query = useReports(appliedFrom, appliedTo, isAdmin, scopeQuery);
  /**
   * Takings, Sales, Vouchers and Commission (POS plan P7-4, web ReportsView). Asked at every venue,
   * as the web asks: the server shows Takings and Sales where Checkout is on or the venue has a
   * completed sale (`visible`, plan §4.18, PQ69), so a venue that switched Checkout off keeps its
   * sales history. Where it says no, the four-option control below is unchanged. A team member who
   * is not an admin gets Takings and Sales only, with `view_reports` (web `StaffPosReportsPanel`).
   */
  const posAccess = usePosReportAccess({ enabled: !staffQuery.isLoading });
  const posAccessPending = posAccess.data === undefined && posAccess.isLoading;
  // The renamed figures and the POS export kinds follow `visible` (web `posReportsVisible`).
  const posReportsVisible = posAccess.data?.visible === true;
  const showPosTabs = posReportsVisible && posAccess.data?.can_view === true;
  const canExportPos = posAccess.data?.can_export === true;
  // Vouchers (UX spec §20.11): admins, while gift vouchers are switched on, which needs Checkout on.
  // Commission (§22.2): admins, wherever the POS tabs show, while Checkout is on: its report route
  // refuses with Checkout off, so a venue keeping only its history does not get a tab that fails.
  const vouchersVisible = showPosTabs && isAdmin && isVouchersEnabled(venueQuery.data);
  const commissionVisible = showPosTabs && isAdmin && isPosEnabled(venueQuery.data);
  // A link to a POS tab this venue or login does not have falls back to the Overview (once the
  // access answer is in; until then the tab waits on a skeleton, as on the web).
  const shownTab: MainTab =
    ((mainTab === 'takings' || mainTab === 'sales') && !showPosTabs && !posAccessPending) ||
    (mainTab === 'vouchers' && !vouchersVisible && !posAccessPending) ||
    (mainTab === 'commission' && !commissionVisible && !posAccessPending)
      ? 'overview'
      : mainTab;
  const posTab = shownTab === 'takings' || shownTab === 'sales' || shownTab === 'vouchers' || shownTab === 'commission';
  // Keeps the selected tab chip in view when the screen opens on one off the right edge.
  const {
    ref: tabStripRef,
    onLayout: onTabStripLayout,
    onContentSizeChange: onTabStripContentSize,
    onPillLayout: onTabPillLayout,
  } = useSelectedPillScroll(shownTab);

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

  // How they booked (release 1): the New bookings channels, or, from an older server, the sources.
  const channelBars = insights?.by_channel
    ? NEW_BOOKING_CHANNELS.filter((c) => (insights.by_channel?.[c] ?? 0) > 0).map((c) => ({
        key: c,
        label: NEW_BOOKING_CHANNEL_LABELS[c],
        value: insights.by_channel?.[c] ?? 0,
      }))
    : insights
      ? aggregateSourcesByLabel(insights.by_booking_source).map(({ name, value }) => ({ key: name, label: name, value }))
      : [];

  const hasAppointmentInsights = Boolean(
    insights &&
      (insights.by_practitioner.length > 0 ||
        insights.by_service.length > 0 ||
        channelBars.length > 0),
  );

  // ── Comparison with the earlier period (release 1): nothing from an older server ──
  const headline = data?.headline ?? null;
  const earlier = data?.comparison?.figures ?? null;
  const changeOf = (key: keyof OverviewHeadline, kind: ChangeKind, higherIsBetter = true) =>
    headline && earlier ? describeChange(headline[key], earlier[key], kind, higherIsBetter) : null;
  const pill = (key: keyof OverviewHeadline, kind: ChangeKind, higherIsBetter = true) => {
    const change = changeOf(key, kind, higherIsBetter);
    return change ? <ChangePill change={change} /> : undefined;
  };
  // Each business's figures, only for everyone together.
  const byBusiness = data?.by_business && data.by_business.length > 0 ? data.by_business : null;
  const togetherNames = byBusiness?.map((b) => b.venue_name);

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
      modelBreakdownCsvFilename(data.from, data.to, data.calendar ?? null),
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
    // A team member given `view_reports` sees Takings and Sales only (web `StaffPosReportsPanel`);
    // everything else in Reports stays admin only, and the routes check again on every request.
    if (posAccessPending) {
      return (
        <Screen>
          {header}
          <Text variant="bodySmall" tone="muted">
            {reportsCopy('staff.loading')}
          </Text>
        </Screen>
      );
    }
    if (showPosTabs) {
      return (
        <Screen scroll={false} padded={false}>
          {header}
          <StaffPosReportsPanel
            canExport={canExportPos}
            today={today}
            initialTab={tabParam === 'sales' ? 'sales' : 'takings'}
          />
        </Screen>
      );
    }
    return (
      <Screen>
        {header}
        {posReportsVisible ? (
          <Text variant="bodySmall" tone="secondary">
            {reportsCopy('staff.ask')}
          </Text>
        ) : (
          <ErrorState message="Reports are only available to venue admins." />
        )}
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
  const channelMax = Math.max(...channelBars.map((b) => b.value), 1);

  const rangeLabel = data ? formatReportRangeLabel(data.from, data.to) : '';

  // "SMS segments this period", admins only, heads the Overview and no other tab (Part 2 mock-up 3,
  // 2026-10-11): it is about the plan, not takings or sales, and it pushed every tab's first figure
  // below the fold.
  const smsBanner = <SmsUsageBanner enabled={isAdmin} />;
  // The Overview and Clients payload refused because of the choice: the server's words.
  const overviewRefusal = query.isError ? scopeRefusalMessage(query.error, showing.kind !== 'venue') : null;
  // The bookings tabs follow the comparison; the till tabs do not compare.
  const comparesTab = shownTab === 'overview' || shownTab === 'clients' || shownTab === 'new-bookings' || shownTab === 'revenue';

  /** "Business" with "(you)" by your own, as the Booked value venue table names them. */
  const businessNameColumn = {
    label: reportScopeCopy('scope.business.col'),
    value: (r: OverviewBusinessRow) => (
      <Text variant="bodyMedium">
        {r.venue_name}
        {r.access === 'own' ? (
          <Text variant="caption" tone="muted">
            {' (you)'}
          </Text>
        ) : null}
      </Text>
    ),
  };
  const overviewBusinessColumns: Column<OverviewBusinessRow>[] = [
    businessNameColumn,
    { label: `${bookingWord}s created`, value: (r) => String(r.headline.bookings_created), numeric: true },
    { label: 'Cancellation rate', value: (r) => `${r.headline.cancellation_rate_pct}%`, numeric: true },
    { label: 'No-shows', value: (r) => String(r.headline.no_show_count), numeric: true },
    { label: 'Deposits collected', value: (r) => money(r.headline.deposits_collected_pence), numeric: true },
  ];
  const clientBusinessColumns: Column<OverviewBusinessRow>[] = [
    businessNameColumn,
    { label: `New ${clientLower}s`, value: (r) => String(r.headline.new_clients), numeric: true },
    { label: `Returning ${clientLower}s`, value: (r) => String(r.headline.returning_clients), numeric: true },
  ];
  const businessTable = (columns: Column<OverviewBusinessRow>[]) =>
    byBusiness ? (
      <Card>
        <CardHeader title={reportScopeCopy('scope.byBusiness')} />
        <View style={styles.stats}>
          <ReportTable
            caption={reportScopeCopy('scope.byBusiness')}
            columns={columns}
            rows={byBusiness}
            rowKey={(r) => r.venue_id}
          />
        </View>
      </Card>
    ) : null;

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ReportCalendarProvider
        showing={showing}
        options={calendarFilter.options}
        compare={compare}
        onClear={calendarFilter.clear}>

      {/* ── Toolbar: presets + sub-tabs ─────────────────────────── */}
      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        {/* Preset chips. The Revenue and New bookings tabs carry their own
            ranges (web parity: the date-range card is hidden on both). */}
        {shownTab !== 'revenue' && shownTab !== 'new-bookings' && !posTab ? (
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
        {shownTab !== 'revenue' && shownTab !== 'new-bookings' && !posTab && rangeKey === 'custom' ? (
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

        {/* Overview / Revenue / Clients sub-tabs (web #191 added Revenue). Where Takings and Sales
            exist (POS venues, P7-4) the control becomes a scrollable chip row (`app.reports.chips`)
            in the web's order, with Vouchers and Commission for admins where the web shows them,
            and Revenue reads "Booked value" as on the web (§4.18). Everywhere else it is the
            four-option control, unchanged. */}
        {showPosTabs ? (
          <ScrollView
            ref={tabStripRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityLabel="Report tabs"
            contentContainerStyle={styles.tabChips}
            onLayout={onTabStripLayout}
            onContentSizeChange={onTabStripContentSize}>
            {(
              [
                { value: 'overview', label: 'Overview' },
                { value: 'new-bookings', label: 'New bookings' },
                { value: 'revenue', label: 'Booked value' },
                { value: 'takings', label: reportsCopy('tab.takings') },
                { value: 'sales', label: reportsCopy('tab.sales') },
                ...(vouchersVisible ? [{ value: 'vouchers', label: reportsCopy('tab.vouchers') }] : []),
                ...(commissionVisible ? [{ value: 'commission', label: reportsCopy('tab.commission') }] : []),
                { value: 'clients', label: `${clientWord}s` },
              ] as { value: MainTab; label: string }[]
            ).map((o) => (
              <View key={o.value} onLayout={(e) => onTabPillLayout(o.value, e)}>
                <Chip label={o.label} selected={shownTab === o.value} onPress={() => setMainTab(o.value)} />
              </View>
            ))}
          </ScrollView>
        ) : (
          <Segmented
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'new-bookings', label: 'New bookings' },
              { value: 'revenue', label: 'Revenue' },
              { value: 'clients', label: `${clientWord}s` },
            ]}
            value={posTab ? 'overview' : shownTab}
            onChange={setMainTab}
          />
        )}

        {/* What the figures are for: your venue, a calendar, a linked business or everyone
            together, for every tab that can be narrowed; the rest say they are your venue's. Shown
            once there is a choice to make, and kept while moving between tabs. */}
        {calendarFilter.showPicker ? (
          <ReportCalendarPicker
            options={calendarFilter.options}
            value={showing}
            onChange={calendarFilter.choose}
            // Takings and Vouchers are always the whole venue's, and a partner's till money is never
            // shared: greyed out there, as on the web.
            disabled={
              shownTab === 'takings' ||
              shownTab === 'vouchers' ||
              ((shownTab === 'sales' || shownTab === 'commission') && isPartnerShowing(showing))
            }
          />
        ) : null}
        {/* The bookings tabs' comparison, kept while moving between them. */}
        {comparesTab ? <CompareWithControl value={compare} onChange={calendarFilter.setCompare} /> : null}
      </View>

      {/* ── Content ──────────────────────────────────────────────── */}
      {posTab && posAccessPending ? (
        <DetailSkeleton />
      ) : posTab && showPosTabs ? (
        // Each POS tab picks its own dates and grain, as Revenue and New bookings do.
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {shownTab === 'takings' ? (
            <TakingsSection canExport={canExportPos} isAdmin={isAdmin} today={today} />
          ) : shownTab === 'sales' ? (
            <SalesSection canExport={canExportPos} today={today} />
          ) : shownTab === 'vouchers' ? (
            <VouchersSection
              canExport={canExportPos}
              timeZone={timeZone}
              currency={venueQuery.data?.currency ?? posAccess.data?.currency ?? 'GBP'}
            />
          ) : (
            <CommissionSection today={today} />
          )}
          <View style={styles.spacer} />
        </ScrollView>
      ) : shownTab === 'new-bookings' ? (
        // New bookings has its own query and range (web 2026-09-18), like Revenue.
        <ScrollView contentContainerStyle={styles.content}>
          <NewBookingsSection bookingWord={bookingWord} today={today} enabled={isAdmin} />
          <View style={styles.spacer} />
        </ScrollView>
      ) : shownTab === 'revenue' ? (
        // Booked revenue has its own query and range (web #191); it does not
        // wait on the overview payload.
        <ScrollView contentContainerStyle={styles.content}>
          <BookedRevenueSection bookingWord={bookingWord} today={today} enabled={isAdmin} />
          <View style={styles.spacer} />
        </ScrollView>
      ) : query.isLoading ? (
        <DetailSkeleton />
      ) : overviewRefusal ? (
        // The server can't narrow the Overview to this calendar yet (409 before its migration) or
        // doesn't know it (400): its words in place of the Overview's figures, while every section
        // that loads on its own (SMS usage, history, the export, the client list) still shows, so one
        // refusal never blocks the rest (web 90ff4d17).
        <ScrollView contentContainerStyle={styles.content}>
          {shownTab === 'overview' ? smsBanner : null}
          <CalendarRefusal message={overviewRefusal} />
          {shownTab === 'clients' ? (
            <Card>
              <CardHeader title={`${clientWord} directory`} />
              <View style={styles.clientsContent}>
                <ClientsTab
                  clientWord={clientWord}
                  bookingWord={bookingWord}
                  isAppointment={isAppointmentVenue}
                />
              </View>
            </Card>
          ) : (
            <>
              <HistorySection
                isAppointmentVenue={isAppointmentVenue}
                today={today}
                showClassCommerceNote={Boolean(data?.enabled_models?.includes('class_session'))}
              />
              <DataExportCard bookingWord={bookingWord} clientLabel={clientWord} today={today} posKinds={posReportsVisible} />
            </>
          )}
          <View style={styles.spacer} />
        </ScrollView>
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
          {shownTab === 'overview' ? smsBanner : null}

          {/* Range label */}
          <Text variant="caption" tone="muted" style={styles.rangeLabel}>
            {rangeLabel}
          </Text>
          {/* What the Overview and Clients figures are for, from the answer itself (the web's words).
              A filtered Overview sends no table utilisation and no baseline snapshot; those cards
              read the empty answer as they always have. */}
          <CalendarScopeNote
            echoed={data.calendar}
            scope={data.scope}
            togetherNames={togetherNames}
            detail={
              shownTab === 'clients'
                ? reportCalendarCopy('cal.detail.clients', { client: clientWord, clientLower })
                : reportCalendarCopy('cal.detail.overview')
            }
          />

          {/* ── CLIENTS TAB ─────────────────────────────────── */}
          {shownTab === 'clients' ? (
            <>
            <Card>
              <CardHeader title={`${clientWord} directory`} basis={reportScopeCopy('basis.date')} />
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
                      badge={pill('new_clients', 'count')}
                      style={styles.tile}
                    />
                    <StatTile
                      label="Returning this period"
                      value={String(clients.returning_clients_in_period)}
                      caption={rangeLabel}
                      badge={pill('returning_clients', 'count')}
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
                  <ComparisonCaption comparison={data.comparison} style={styles.cardIntro} />
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
            {businessTable(clientBusinessColumns)}
            </>
          ) : (
            /* ── OVERVIEW TAB ─────────────────────────────────── */
            <>
              <ComparisonCaption comparison={data.comparison} />
              {businessTable(overviewBusinessColumns)}

              {/* Report 1: Bookings / Appointment Activity */}
              {summary ? (
                <Card>
                  <CardHeader
                    title={isAppointmentVenue ? 'Appointment activity' : 'Booking summary'}
                    basis={reportScopeCopy('basis.made')}
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
                      badge={pill('bookings_created', 'count')}
                    />
                    <StatRow
                      label={isAppointmentVenue ? `${clientWord} places booked` : 'Covers booked'}
                      value={String(summary.covers_booked)}
                      accent="brand"
                      badge={pill('places_booked', 'count')}
                    />
                    <StatRow
                      label={
                        isAppointmentVenue
                          ? `${clientWord}s seen (arrived / completed)`
                          : 'Covers seated'
                      }
                      value={String(summary.covers_seated)}
                      accent="emerald"
                      badge={pill('seen', 'count')}
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
                    basis={reportScopeCopy('basis.date')}
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
                  basis={reportScopeCopy('basis.date')}
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
                    badge={pill('no_show_rate_pct', 'rate', false)}
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
                    basis={reportScopeCopy('basis.made')}
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
                      badge={pill('cancellation_rate_pct', 'rate', false)}
                    />
                    <StatRow
                      label={isAppointmentVenue ? `${clientWord}-initiated` : 'Guest-initiated'}
                      value={String(cancellation.cancelled_guest_initiated)}
                    />
                    {typeof cancellation.cancelled_team_initiated === 'number' ? (
                      <StatRow label="By your team" value={String(cancellation.cancelled_team_initiated)} />
                    ) : null}
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
                  {/* Where Takings appears, this card is renamed so it is never read as
                      money taken (web ReportsView, plan §4.18, R28). */}
                  <CardHeader
                    title={
                      posReportsVisible
                        ? reportsCopy('ov.depositsByBookingDate')
                        : isAppointmentVenue
                          ? 'Payments & deposits'
                          : 'Deposit summary'
                    }
                    basis={reportScopeCopy('basis.made')}
                    onExport={exportReport4}
                    exportDisabled={!deposit}
                    exportBlockedMessage={
                      isAppointmentVenue && !posReportsVisible
                        ? 'There is no payment summary to export for this period.'
                        : 'There is no deposit summary to export for this period.'
                    }
                  />
                  <View style={styles.stats}>
                    <StatRow
                      label="Total collected"
                      value={money(deposit.total_collected_pence)}
                      accent="emerald"
                      badge={pill('deposits_collected_pence', 'money')}
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
                    basis={reportScopeCopy('basis.date')}
                    onExport={exportReport7}
                    exportDisabled={!hasAppointmentInsights}
                    exportBlockedMessage="There is no appointment breakdown to export for this period."
                  />
                  <Text variant="bodySmall" tone="secondary" style={styles.cardIntro}>
                    {`Visits in this date range that were not cancelled, split by ${staffLower} (calendar), by service, and by how the ${clientLower} booked. A visit with several services counts once on each calendar and once for each service in it. The "Arrived or completed" bar counts marked arrival, started, or completed visits.`}
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

                      {channelBars.length > 0 ? (
                        <View style={styles.chartSection}>
                          <Text variant="overline" tone="muted">
                            {`How ${clientLower}s booked (channel mix)`}
                          </Text>
                          <SvgBarChart
                            data={channelBars}
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
                                    {addon.addon_group_name_snapshot ?? 'No group'}
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
                  <CardHeader title={`${clientWord}s`} basis={reportScopeCopy('basis.date')} />
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
              <DataExportCard bookingWord={bookingWord} clientLabel={clientWord} today={today} posKinds={posReportsVisible} />

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
      </ReportCalendarProvider>
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
  tabChips: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
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
