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
};

type ConnectState = 'not_connected' | 'step1_pending' | 'step2_pending' | 'active';

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
