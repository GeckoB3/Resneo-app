import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { areaCopy } from '@/lib/collective-area/copy';
import { joinNextSteps, type JoinDraft } from '@/lib/linked/join-choices';
import { setupCopy } from '@/lib/linked/setup-copy';
import { openStripeOnboarding, STRIPE_ONBOARDING_COPY } from '@/lib/payments/stripe-onboarding';
import { useStripeConnectLink } from '@/lib/queries/useBillingStatus';
import { refusalText } from '@/lib/queries/useCollectiveServiceTools';
import { useUpdateFeatureFlags } from '@/lib/queries/useVenueSettings';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { JoinPreview } from '@/types/collectives';

/**
 * Straight after joining (web `JoinNextSteps`, owner 2026-10-28): the two things only this venue
 * can do so guests can book every service on the page with it, each one tap away rather than
 * somewhere in Settings.
 *
 *   Connect Stripe  Stripe's own pages, in the auth session Plan & payments uses
 *                   (`openStripeOnboarding`): Stripe comes back to the app and the window closes.
 *   Turn on         the venue's forms (`compliance_records_enabled`), its own choice made here,
 *                   never made for it (web RT2-6).
 *
 * Nothing shows when neither is needed.
 */
export function JoinNextSteps({ preview, draft }: { preview: JoinPreview; draft: JoinDraft }) {
  const { colors } = useTheme();
  const { refetch: refetchVenue } = useVenueContext();
  const stripeLink = useStripeConnectLink();
  const updateFlags = useUpdateFeatureFlags();
  const [opening, setOpening] = useState(false);
  const [formsOn, setFormsOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const steps = joinNextSteps(preview, draft);
  if (!steps.stripe && !steps.forms) return null;
  const busy = stripeLink.isPending || opening || updateFlags.isPending;
  const stripeCount = preview.warnings.no_stripe_paid_services;
  const formsCount = preview.warnings.form_services;

  const connectStripe = () => {
    setError(null);
    stripeLink.mutate(undefined, {
      onSuccess: ({ url }) => {
        setOpening(true);
        void openStripeOnboarding(url).then((outcome) => {
          setOpening(false);
          if (outcome === 'expired') setError(STRIPE_ONBOARDING_COPY.expired);
          if (outcome === 'failed') setError(setupCopy('join.next.stripeFailed'));
          refetchVenue();
        });
      },
      onError: (err) =>
        setError(refusalText(err, setupCopy('join.next.stripeFailed'), setupCopy('join.next.stripeFailed'))),
    });
  };

  const turnOnForms = () => {
    setError(null);
    updateFlags.mutate(
      { compliance_records_enabled: true },
      {
        onSuccess: () => setFormsOn(true),
        onError: (err) =>
          setError(refusalText(err, setupCopy('join.next.formsFailed'), setupCopy('join.next.formsFailed'))),
      },
    );
  };

  return (
    <View style={[styles.box, { borderColor: colors.warning, backgroundColor: colors.warningSurface }]}>
      <Text variant="label" accessibilityRole="header">
        {setupCopy('join.next.heading')}
      </Text>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {steps.stripe ? (
        <View style={styles.item}>
          <Text variant="bodySmall">
            {setupCopy(stripeCount === 1 ? 'join.next.stripeOne' : 'join.next.stripe', { count: stripeCount })}
          </Text>
          <Button
            label={areaCopy('svc.member.card.connectStripe')}
            size="sm"
            style={styles.button}
            loading={stripeLink.isPending || opening}
            disabled={busy}
            onPress={connectStripe}
          />
        </View>
      ) : null}
      {steps.forms ? (
        <View style={styles.item}>
          <Text variant="bodySmall">
            {formsOn
              ? setupCopy('join.next.formsDone')
              : setupCopy(formsCount === 1 ? 'join.next.formsOne' : 'join.next.forms', { count: formsCount })}
          </Text>
          {formsOn ? null : (
            <Button
              label={areaCopy('svc.member.card.turnOn')}
              variant="secondary"
              size="sm"
              style={styles.button}
              loading={updateFlags.isPending}
              disabled={busy}
              onPress={turnOnForms}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  item: {
    gap: spacing.xs,
  },
  button: {
    alignSelf: 'flex-start',
  },
});
