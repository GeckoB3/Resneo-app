import { Stack } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { StatusPill } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { useDashboardHome } from '@/lib/queries/useDashboardHome';
import { useDismissSetupChecklist, useSetupStatus } from '@/lib/queries/useSetupStatus';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { isAppointmentExperience } from '@/lib/venue/venue-experience';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingStatus } from '@/types/booking-detail';
import type { DashboardForecastDay } from '@/types/dashboard';

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card style={styles.kpi}>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="display" numberOfLines={1} style={styles.kpiValue}>
        {value}
      </Text>
      {hint ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}

function ForecastChart({ days, isAppointment }: { days: DashboardForecastDay[]; isAppointment: boolean }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...days.map((d) => (isAppointment ? d.bookings : d.covers)));
  return (
    <Card>
      <Text variant="label">Next 7 days</Text>
      <View style={styles.chart}>
        {days.map((day) => {
          const value = isAppointment ? day.bookings : day.covers;
          return (
            <View key={day.date} style={styles.chartCol}>
              <Text variant="caption" tone="muted">
                {value}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    { height: `${Math.round((value / max) * 100)}%`, backgroundColor: colors.accent },
                  ]}
                />
              </View>
              <Text variant="caption" tone="muted">
                {day.day}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function SetupChecklistCard() {
  const { colors } = useTheme();
  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  const setupQuery = useSetupStatus(isAdmin);
  const dismiss = useDismissSetupChecklist();

  const status = setupQuery.data;
  if (!isAdmin || !status || status.setup_checklist_dismissed) return null;

  const steps = [
    { done: status.profile_complete, label: 'Complete your venue profile' },
    { done: status.availability_set, label: 'Add staff & working hours' },
    { done: status.guest_booking_ready, label: 'Publish your booking page' },
    { done: status.stripe_connected, label: 'Connect Stripe for deposits' },
    { done: status.first_booking_made, label: 'Take your first booking' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Card>
      <View style={styles.checklistHeader}>
        <Text variant="label">Finish setting up · {doneCount}/{steps.length}</Text>
        <Text
          variant="bodySmall"
          tone="muted"
          onPress={() => dismiss.mutate()}
          accessibilityRole="button"
          accessibilityLabel="Dismiss setup checklist">
          Dismiss
        </Text>
      </View>
      <View style={styles.checklist}>
        {steps.map((step) => (
          <View key={step.label} style={styles.checklistRow}>
            <Text variant="bodySmall" color={step.done ? colors.success : colors.textMuted}>
              {step.done ? '✓' : '○'}
            </Text>
            <Text
              variant="bodySmall"
              tone={step.done ? 'muted' : 'secondary'}
              style={step.done ? styles.checklistDone : undefined}>
              {step.label}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="caption" tone="muted">
        Setup steps are completed on the web dashboard.
      </Text>
    </Card>
  );
}

export default function TodayScreen() {
  const { colors } = useTheme();
  const query = useDashboardHome();
  const { venue } = useVenueContext();

  const payload = query.data;
  const isAppointment = isAppointmentExperience(
    payload?.pricing_tier ?? venue?.pricing_tier,
    payload?.booking_model ?? venue?.booking_model,
    payload?.enabled_models ?? venue?.enabled_models,
    Boolean(payload?.table_focus_secondaries_enabled),
  );
  const unit = isAppointment ? 'appointments' : 'covers';

  const header = <Stack.Screen options={{ title: 'Today' }} />;

  if (query.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  if (query.isError || !payload) {
    const message =
      query.error instanceof ApiError ? query.error.message : 'Could not load today’s summary.';
    return (
      <Screen>
        {header}
        <ErrorState message={message} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  const { today, forecast = [], alerts = [], recent_bookings } = payload;
  const nextLabel = today.next_booking
    ? `${today.next_booking.time} · ${today.next_booking.party_size}`
    : '—';

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }>
        <SetupChecklistCard />

        <View style={styles.kpiGrid}>
          <Kpi label={`Today’s ${unit}`} value={String(isAppointment ? today.bookings : today.covers)} />
          <Kpi label="Confirmed" value={String(today.confirmed)} hint={`${today.pending} pending`} />
          <Kpi label="Arriving soon" value={String(today.arriving_within_30_min)} hint="next 30 min" />
          <Kpi label="Next up" value={nextLabel} />
        </View>

        {alerts.length > 0 ? (
          <Card style={{ borderColor: colors.warning, borderWidth: 1 }}>
            <Text variant="label">Alerts</Text>
            <View style={styles.alerts}>
              {alerts.map((alert, index) => (
                <Text key={index} variant="bodySmall" tone="secondary">
                  • {alert.message}
                </Text>
              ))}
            </View>
          </Card>
        ) : null}

        {forecast.length > 0 ? <ForecastChart days={forecast} isAppointment={isAppointment} /> : null}

        <Card>
          <Text variant="label">Today’s bookings</Text>
          {recent_bookings.length === 0 ? (
            <EmptyState title="Nothing booked yet" message="New bookings will appear here." />
          ) : (
            <View style={styles.recent}>
              {recent_bookings.map((booking) => (
                <View
                  key={booking.id}
                  style={[styles.recentRow, { borderBottomColor: colors.border }]}>
                  <Text variant="bodyMedium" style={styles.recentTime}>
                    {booking.time}
                  </Text>
                  <View style={styles.recentText}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {booking.guest_name}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {booking.party_size} · {booking.kind_label ?? unit}
                    </Text>
                  </View>
                  <StatusPill
                    status={booking.status as BookingStatus}
                    isTableReservation={booking.booking_model === 'table_reservation'}
                  />
                </View>
              ))}
            </View>
          )}
        </Card>

        <Text variant="caption" tone="muted" style={styles.footnote}>
          Tap a booking in Bookings or the Calendar to manage it.
        </Text>
        <View style={styles.spacer} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kpi: {
    flexGrow: 1,
    flexBasis: '46%',
    gap: 2,
  },
  kpiValue: {
    fontVariant: ['tabular-nums'],
  },
  alerts: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  chart: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 120,
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  barTrack: {
    flex: 1,
    width: 14,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 2,
  },
  recent: {
    marginTop: spacing.sm,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentTime: {
    width: 52,
    fontVariant: ['tabular-nums'],
  },
  recentText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  footnote: {
    textAlign: 'center',
  },
  spacer: {
    height: spacing.xl,
  },
  checklistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  checklist: {
    marginVertical: spacing.sm,
    gap: spacing.sm,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checklistDone: {
    textDecorationLine: 'line-through',
  },
});
