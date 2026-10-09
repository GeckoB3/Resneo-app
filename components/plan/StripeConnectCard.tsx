import { StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type StripeConnectCardProps = {
  isAdmin: boolean;
  hasAccountId: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  connecting: boolean;
  /** Inline failure message from the connect-link mutation (no Alert on web). */
  errorText?: string | null;
  onConnect: () => void;
  /** Opens the Stripe Express dashboard; offered to admins once payments are active. */
  onOpenDashboard?: () => void;
  openingDashboard?: boolean;
  dashboardErrorText?: string | null;
  /** The connected account id, shown once Stripe has one (web: "Account: acct_..."). */
  accountId?: string | null;
  /** True while the account's status is being read; the steps are not guessed meanwhile. */
  loading?: boolean;
  /** The status read failed (web: the message and a Retry button). */
  statusError?: string | null;
  onRetry?: () => void;
};

type ConnectState = 'not_connected' | 'step1_pending' | 'step2_pending' | 'active';

/** What a team member who is not an admin is told at each step (web StripeConnectSection). */
const STAFF_LINE: Record<ConnectState, string | null> = {
  not_connected: 'Ask an admin to connect Stripe.',
  step1_pending: 'Ask an admin to complete Stripe setup.',
  step2_pending: 'Ask an admin to complete identity verification.',
  active: null,
};

/**
 * Stripe Connect onboarding status + CTA — mirrors the web Settings → Payments
 * tab (StripeConnectSection): not connected → business/bank details →
 * identity verification → active.
 */
export function StripeConnectCard({
  isAdmin,
  hasAccountId,
  chargesEnabled,
  detailsSubmitted,
  connecting,
  errorText,
  onConnect,
  onOpenDashboard,
  openingDashboard = false,
  dashboardErrorText = null,
  accountId = null,
  loading = false,
  statusError = null,
  onRetry,
}: StripeConnectCardProps) {
  const { colors } = useTheme();

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

  if (hasAccountId && (loading || statusError)) {
    return (
      <Card>
        <View style={styles.cardHeader}>
          <Text variant="label">Stripe payments</Text>
        </View>
        {statusError ? (
          <>
            <Text variant="bodySmall" tone="danger" style={styles.help}>
              {statusError}
            </Text>
            {onRetry ? <Button label="Retry" variant="secondary" fullWidth onPress={onRetry} /> : null}
          </>
        ) : (
          <Text variant="bodySmall" tone="muted" style={styles.help}>
            Checking your Stripe status…
          </Text>
        )}
      </Card>
    );
  }

  const staffLine = STAFF_LINE[state];

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

      {errorText ? (
        <Text variant="caption" tone="danger" style={styles.errorText}>
          {errorText}
        </Text>
      ) : null}

      {isAdmin && hasAccountId && state === 'active' && onOpenDashboard ? (
        <View style={styles.dashboard}>
          <Button
            label={openingDashboard ? 'Opening Stripe…' : 'Open Stripe dashboard'}
            variant="secondary"
            fullWidth
            loading={openingDashboard}
            onPress={onOpenDashboard}
          />
          <Text variant="caption" tone="muted" style={styles.dashboardHelp}>
            View payouts, balance and transactions in your Stripe dashboard.
          </Text>
          {dashboardErrorText ? (
            <Text variant="caption" tone="danger" style={styles.errorText}>
              {dashboardErrorText}
            </Text>
          ) : null}
        </View>
      ) : null}

      {!isAdmin && staffLine ? (
        <Text variant="caption" tone="muted">
          {staffLine}
        </Text>
      ) : null}

      {hasAccountId && accountId && state !== 'not_connected' ? (
        <Text variant="caption" tone="muted" style={styles.account} selectable>
          {`Account: ${accountId}`}
        </Text>
      ) : null}
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

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  help: {
    marginVertical: spacing.sm,
  },
  errorText: {
    marginTop: spacing.sm,
  },
  account: {
    marginTop: spacing.sm,
  },
  dashboard: {
    marginTop: spacing.md,
  },
  dashboardHelp: {
    marginTop: spacing.xs,
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
});
