import { Stack, useRouter, type Href } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { AlertsCard } from '@/components/today/AlertsCard';
import { BookingTypeChips } from '@/components/today/BookingTypeChips';
import { CapacityCard } from '@/components/today/CapacityCard';
import { DiarySection } from '@/components/today/DiarySection';
import { ForecastChart } from '@/components/today/ForecastChart';
import { GreetingHeader } from '@/components/today/GreetingHeader';
import { HeatmapWeek } from '@/components/today/HeatmapWeek';
import { KpiGrid } from '@/components/today/KpiGrid';
import { deriveSetupProgress } from '@/components/today/setup-checklist-steps';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticTap } from '@/lib/haptics';
import { useDashboardHome } from '@/lib/queries/useDashboardHome';
import { useDismissSetupChecklist, useSetupStatus } from '@/lib/queries/useSetupStatus';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { isAppointmentExperience } from '@/lib/venue/venue-experience';
import { useVenueContext } from '@/providers/VenueProvider';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

// ─── Setup checklist (admin only) ──────────────────────────────────────────

/**
 * Onboarding-aware setup checklist — mirrors the web `dashboard/SetupChecklist`.
 * Steps are model-aware (per-model catalog rows appended via
 * `deriveSetupProgress`), there is a progress bar, and when onboarding is NOT
 * complete the card is the pinned first-run surface: it shows a stronger
 * heading and cannot be dismissed.
 */
