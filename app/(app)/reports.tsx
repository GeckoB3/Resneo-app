import { Stack } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { addDaysToDateStr } from '@/lib/dates/venue-dates';
import { formatPence } from '@/lib/format';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import { useReports } from '@/lib/queries/useReports';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type RangeKey = '7d' | '30d' | '90d';

const RANGE_DAYS: Record<RangeKey, number> = { '7d': 7, '30d': 30, '90d': 90 };

const money = (pence: number): string => formatPence(pence) ?? '—';

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text variant="bodySmall" tone="muted">
        {label}
      </Text>
      <Text variant="bodyMedium" style={styles.statValue}>
        {value}
      </Text>
    </View>
  );
}

export default function ReportsScreen() {
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';

  const timeZone = venue?.timezone ?? 'Europe/London';
  const today = calendarDateInTimeZone(new Date(), timeZone);
  const [range, setRange] = useState<RangeKey>('7d');
  const from = addDaysToDateStr(today, -(RANGE_DAYS[range] - 1));

  const query = useReports(from, today, isAdmin);

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

  const data = query.data;
  const summary = data?.report1_booking_summary;
  const noShows = data?.report2_no_show_series ?? [];
  const cancellation = data?.report3_cancellation;
  const deposit = data?.report4_deposit;
  const insights = data?.report7_appointment_insights;
  const clients = data?.client_summary;

  const totalNoShows = noShows.reduce((sum, row) => sum + row.no_show_count, 0);

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <View style={styles.toolbar}>
        <Segmented
          options={[
            { value: '7d', label: 'Last 7 days' },
            { value: '30d', label: '30 days' },
            { value: '90d', label: '90 days' },
          ]}
          value={range}
          onChange={setRange}
        />
      </View>

      {query.isLoading ? (
        <DetailSkeleton />
      ) : query.isError || !data ? (
        <View style={styles.stateWrap}>
          <ErrorState
            message={query.error instanceof ApiError ? query.error.message : 'Could not load reports.'}
            onRetry={() => void query.refetch()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
          }>
          {summary ? (
            <Card>
              <Text variant="label">Bookings</Text>
              <View style={styles.stats}>
                <StatRow label="Created" value={String(summary.total_bookings_created)} />
                <StatRow label="Covers booked" value={String(summary.covers_booked)} />
                <StatRow label="Covers seated" value={String(summary.covers_seated)} />
                {Object.entries(summary.by_status).map(([status, count]) => (
                  <StatRow key={status} label={status} value={String(count)} />
                ))}
              </View>
            </Card>
          ) : null}

          <Card>
            <Text variant="label">No-shows & cancellations</Text>
            <View style={styles.stats}>
              <StatRow label="No-shows" value={String(totalNoShows)} />
              {cancellation ? (
                <>
                  <StatRow
                    label="Guest cancellations"
                    value={String(cancellation.cancelled_guest_initiated)}
                  />
                  <StatRow label="Auto-cancelled" value={String(cancellation.cancelled_auto)} />
                  <StatRow
                    label="Cancellation rate"
                    value={`${cancellation.cancellation_rate_pct.toFixed(1)}%`}
                  />
                </>
              ) : null}
            </View>
          </Card>

          {deposit ? (
            <Card>
              <Text variant="label">Deposits</Text>
              <View style={styles.stats}>
                <StatRow label="Collected" value={money(deposit.total_collected_pence)} />
                <StatRow label="Refunded" value={money(deposit.total_refunded_pence)} />
                <StatRow label="Forfeited" value={money(deposit.total_forfeited_pence)} />
              </View>
            </Card>
          ) : null}

          {clients ? (
            <Card>
              <Text variant="label">Clients</Text>
              <View style={styles.stats}>
                <StatRow label="Identified clients" value={String(clients.identified_clients_total)} />
                <StatRow label="New in period" value={String(clients.new_clients_in_period)} />
                <StatRow label="Returning" value={String(clients.returning_clients_in_period)} />
                <StatRow label="Anonymous visits" value={String(clients.anonymous_visits_in_period)} />
              </View>
            </Card>
          ) : null}

          {insights && insights.by_practitioner.length > 0 ? (
            <Card>
              <Text variant="label">By practitioner</Text>
              <View style={styles.stats}>
                {insights.by_practitioner.map((row) => (
                  <View
                    key={row.practitioner_id}
                    style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                    <Text variant="bodySmall" numberOfLines={1} style={styles.tableName}>
                      {row.practitioner_name}
                    </Text>
                    <Text variant="bodySmall" tone="muted">
                      {row.booking_count} booked · {row.completed_count} done
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {insights && insights.by_service.length > 0 ? (
            <Card>
              <Text variant="label">By service</Text>
              <View style={styles.stats}>
                {insights.by_service.map((row) => (
                  <View
                    key={row.service_id}
                    style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                    <Text variant="bodySmall" numberOfLines={1} style={styles.tableName}>
                      {row.service_name}
                    </Text>
                    <Text variant="bodySmall" tone="muted">
                      {row.booking_count}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {insights?.addon_revenue && insights.addon_revenue.total_pence > 0 ? (
            <Card>
              <Text variant="label">Add-on revenue</Text>
              <View style={styles.stats}>
                <StatRow label="Total" value={money(insights.addon_revenue.total_pence)} />
                <StatRow
                  label="Bookings with add-ons"
                  value={String(insights.addon_revenue.bookings_with_addons)}
                />
                {insights.addon_revenue.top_addons.slice(0, 5).map((addon) => (
                  <StatRow
                    key={addon.addon_name_snapshot}
                    label={addon.addon_name_snapshot}
                    value={money(addon.revenue_pence)}
                  />
                ))}
              </View>
            </Card>
          ) : null}

          <Text variant="caption" tone="muted" style={styles.footnote}>
            {data.from} → {data.to} · full reports & CSV export on the web dashboard.
          </Text>
          <View style={styles.spacer} />
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    padding: spacing.base,
  },
  content: {
    paddingHorizontal: spacing.base,
    gap: spacing.base,
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
  statValue: {
    fontVariant: ['tabular-nums'],
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.base,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableName: {
    flex: 1,
    minWidth: 0,
  },
  footnote: {
    textAlign: 'center',
  },
  spacer: {
    height: spacing.xl,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
});
