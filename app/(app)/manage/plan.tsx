import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  AppState,
  type AppStateStatus,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { DeleteVenueSheet } from '@/components/manage/DeleteVenueSheet';
import { PlanChangeSection } from '@/components/plan/PlanChangeSection';
import { StripeConnectCard } from '@/components/plan/StripeConnectCard';
import { UsageMeter } from '@/components/plan/UsageMeter';
import {
  APPOINTMENTS_PLAN_DETAILS,
  isAppointmentsTier,
  planCalendarLimit,
  planDisplayName,
  planPriceLabel,
  smsMonthlyAllowance,
  SMS_OVERAGE_GBP_PER_MESSAGE,
  SUBSCRIPTION_CANCELLATION_PUBLIC_NOTICE,
} from '@/components/plan/planConstants';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { mustManageSubscriptionOnWeb } from '@/lib/billing/store-billing-policy';
import { getWebUrl } from '@/lib/env';
import { hapticError, hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  isSuperuserFreeBillingAccess,
  useBillingPortalSession,
  useBillingStatus,
  useChangePlan,
  useStripeConnect,
  useStripeConnectLink,
  type BillingQuotePayload,
  type PlanStatus,
} from '@/lib/queries/useBillingStatus';
import { useSmsUsage } from '@/lib/queries/useSmsUsage';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingModel } from '@/types/venue';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MODEL_LABELS: Record<BookingModel, string> = {
  table_reservation: 'Tables',
  practitioner_appointment: 'Appointments',
  unified_scheduling: 'Appointments',
  event_ticket: 'Events',
  class_session: 'Classes',
  resource_booking: 'Resources',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function daysRemaining(iso: string | null | undefined, nowMs: number): number {
  if (!iso) return 0;
  const diff = Date.parse(iso) - nowMs;
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

/**
 * The live payload sends `discount_summaries` as plain strings (web
 * VenueBillingQuotePayload); the local type predates that. Accept both.
 */
function discountSummaryLines(quote: BillingQuotePayload | null | undefined): string[] {
  if (!quote?.discount_summaries) return [];
  const raw = quote.discount_summaries as unknown as (
    | string
    | { description?: string | null; formatted?: string | null }
  )[];
  return raw
    .map((d) =>
      typeof d === 'string' ? d : [d?.description, d?.formatted].filter(Boolean).join(' '),
    )
    .filter((line) => line.length > 0);
}

/** Coupon names, falling back to the lead of each discount line — web parity. */
function couponTitles(quote: BillingQuotePayload | null | undefined): string[] {
  if (!quote) return [];
  if (quote.coupon_titles?.length) return quote.coupon_titles;
  return discountSummaryLines(quote)
    .map((line) => line.split(':')[0]?.trim() ?? '')
    .filter((line) => line.length > 0);
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

type StatusBannerProps = {
  tone: 'warning' | 'danger' | 'success' | 'brand';
  title?: string;
  message: string;
  buttonLabel?: string;
  loading?: boolean;
  onPress?: () => void;
};

function StatusBanner({ tone, title, message, buttonLabel, loading, onPress }: StatusBannerProps) {
  const { colors } = useTheme();
  const palette = {
    warning: { bg: colors.warningSurface, fg: colors.warning },
    danger: { bg: colors.dangerSurface, fg: colors.danger },
    success: { bg: colors.successSurface, fg: colors.success },
    brand: { bg: colors.brandSubtle, fg: colors.brand },
  }[tone];

  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }]}>
      {title ? (
        <Text variant="label" color={palette.fg}>
          {title}
        </Text>
      ) : null}
      <Text variant="bodySmall" color={palette.fg} style={styles.bannerText}>
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

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

/**
 * Plan & payments — mobile equivalent of the web dashboard's Settings → Plan
 * and Settings → Payments tabs (SettingsView PlanSection + StripeConnectSection).
 */
export default function PlanScreen() {
  const { venue, isLoading: venueLoading, refetch: refetchVenue } = useVenueContext();
  const { colors } = useTheme();

  const isAdmin = venue?.current_user_role === 'admin';

  // Reader-app posture: on native app-store builds the ResNeo subscription can be
  // VIEWED and MANAGED here, but PURCHASES / plan changes are routed to the web
  // dashboard (Apple Guideline 3.1.1 / Play Billing). The Stripe Connect flow for
  // taking client payments is unaffected. See lib/billing/store-billing-policy.ts.
  const manageOnWeb = mustManageSubscriptionOnWeb();

  // Billing status is admin-only on the server (403 otherwise).
  const {
    data: billing,
    isLoading: billingLoading,
    isError: billingError,
    refetch: refetchBilling,
  } = useBillingStatus(isAdmin);

  const { data: stripeConnect, refetch: refetchStripe } = useStripeConnect(
    isAdmin && !!venue?.stripe_connected_account_id,
  );

  // Live SMS usage (admin-only route, Bearer-reachable). Degrades to the static
  // allowance copy below when it errors (401/403) or returns null (non-SMS venue).
  const { data: smsUsage, refetch: refetchSmsUsage } = useSmsUsage(isAdmin);

  const portalMutation = useBillingPortalSession();
  const changePlanMutation = useChangePlan();
  const stripeConnectLinkMutation = useStripeConnectLink();

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [portalUnavailable, setPortalUnavailable] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showDeleteVenue, setShowDeleteVenue] = useState(false);
  // Stable "now" per mount — render-time Date.now() violates react-hooks/purity
  // (same pattern as the web SettingsView's currentTimeMs).
  const [nowMs] = useState(() => Date.now());

  // Re-fetch billing/stripe status when the app returns to the foreground —
  // mirrors the web's focus/visibilitychange sync for Stripe portal/checkout returns.
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        void refetchBilling();
        void refetchStripe();
        void refetchSmsUsage();
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [refetchBilling, refetchStripe, refetchSmsUsage]);

  // In-app browser tab (SFSafariViewController / Chrome Custom Tab), with a
  // system-browser fallback. Inline error if neither opens — no Alert.alert.
  const openExternal = useCallback((url: string) => {
    void WebBrowser.openBrowserAsync(url).catch(() =>
      Linking.openURL(url).catch(() => setActionError(`Could not open browser: ${url}`)),
    );
  }, []);

  const openWeb = useCallback(
    (path: string) => openExternal(`${getWebUrl()}${path}`),
    [openExternal],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    refetchVenue();
    await Promise.allSettled([refetchBilling(), refetchStripe(), refetchSmsUsage()]);
    setRefreshing(false);
  }, [refetchBilling, refetchStripe, refetchSmsUsage, refetchVenue]);

  function handleManageBilling() {
    if (!isAdmin) return;
    setActionError(null);
    setSuccessMsg(null);
    portalMutation.mutate(undefined, {
      onSuccess: ({ url }) => {
        setPortalUnavailable(false);
        openExternal(url);
      },
      onError: () => {
        hapticError();
        setPortalUnavailable(true);
        setActionError(
          'The Stripe Customer Portal could not be opened from the app. Manage card details, invoices, and cancellation from the web dashboard instead.',
        );
      },
    });
  }

  function handleResume() {
    hapticWarning();
    setActionError(null);
    setSuccessMsg(null);
    changePlanMutation.mutate('resume_subscription', {
      onSuccess: (data) => {
        hapticSuccess();
        setSuccessMsg(data.message ?? 'Your subscription will continue.');
      },
      onError: (err: Error) => {
        hapticError();
        setActionError(err.message);
      },
    });
  }

  function handleResubscribe() {
    // Starting a NEW subscription is a purchase — under the reader-app posture we
    // send admins to the web dashboard instead of opening Stripe Checkout in-app.
    if (manageOnWeb) {
      openWeb('/dashboard/settings?tab=plan');
      return;
    }
    hapticWarning();
    setActionError(null);
    setSuccessMsg(null);
    changePlanMutation.mutate('resubscribe', {
      onSuccess: (data) => {
        if (data.redirect_url) {
          setSuccessMsg(
            'Complete checkout in the browser — your plan updates here when you return.',
          );
          openExternal(data.redirect_url);
        } else {
          hapticSuccess();
          setSuccessMsg(data.message ?? 'You have resubscribed. Welcome back!');
        }
      },
      onError: (err: Error) => {
        hapticError();
        setActionError(err.message);
      },
    });
  }

  function handleStripeConnect() {
    setConnectError(null);
    stripeConnectLinkMutation.mutate(undefined, {
      onSuccess: ({ url }) => openExternal(url),
      onError: (err: Error) => {
        hapticError();
        setConnectError(err.message);
      },
    });
  }

  const header = <Stack.Screen options={{ headerShown: true, title: 'Plan & payments' }} />;

  if (venueLoading || !venue) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  // --- Derived data (billing/status wins; venue bootstrap is the fallback) ---
  const pricingTier = billing?.pricing_tier ?? venue.pricing_tier;
  const planStatus: PlanStatus = billing?.plan_status ?? (venue.plan_status as PlanStatus) ?? null;
  const periodStart = billing?.subscription_current_period_start;
  const periodEnd = billing?.subscription_current_period_end;
  const billingQuote = billing?.billing_quote ?? null;
  const calendarCount = billing?.calendar_count ?? null;
  const calendarLimit = planCalendarLimit(pricingTier);
  const hasStripeSub = !!(billing?.stripe_subscription_id ?? venue.stripe_subscription_id);

  const statusInfo = planStatusLabel(planStatus);
  const tierLabel = planDisplayName(pricingTier);
  const planPrice = planPriceLabel(pricingTier);
  const inclusions = isAppointmentsTier(pricingTier) ? APPOINTMENTS_PLAN_DETAILS[pricingTier] : null;
  const smsIncluded = smsMonthlyAllowance(pricingTier);
  const coupons = couponTitles(billingQuote);
  const discountLines = discountSummaryLines(billingQuote);

  const periodEndMs = periodEnd ? Date.parse(periodEnd) : Number.NaN;
  const hasFuturePeriodEnd = Number.isFinite(periodEndMs) && periodEndMs > nowMs;
  const isTrial = planStatus === 'trialing';
  const isCancelling = planStatus === 'cancelling';
  // Web parity: 'cancelling' (or cancelled with a future period end) keeps access until the date;
  // cancelled with no future period end means the subscription has fully ended.
  const cancelledWithAccess = isCancelling || (planStatus === 'cancelled' && hasFuturePeriodEnd);
  const subscriptionExpired = planStatus === 'cancelled' && !hasFuturePeriodEnd;
  const billingActive = planStatus === 'active' || isTrial;

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

  const trialDaysLeft = daysRemaining(periodEnd, nowMs);

  // Complimentary (superuser-comped) access — web parity. The status route does
  // not surface `billing_access_source` today, so this stays false until the
  // backend includes it; when present, we swap the trial banner for comp copy.
  const isFreeAccess = isSuperuserFreeBillingAccess(billing?.billing_access_source);

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
        }>
        {/* Success banner (resume / plan change / portal sync) */}
        {successMsg && <StatusBanner tone="success" message={successMsg} />}

        {/* Complimentary access (superuser-comped) — web parity. Replaces the
            trial/billing copy when the venue's access source is a platform comp. */}
        {isFreeAccess && (
          <StatusBanner
            tone="brand"
            title="Complimentary ResNeo access"
            message="Your venue has complimentary access to ResNeo — there are no subscription charges while this is active. Billing actions are disabled."
          />
        )}

        {/* Trial countdown (hidden under complimentary access) */}
        {isTrial && !isFreeAccess && (
          <StatusBanner
            tone="brand"
            message={
              `Free trial — ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} remaining ` +
              `(first charge on ${formatDate(periodEnd)}).`
            }
          />
        )}

        {/* Payment failed */}
        {planStatus === 'past_due' && (
          <StatusBanner
            tone="danger"
            title="Payment required"
            message="Your last payment failed. Update your payment method in Stripe so invoicing can retry and keep your plan active."
            buttonLabel={portalMutation.isPending ? 'Opening…' : 'Update payment method'}
            loading={portalMutation.isPending}
            onPress={isAdmin ? handleManageBilling : undefined}
          />
        )}

        {/* Cancelling — keep access until period end, can resume */}
        {isCancelling && (
          <StatusBanner
            tone="warning"
            title="Your subscription has been cancelled."
            message={`You keep access to your current plan until ${formatDate(periodEnd)}. Stripe will not charge again unless the subscription is restarted before then. Changed your mind?`}
            buttonLabel={changePlanMutation.isPending ? 'Resuming…' : 'Keep my plan'}
            loading={changePlanMutation.isPending}
            onPress={isAdmin ? handleResume : undefined}
          />
        )}

        {/* Cancelled but access continues to period end (no resume once fully cancelled) */}
        {planStatus === 'cancelled' && hasFuturePeriodEnd && (
          <StatusBanner
            tone="warning"
            title="Your subscription has been cancelled."
            message={`You keep access to your current plan until ${formatDate(periodEnd)}. Stripe will not charge again after that date.`}
          />
        )}

        {/* Subscription fully ended */}
        {subscriptionExpired && (
          <StatusBanner
            tone="warning"
            title="Your subscription has ended"
            message={
              manageOnWeb
                ? 'Venue changes and public online booking are paused until you start a new subscription. Resubscribe on the ResNeo website — your plan reactivates here automatically.'
                : 'Venue changes and public online booking are paused until you start a new subscription. Use Resubscribe to pay again with Stripe Checkout.'
            }
            buttonLabel={
              manageOnWeb
                ? 'Resubscribe on the web'
                : changePlanMutation.isPending
                  ? 'Opening Stripe…'
                  : 'Resubscribe'
            }
            loading={!manageOnWeb && changePlanMutation.isPending}
            onPress={isAdmin ? handleResubscribe : undefined}
          />
        )}

        {/* Inline action error — replaces Alert.alert (no-op on web) */}
        {actionError && <StatusBanner tone="danger" message={actionError} />}

        {/* Plan card */}
        <Card>
          <View style={styles.cardHeader}>
            <Text variant="label">Your plan</Text>
            {planStatus && <Badge label={statusInfo.label} tone={statusInfo.tone} />}
          </View>

          <Text variant="subheading" style={styles.tierName}>
            {tierLabel}
          </Text>
          <Text variant="bodySmall" tone="secondary">
            Published listing {planPrice}
            {coupons.length > 0 ? ' · promotional pricing applied in Stripe' : ''}
          </Text>
          {inclusions && (
            <Text variant="caption" tone="muted" style={styles.inclusions}>
              {inclusions.calendars} · {inclusions.team} · {inclusions.sms}
            </Text>
          )}

          <View style={styles.rows}>
            {billingQuote?.next_charge?.formatted && !cancelledWithAccess && !subscriptionExpired && (
              <InfoRow label="Est. next invoice" value={billingQuote.next_charge.formatted} />
            )}
            {coupons.length > 0 && <InfoRow label="Coupon applied" value={coupons.join(', ')} />}
            <InfoRow
              label={cancelledWithAccess || subscriptionExpired ? 'Access until' : 'Next billing'}
              value={formatDate(periodEnd)}
            />
            {periodStart && periodEnd && (
              <InfoRow
                label="Current period"
                value={`${formatDate(periodStart)} – ${formatDate(periodEnd)}`}
              />
            )}
            <InfoRow label="Booking types" value={models.join(' · ') || '—'} />
            <InfoRow label="Currency" value={venue.currency?.toUpperCase() ?? 'GBP'} />
          </View>

          {discountLines.length > 0 && (
            <View style={styles.discountList}>
              {discountLines.map((line) => (
                <Text key={line} variant="caption" tone="muted">
                  • {line}
                </Text>
              ))}
            </View>
          )}

          {billingQuote?.next_charge?.formatted && (
            <Text variant="caption" tone="muted" style={styles.disclaimer}>
              Invoice estimate comes from Stripe’s upcoming invoice preview (includes coupons and
              account balance). Final amounts may differ if usage or tax changes. Metered SMS
              overage may be added.
            </Text>
          )}

          {/* Usage */}
          <View style={styles.meters}>
            {calendarCount !== null && (
              <UsageMeter
                label="Calendar usage"
                used={calendarCount}
                total={Number.isFinite(calendarLimit) ? calendarLimit : null}
                color={colors.brand}
                note={
                  Number.isFinite(calendarLimit)
                    ? undefined
                    : 'Your current plan has no calendar cap.'
                }
              />
            )}
            {smsUsage ? (
              <View style={styles.smsUsage}>
                <UsageMeter
                  label="SMS this period"
                  used={smsUsage.messages_sent}
                  total={smsUsage.messages_included}
                  color={colors.brand}
                />
                <Text variant="caption" tone="muted">
                  {smsUsage.messages_sent} / {smsUsage.messages_included} segments included
                  {' · '}
                  {smsUsage.remaining} left. Overage is £{smsUsage.billable_unit_gbp.toFixed(2)} per
                  SMS segment.
                </Text>
                {smsUsage.overage_count > 0 && (
                  <View style={[styles.overageBox, { backgroundColor: colors.warningSurface }]}>
                    <Text variant="caption" color={colors.warning} style={styles.overageText}>
                      {smsUsage.overage_count} segment{smsUsage.overage_count !== 1 ? 's' : ''} beyond
                      your allowance — about £{(smsUsage.overage_amount_pence / 100).toFixed(2)},
                      metered against the current billing period.
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View>
                <View style={styles.smsRow}>
                  <Text variant="bodySmall" tone="secondary">
                    SMS allowance
                  </Text>
                  <Text variant="bodySmall" tone="muted">
                    {smsIncluded} segments/month included
                  </Text>
                </View>
                <Text variant="caption" tone="muted">
                  Overage is £{SMS_OVERAGE_GBP_PER_MESSAGE.toFixed(2)} per SMS segment. Live SMS
                  usage isn’t available in the app yet — check the web dashboard (Settings → Plan).
                </Text>
              </View>
            )}
          </View>

          {isAdmin && billingError && (
            <View style={[styles.billingErrorBox, { backgroundColor: colors.dangerSurface }]}>
              <Text variant="caption" color={colors.danger} style={styles.billingErrorText}>
                Couldn’t load live billing details from Stripe.
              </Text>
              <Button
                label="Retry"
                variant="ghost"
                size="sm"
                onPress={() => void refetchBilling()}
              />
            </View>
          )}

          <Text variant="caption" tone="muted" style={styles.cancelNotice}>
            {SUBSCRIPTION_CANCELLATION_PUBLIC_NOTICE} For billing administration (card details,
            invoices, receipts, billing address, and cancellation), use the Stripe Customer Portal.
          </Text>

          {/* Admin billing actions */}
          {isAdmin ? (
            <View style={styles.actions}>
              <Button
                label={portalMutation.isPending ? 'Opening…' : 'Manage billing'}
                variant="primary"
                fullWidth
                loading={portalMutation.isPending}
                disabled={billingLoading || portalMutation.isPending}
                onPress={handleManageBilling}
              />
              {portalUnavailable && (
                <Button
                  label="Open billing on web"
                  variant="secondary"
                  fullWidth
                  onPress={() => openWeb('/dashboard/settings?tab=plan')}
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
            <View style={styles.actions}>
              <Text variant="caption" tone="muted">
                Contact your admin to manage billing.
              </Text>
              <Button
                label="View plan on web"
                variant="ghost"
                fullWidth
                onPress={() => openWeb('/dashboard/settings?tab=plan')}
              />
            </View>
          )}
        </Card>

        {/* Change Appointments plan — Light / Plus / Pro with proration previews */}
        {isAdmin && isAppointmentsTier(pricingTier) && !subscriptionExpired && (
          <PlanChangeSection
            currentTier={pricingTier}
            planStatus={planStatus}
            hasStripeSubscription={hasStripeSub && billingActive}
            manageOnWeb={manageOnWeb}
            onManageOnWeb={() => openWeb('/dashboard/settings?tab=plan')}
            onChanged={(message) => {
              setSuccessMsg(message);
              setActionError(null);
              void refetchBilling();
            }}
          />
        )}

        {/* Stripe Connect (web Settings → Payments tab) */}
        <StripeConnectCard
          isAdmin={isAdmin}
          hasAccountId={hasStripeAccount}
          chargesEnabled={chargesEnabled}
          detailsSubmitted={detailsSubmitted}
          connecting={stripeConnectLinkMutation.isPending}
          errorText={connectError}
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

        {/* Danger zone — self-serve venue deletion (admin only, web parity). */}
        {isAdmin && (
          <Card>
            <View style={styles.cardHeader}>
              <Text variant="label" color={colors.danger}>
                Danger zone
              </Text>
            </View>
            <Text variant="subheading" style={styles.tierName}>
              Delete this venue
            </Text>
            <Text variant="bodySmall" tone="secondary">
              Schedule a 30-day grace-period deletion of this venue and all of its data. You can
              cancel any time before the grace period ends.
            </Text>
            <View style={styles.actions}>
              <Button
                label="Delete this venue…"
                variant="danger"
                fullWidth
                onPress={() => setShowDeleteVenue(true)}
              />
            </View>
          </Card>
        )}

        <View style={styles.spacer} />
      </ScrollView>

      {/* Venue-deletion danger-zone sheet (type-to-confirm; admin only). */}
      <DeleteVenueSheet
        visible={showDeleteVenue}
        venueName={venue.name ?? ''}
        onClose={() => setShowDeleteVenue(false)}
      />
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
    gap: spacing.xs,
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
  tierName: {
    marginBottom: spacing.xs,
  },
  inclusions: {
    marginTop: spacing.xs,
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
  discountList: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  disclaimer: {
    marginBottom: spacing.sm,
  },
  meters: {
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  smsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  smsUsage: {
    gap: spacing.xs,
  },
  overageBox: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  overageText: {
    lineHeight: 18,
  },
  billingErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
  },
  billingErrorText: {
    flex: 1,
  },
  cancelNotice: {
    marginTop: spacing.sm,
  },
  actions: {
    marginTop: spacing.base,
    gap: spacing.sm,
  },
  spacer: {
    height: spacing.xl,
  },
});
