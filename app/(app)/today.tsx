import { Stack } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AlertsCard } from '@/components/today/AlertsCard';
import { BookingTypeChips } from '@/components/today/BookingTypeChips';
import { CapacityCard } from '@/components/today/CapacityCard';
import { DiarySection } from '@/components/today/DiarySection';
import { ForecastChart } from '@/components/today/ForecastChart';
import { GreetingHeader } from '@/components/today/GreetingHeader';
import { KpiGrid } from '@/components/today/KpiGrid';
import { Card } from '@/components/ui/Card';
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

// ─── Setup checklist (admin only) ──────────────────────────────────────────

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
        <Text variant="label">
          Finish setting up · {doneCount}/{steps.length}
        </Text>
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
            <Text
              variant="bodySmall"
              color={step.done ? colors.success : colors.textMuted}>
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

// ─── Main screen ───────────────────────────────────────────────────────────

export default function TodayScreen() {
  const query = useDashboardHome();
  const { venue } = useVenueContext();

  const payload = query.data;
  const isAppointment = isAppointmentExperience(
    payload?.pricing_tier ?? venue?.pricing_tier,
    payload?.booking_model ?? venue?.booking_model,
    (payload?.enabled_models as readonly string[] | null | undefined) ?? venue?.enabled_models,
    Boolean(payload?.table_focus_secondaries_enabled),
  );
  const tableFocusSecondariesEnabled = Boolean(payload?.table_focus_secondaries_enabled);

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
      query.error instanceof ApiError
        ? query.error.message
        : "Could not load today's summary.";
    return (
      <Screen>
        {header}
        <ErrorState message={message} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  const { today, forecast = [], alerts = [], recent_bookings } = payload;

  // Compute total bookings across all models for "N more" link
  const bookingsCountAllModes = payload.today_by_booking_model
    ? Object.values(payload.today_by_booking_model).reduce((sum, c) => sum + c, 0)
    : today.bookings;

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
          />
        }>

        {/* Greeting + quick-action buttons */}
        <GreetingHeader isAppointment={isAppointment} />

        {/* Setup checklist (admin-only, dismissible) */}
        <SetupChecklistCard />

        {/* KPI tiles */}
        <KpiGrid today={today} isAppointment={isAppointment} />

        {/* Today by booking type chips (multi-model venues) */}
        {payload.today_by_booking_model &&
        Object.keys(payload.today_by_booking_model).length > 1 &&
        !tableFocusSecondariesEnabled ? (
          <BookingTypeChips todayByBookingModel={payload.today_by_booking_model} />
        ) : null}

        {/* Capacity panel (table/restaurant venues only) */}
        {!isAppointment ? <CapacityCard today={today} /> : null}

        {/* Alerts */}
        <AlertsCard alerts={alerts} />

        {/* 7-day forecast chart */}
        {forecast.length > 0 ? (
          <ForecastChart days={forecast} isAppointment={isAppointment} />
        ) : null}

        {/* Today's bookings diary with tappable rows */}
        <DiarySection
          recentBookings={recent_bookings}
          isAppointment={isAppointment}
          tableFocusSecondariesEnabled={tableFocusSecondariesEnabled}
          totalCount={bookingsCountAllModes}
        />

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