export function SetupChecklistCard() {
  const { colors } = useTheme();
  const router = useRouter();
  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  // keepPreviousData on the underlying query keeps this stable across token
  // re-keys (see staff-gate-stack-remount); enabled only for admins.
  const setupQuery = useSetupStatus(isAdmin);
  const dismiss = useDismissSetupChecklist();

  const status = setupQuery.data;
  if (!isAdmin || !status) return null;

  const onboardingComplete = status.onboarding_completed;
  // Once onboarding is done, honour the user's dismissal. Pre-onboarding the
  // checklist is the first-run surface and stays pinned regardless.
  if (onboardingComplete && status.setup_checklist_dismissed) return null;

  const progress = deriveSetupProgress(status);
  if (progress.allComplete) return null;

  const { incompleteSteps, completedCount, totalCount, progressPct } = progress;

  const goTo = (route: Href) => {
    hapticTap();
    router.push(route);
  };

  const heading = onboardingComplete
    ? `What's next · ${completedCount}/${totalCount}`
    : `Get your venue ready · ${completedCount}/${totalCount}`;
  const subheading = onboardingComplete
    ? 'Showing only what still needs attention.'
    : 'Outstanding tasks to get your venue live for guests.';

  return (
    <Card>
      <View style={styles.checklistHeader}>
        <View style={styles.checklistHeaderText}>
          <Text variant="label">{heading}</Text>
          <Text variant="caption" tone="muted" style={styles.checklistSubheading}>
            {subheading}
          </Text>
        </View>
        <View style={styles.checklistHeaderRight}>
          <View style={[styles.progressPill, { backgroundColor: colors.brandSubtle }]}>
            <Text variant="caption" color={colors.brand} style={styles.progressPillText}>
              {progressPct}%
            </Text>
          </View>
          {onboardingComplete ? (
            <Pressable
              onPress={() => dismiss.mutate()}
              accessibilityRole="button"
              accessibilityLabel="Dismiss setup checklist"
              hitSlop={12}
              style={styles.dismissHit}>
              <SymbolView
                name={{ ios: 'xmark', android: 'close', web: 'close' }}
                tintColor={colors.textMuted}
                size={16}
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSunken }]}>
        <View
          style={[
            styles.progressFill,
            { width: `${progressPct}%` as `${number}%`, backgroundColor: colors.brand },
          ]}
        />
      </View>

      <View style={styles.checklist}>
        {incompleteSteps.map((step) => (
          <Pressable
            key={step.key}
            onPress={() => goTo(step.route)}
            accessibilityRole="button"
            accessibilityLabel={step.label}
            style={({ pressed }) => [
              styles.checklistRow,
              styles.checklistRowTappable,
              pressed && { opacity: 0.6 },
            ]}>
            <Text variant="bodySmall" color={colors.textMuted}>
              ○
            </Text>
            <View style={styles.checklistRowText}>
              <Text variant="bodySmall" tone="secondary" numberOfLines={1}>
                {step.label}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={2}>
                {step.description}
              </Text>
            </View>
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              tintColor={colors.textMuted}
              size={14}
            />
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

// ─── Secondary booking activity (hybrid table venues) ───────────────────────

/**
 * "Other booking types" — for table-focus venues that also run secondary models.
 * Reuses the KPI grid (driven by the secondary `today` stats) + the forecast
 * chart (secondary `forecast`). Mirrors the web's secondary-activity block.
 */
function SecondaryActivitySection({
  secondary,
}: {
  secondary: NonNullable<
    ReturnType<typeof useDashboardHome>['data']
  >['secondary_booking_activity'];
}) {
  if (!secondary) return null;

  const { today, forecast } = secondary;
  // The secondary `today` is a subset of the full stats; pad the dining-only
  // fields KpiGrid reads so it renders without the table/in-house figures.
  const todayStats = {
    covers: today.covers,
    bookings: today.bookings,
    confirmed: today.confirmed,
    pending: today.pending,
    seated: today.seated,
    revenue: today.revenue,
    next_booking: today.next_booking,
    peak_in_house_covers: 0,
    concurrent_cap: null,
    peak_fill_percent: null,
    covers_in_house_now: 0,
    arriving_within_30_min: 0,
  };

  return (
    <View style={styles.secondarySection}>
      <Text variant="label">Other booking types</Text>
      {/* Secondary models are appointment-style (events/classes/resources). */}
      <KpiGrid today={todayStats} isAppointment forecast={forecast} />
      {forecast.length > 0 ? (
        <ForecastChart days={forecast} isAppointment title="7-day other bookings" />
      ) : null}
    </View>
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
      query.error instanceof ApiError ? query.error.message : "Could not load today's summary.";
    return (
      <Screen>
        {header}
        <ErrorState message={message} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  const { today, forecast = [], alerts = [], recent_bookings, heatmap = [] } = payload;

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
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }>
        {/* Greeting + quick-action buttons */}
        <GreetingHeader isAppointment={isAppointment} />

        {/* Setup checklist (admin-only; pinned pre-onboarding, dismissible after) */}
        <SetupChecklistCard />

        {/* KPI tiles (primary tile carries the inline forecast sparkline) */}
        <KpiGrid today={today} isAppointment={isAppointment} forecast={forecast} />

        {/* Today by booking type chips (multi-model venues) */}
        {payload.today_by_booking_model &&
        Object.keys(payload.today_by_booking_model).length > 1 &&
        !tableFocusSecondariesEnabled ? (
          <BookingTypeChips todayByBookingModel={payload.today_by_booking_model} />
        ) : null}

        {/* Capacity panel (table/restaurant venues only) */}
        {!isAppointment ? <CapacityCard today={today} /> : null}

        {/* 7-day capacity heatmap outlook (table/restaurant venues only) */}
        {!isAppointment && heatmap.length > 0 ? <HeatmapWeek days={heatmap} /> : null}

        {/* Alerts */}
        <AlertsCard alerts={alerts} />

        {/* 7-day forecast chart */}
        {forecast.length > 0 ? (
          <ForecastChart days={forecast} isAppointment={isAppointment} />
        ) : null}

        {/* Secondary booking activity (hybrid table venues with add-on models) */}
        {tableFocusSecondariesEnabled && payload.secondary_booking_activity ? (
          <SecondaryActivitySection secondary={payload.secondary_booking_activity} />
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  checklistHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  checklistSubheading: {
    marginTop: 2,
  },
  checklistHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  progressPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  progressPillText: {
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  dismissHit: {
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  checklist: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checklistRowTappable: {
    minHeight: minTouchTarget,
  },
  checklistRowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  secondarySection: {
    gap: spacing.base,
  },
});
