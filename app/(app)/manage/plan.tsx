import { useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { Alert, AppState, type AppStateStatus, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { PlanChangeTierSheet, type AppointmentsTier } from '@/components/manage/PlanChangeTierSheet';
import { hapticError, hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useBillingPortalSession,
  useBillingStatus,
  useChangePlan,
  useStripeConnect,
  useStripeConnectLink,
  type PlanStatus,
} from '@/lib/queries/useBillingStatus';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingModel } from '@/types/venue';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the web dashboard origin. Uses EXPO_PUBLIC_WEB_URL if set,
 * otherwise falls back to EXPO_PUBLIC_API_URL (common for monorepo deploys).
 * Avoids importing getApiUrl() directly to decouple from the shared lib.
 */
function getWebUrl(): string {
  const webUrl = process.env.EXPO_PUBLIC_WEB_URL;
  if (webUrl) return webUrl.replace(/\/$/, '');
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  return apiUrl.replace(/\/$/, '');
}

const MODEL_LABELS: Record<BookingModel, string> = {
  table_reservation: 'Tables',
  practitioner_appointment: 'Appointments',
  unified_scheduling: 'Appointments',
  event_ticket: 'Events',
  class_session: 'Classes',
  resource_booking: 'Resources',
};

const APPOINTMENTS_PLAN_TIERS = new Set(['light', 'plus', 'appointments']);

function isAppointmentsTier(tier: string | null | undefined): tier is AppointmentsTier {
  return APPOINTMENTS_PLAN_TIERS.has(tier ?? '');
}

function planDisplayName(tier: string | null | undefined): string {
  if (!tier) return '—';
  const map: Record<string, string> = {
    light: 'Appointments Light',
    plus: 'Appointments Plus',
    appointments: 'Appointments Pro',
    restaurant: 'Restaurant',
    founding: 'Founding',
  };
  return map[tier.toLowerCase()] ?? tier.charAt(0).toUpperCase() + tier.slice(1);
}

function planCalendarLimit(tier: string | null | undefined): number {
  if (!tier) return Infinity;
  if (tier === 'light') return 1;
  if (tier === 'plus') return 5;
  return Infinity;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function daysRemaining(iso: string | null | undefined): number {
  if (!iso) return 0;
  const diff = Date.parse(iso) - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

function planStatusLabel(
  status: PlanStatus,
): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'brand' } {
  switch (status) {
    case 'active':
      return { label: 'Active', tone: 'success' };
    case 'trialing':
      return { label: 'Trial', tone: 'brand' };
    case 'past_due':
      return { label: 'Payment due', tone: 'danger' };
    case 'cancelling':
      return { label: 'Cancelling', tone: 'warning' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'danger' };
    case 'incomplete':
      return { label: 'Incomplete', tone: 'warning' };
    default:
      return { label: 'Unknown', tone: 'neutral' };
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="bodySmall" tone="muted">
        {label}
      </Text>
      <Text variant="bodyMedium" style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

type UsageMeterProps = {
  label: string;
  used: number;
  total: number | null;
  color: string;
  note?: string;
};

function UsageMeter({ label, used, total, color, note }: UsageMeterProps) {
  const { colors } = useTheme();
  const unlimited = total === null || total === Infinity;
  const pct = unlimited ? 0 : Math.min(100, (used / total) * 100);

  return (
    <View style={styles.meterRow}>
      <View style={styles.meterLabelRow}>
        <Text variant="bodySmall" tone="secondary">
          {label}
        </Text>
        <Text variant="bodySmall" tone="muted">
          {unlimited ? `${used} used · Unlimited` : `${used} / ${total}`}
        </Text>
      </View>
      {!unlimited && (
        <View style={[styles.meterTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.meterFill,
              {
                width: `${pct}%` as `${number}%`,
                backgroundColor: color,
              },
            ]}
          />
        </View>
      )}
      {note && (
        <Text variant="caption" tone="muted">
          {note}
        </Text>
      )}
    </View>
  );
}

type StatusBannerProps = {
  tone: 'warning' | 'danger';
  message: string;
  buttonLabel?: string;
  loading?: boolean;
  onPress?: () => void;
};

function StatusBanner({ tone, message, buttonLabel, loading, onPress }: StatusBannerProps) {
  const { colors } = useTheme();
  const bg = tone === 'warning' ? colors.warningSurface : colors.dangerSurface;
  const textColor = tone === 'warning' ? colors.warning : colors.danger;

  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Text variant="bodySmall" color={textColor} style={styles.bannerText}>
        {message}
      </Text>
      {buttonLabel && (
        <Button
          label={buttonLabel}
          variant={tone === 'danger' ? 'danger' : 'secondary'}
          fullWidth
          size="sm"
          loading={loading}
          disabled={loading || !onPress}
          onPress={onPress}
          style={styles.bannerButton}
        />
      )}
    </View>
  );
}

type StripeConnectCardProps = {
  isAdmin: boolean;
  hasAccountId: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  connecting: boolean;
  onConnect: () => void;
};

function StripeConnectCard({
  isAdmin,
  hasAccountId,
  chargesEnabled,
  detailsSubmitted,
  connecting,
  onConnect,
}: StripeConnectCardProps) {
  const { colors } = useTheme();
  type ConnectState = 'not_connected' | 'step1_pending' | 'step2_pending' | 'active';

  const state: ConnectState = !hasAccountId
    ? 'not_connected'
    : chargesEnabled && detailsSubmitted
      ? 'active'
      : !detailsSubmitted
        ? 'step1_pending'
        : 'step2_pending';

  const statusCopy: Record<
    ConnectState,
    { badge: string; tone: 'success' | 'warning' | 'neutral'; desc: string; cta: string | null }
  > = {
    not_connected: {
      badge: 'Not connected',
      tone: 'warning',
      desc: 'Connect Stripe to accept online deposits and payments from clients.',
      cta: 'Connect Stripe',
    },
    step1_pending: {
      badge: 'Setup incomplete',
      tone: 'warning',
      desc: 'Step 1 of 2: Add your business and bank details in Stripe to activate payments.',
      cta: 'Continue setup',
    },
    step2_pending: {
      badge: 'Verification pending',
      tone: 'warning',
      desc: 'Step 2 of 2: Complete Stripe identity verification to finish activating payments.',
      cta: 'Complete verification',
    },
    active: {
      badge: 'Active',
      tone: 'success',
      desc: 'Online deposits and card payments are enabled.',
      cta: null,
    },
  };

  const s = statusCopy[state];

  return (
    <Card>
      <View style={styles.cardHeader}>
        <Text variant="label">Stripe payments</Text>
        <Badge label={s.badge} tone={s.tone} />
      </View>

      {/* Step indicator for partial onboarding */}
      {(state === 'step1_pending' || state === 'step2_pending') && (
        <View style={styles.stepIndicator}>
          <StepDot active done={state === 'step2_pending'} label="Business & bank" />
          <View style={[styles.stepLine, { backgroundColor: colors.border }]} />
          <StepDot active={state === 'step2_pending'} done={false} label="Identity check" />
        </View>
      )}

      <Text variant="bodySmall" tone="secondary" style={styles.help}>
        {s.desc}
      </Text>

      {isAdmin && s.cta && (
        <Button
          label={connecting ? 'Opening Stripe…' : s.cta}
          variant="primary"
          fullWidth
          loading={connecting}
          onPress={onConnect}
        />
      )}

      {!isAdmin && state !== 'active' && (
        <Text variant="caption" tone="muted">
          Ask an admin to complete Stripe setup.
        </Text>
      )}
    </Card>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  const { colors } = useTheme();
  const bg = done ? colors.success : active ? colors.brand : colors.border;

  return (
    <View style={styles.stepDotContainer}>
      <View style={[styles.stepDot, { backgroundColor: bg }]}>
        {done && (
          <Text variant="caption" color={colors.onColor}>
            ✓
          </Text>
        )}
        {!done && active && (
          <Text variant="caption" color={colors.onColor}>
            1
          </Text>
        )}
      </View>
      <Text variant="caption" tone={active ? 'default' : 'muted'} style={styles.stepLabel}>
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

/** Plan & payments — live billing, Stripe connect, and admin actions. */
export default function PlanScreen() {
  const { venue, isLoading: venueLoading } = useVenueContext();
  const { colors } = useTheme();

  const isAdmin = venue?.current_user_role === 'admin';

  // Only fetch billing status for admins (server also gates on admin)
  const {
    data: billing,
    isLoading: billingLoading,
    refetch: refetchBilling,
  } = useBillingStatus(isAdmin);

  const {
    data: stripeConnect,
    refetch: refetchStripe,
  } = useStripeConnect(isAdmin && !!venue?.stripe_connected_account_id);

  const portalMutation = useBillingPortalSession();
  const changePlanMutation = useChangePlan();
  const stripeConnectLinkMutation = useStripeConnectLink();

  const [showChangePlan, setShowChangePlan] = useState(false);
  const [returnBannerMsg, setReturnBannerMsg] = useState<string | null>(null);

  // Re-fetch billing/stripe status when app returns to foreground (AppState)
  // — mirrors the web's visibilitychange handler for Stripe portal returns.
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        void refetchBilling();
        void refetchStripe();
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [refetchBilling, refetchStripe]);

  const openWeb = (path: string) => {
    const url = `${getWebUrl()}${path}`;
    void Linking.openURL(url).catch(() => Alert.alert('Could not open browser', url));
  };

  function handleManageBilling() {
    if (!isAdmin) return;
    portalMutation.mutate(undefined, {
      onSuccess: ({ url }) => {
        setReturnBannerMsg(null);
        void Linking.openURL(url).catch(() => Alert.alert('Could not open browser', url));
      },
      onError: (err: Error) => {
        hapticError();
        Alert.alert('Could not open billing portal', err.message);
      },
    });
  }

  function handleResume() {
    hapticWarning();
    changePlanMutation.mutate('resume_subscription', {
      onSuccess: (data) => {
        hapticSuccess();
        setReturnBannerMsg(data.message ?? 'Your subscription will continue.');
      },
      onError: (err: Error) => {
        hapticError();
        Alert.alert('Could not resume subscription', err.message);
      },
    });
  }

  function handleResubscribe() {
    hapticWarning();
    changePlanMutation.mutate('resubscribe', {
      onSuccess: (data) => {
        if (data.redirect_url) {
          void Linking.openURL(data.redirect_url).catch(() =>
            Alert.alert('Could not open Stripe Checkout', data.redirect_url ?? ''),
          );
        } else {
          hapticSuccess();
          setReturnBannerMsg('You have resubscribed. Welcome back!');
        }
      },
      onError: (err: Error) => {
        hapticError();
        Alert.alert('Could not resubscribe', err.message);
      },
    });
  }

  function handleStripeConnect() {
    stripeConnectLinkMutation.mutate(undefined, {
      onSuccess: ({ url }) => {
        void Linking.openURL(url).catch(() => Alert.alert('Could not open Stripe', url));
      },
      onError: (err: Error) => {
        hapticError();
        Alert.alert('Could not start Stripe setup', err.message);
      },
    });
  }

  const header = <Stack.Screen options={{ title: 'Plan & payments' }} />;

  if (venueLoading || !venue) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  // --- Derived data ---
  const pricingTier = billing?.pricing_tier ?? venue.pricing_tier;
  const planStatus = billing?.plan_status ?? null;
  const periodEnd = billing?.subscription_current_period_end;
  const billingQuote = billing?.billing_quote;
  const calendarCount = billing?.calendar_count ?? null;
  const calendarLimit = planCalendarLimit(pricingTier);

  const statusInfo = planStatusLabel(planStatus);

  const models = Array.from(
    new Set(
      [venue.booking_model, ...(venue.active_booking_models ?? []), ...(venue.enabled_models ?? [])]
        .filter(Boolean)
        .map((m) => MODEL_LABELS[m as BookingModel] ?? m),
    ),
  );

  const hasStripeAccount = !!venue.stripe_connected_account_id;
  const chargesEnabled = stripeConnect?.charges_enabled ?? false;
  const detailsSubmitted = stripeConnect?.details_submitted ?? false;

  const isAppointmentsPlan = isAppointmentsTier(pricingTier);
  const canChangePlan =
    isAdmin &&
    isAppointmentsPlan &&
    planStatus !== 'past_due' &&
    planStatus !== 'cancelling' &&
    planStatus !== 'cancelled';

  const isTrial = planStatus === 'trialing';
  const trialDaysLeft = daysRemaining(periodEnd);

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Return-from-portal success banner */}
        {returnBannerMsg && (
          <View style={[styles.banner, { backgroundColor: colors.successSurface }]}>
            <Text variant="bodySmall" color={colors.success}>
              {returnBannerMsg}
            </Text>
          </View>
        )}

        {/* Trial countdown */}
        {isTrial && (
          <View style={[styles.banner, { backgroundColor: colors.brandSubtle }]}>
            <Text variant="bodySmall" tone="brand">
              Free trial — {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} remaining (ends{' '}
              {formatDate(periodEnd)})
            </Text>
          </View>
        )}

        {/* Status banners */}
        {planStatus === 'past_due' && (
          <StatusBanner
            tone="danger"
            message="Your last payment failed. Update your payment method to keep access."
            buttonLabel={portalMutation.isPending ? 'Opening…' : 'Update payment method'}
            loading={portalMutation.isPending}
            onPress={isAdmin ? handleManageBilling : undefined}
          />
        )}
        {planStatus === 'cancelling' && (
          <StatusBanner
            tone="warning"
            message={`Your subscription is set to cancel on ${formatDate(periodEnd)}. Changed your mind?`}
            buttonLabel={changePlanMutation.isPending ? 'Resuming…' : 'Keep my plan'}
            loading={changePlanMutation.isPending}
            onPress={isAdmin ? handleResume : undefined}
          />
        )}
        {planStatus === 'cancelled' && (
          <StatusBanner
            tone="warning"
            message="Your subscription has ended. Resubscribe to restore full access."
            buttonLabel={changePlanMutation.isPending ? 'Opening Stripe…' : 'Resubscribe'}
            loading={changePlanMutation.isPending}
            onPress={isAdmin ? handleResubscribe : undefined}
          />
        )}

        {/* Plan card */}
        <Card>
          <View style={styles.cardHeader}>
            <Text variant="label">Plan</Text>
            {planStatus && <Badge label={statusInfo.label} tone={statusInfo.tone} />}
          </View>

          {pricingTier && (
            <Text variant="bodySmall" tone="secondary" style={styles.tierLabel}>
              {planDisplayName(pricingTier)}
            </Text>
          )}

          <View style={styles.rows}>
            <InfoRow label="Booking types" value={models.join(' · ') || '—'} />
            <InfoRow label="Currency" value={venue.currency?.toUpperCase() ?? 'GBP'} />
            <InfoRow
              label={planStatus === 'cancelling' || planStatus === 'cancelled' ? 'Access until' : 'Next billing'}
              value={formatDate(periodEnd)}
            />
            {billingQuote?.next_charge?.formatted &&
              planStatus !== 'cancelling' &&
              planStatus !== 'cancelled' && (
                <InfoRow label="Est. next invoice" value={billingQuote.next_charge.formatted} />
              )}
            {billingQuote?.coupon_titles && billingQuote.coupon_titles.length > 0 && (
              <InfoRow label="Discounts" value={billingQuote.coupon_titles.join(', ')} />
            )}
          </View>

          {/* Calendar usage meter */}
          {calendarCount !== null && (
            <View style={styles.meters}>
              <UsageMeter
                label="Calendars"
                used={calendarCount}
                total={calendarLimit === Infinity ? null : calendarLimit}
                color={colors.brand}
                note={calendarLimit === Infinity ? 'Unlimited on Pro' : undefined}
              />
            </View>
          )}

          {/* Admin billing actions */}
          {isAdmin ? (
            <View style={styles.actions}>
              <Button
                label={portalMutation.isPending ? 'Opening…' : 'Manage billing'}
                variant="primary"
                fullWidth
                loading={portalMutation.isPending}
                disabled={billingLoading}
                onPress={handleManageBilling}
              />
              {canChangePlan && (
                <Button
                  label="Change plan"
                  variant="secondary"
                  fullWidth
                  onPress={() => setShowChangePlan(true)}
                />
              )}
              <Button
                label="View plan on web"
                variant="ghost"
                fullWidth
                onPress={() => openWeb('/dashboard/settings?tab=plan')}
              />
            </View>
          ) : (
            <Text variant="caption" tone="muted" style={styles.adminNote}>
              Contact your admin to manage billing.
            </Text>
          )}
        </Card>

        {/* Stripe Connect card (always visible; state derived from API) */}
        <StripeConnectCard
          isAdmin={isAdmin}
          hasAccountId={hasStripeAccount}
          chargesEnabled={chargesEnabled}
          detailsSubmitted={detailsSubmitted}
          connecting={stripeConnectLinkMutation.isPending}
          onConnect={handleStripeConnect}
        />

        {/* Non-admin fallback link for Stripe */}
        {!isAdmin && (
          <Button
            label="View payments on web"
            variant="ghost"
            fullWidth
            onPress={() => openWeb('/dashboard/settings?tab=payments')}
          />
        )}

        <View style={styles.spacer} />
      </ScrollView>

      {/* Plan tier change sheet — appointments venues only */}
      {isAppointmentsPlan && isAppointmentsTier(pricingTier) && (
        <PlanChangeTierSheet
          visible={showChangePlan}
          currentTier={pricingTier}
          onClose={() => setShowChangePlan(false)}
          onSuccess={(_newTier) => {
            setShowChangePlan(false);
            void refetchBilling();
          }}
        />
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  banner: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    gap: spacing.sm,
  },
  bannerText: {
    lineHeight: 20,
  },
  bannerButton: {
    marginTop: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  tierLabel: {
    marginBottom: spacing.sm,
  },
  rows: {
    marginVertical: spacing.sm,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.base,
  },
  rowValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  meters: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  meterRow: {
    gap: spacing.xs,
  },
  meterLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meterTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  meterFill: {
    height: 6,
    borderRadius: 3,
  },
  actions: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  adminNote: {
    marginTop: spacing.sm,
  },
  help: {
    marginVertical: spacing.sm,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: spacing.sm,
    gap: 0,
  },
  stepDotContainer: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    textAlign: 'center',
  },
  stepLine: {
    height: 2,
    flex: 0.3,
    marginTop: 11,
    alignSelf: 'flex-start',
  },
  spacer: {
    height: spacing.xl,
  },
});
