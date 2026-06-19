import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import {
  APPOINTMENTS_PLAN_DETAILS,
  APPOINTMENTS_TIER_ORDER,
  APPOINTMENTS_TIERS,
  planDisplayName,
  type AppointmentsTier,
} from '@/components/plan/planConstants';
import { hapticError, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useAppointmentsPlanChange, type PlanStatus } from '@/lib/queries/useBillingStatus';
import { useAppointmentsPlanPreviews } from '@/lib/queries/usePlanPreviews';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type PlanChangeSectionProps = {
  currentTier: AppointmentsTier;
  planStatus: PlanStatus;
  hasStripeSubscription: boolean;
  /**
   * Reader-app posture (native app-store builds): when true, plan changes are
   * NOT performed in-app — the section renders a single "manage on the web"
   * link instead, routing upgrades/downgrades to the web dashboard. See
   * `lib/billing/store-billing-policy.ts`.
   */
  manageOnWeb: boolean;
  /** Opens the web dashboard plan page (used when `manageOnWeb`). */
  onManageOnWeb: () => void;
  /** Bubbles the server success message up to the page-level banner. */
  onChanged: (message: string) => void;
};

/**
 * "Change Appointments plan" — mirrors the web Plan tab: a card per other
 * tier (price, inclusions, live proration preview) plus an inline confirm
 * panel. Updates the existing Stripe subscription using the card on file —
 * no checkout redirect.
 */
export function PlanChangeSection({
  currentTier,
  planStatus,
  hasStripeSubscription,
  manageOnWeb,
  onManageOnWeb,
  onChanged,
}: PlanChangeSectionProps) {
  const { colors } = useTheme();
  const [selectedTier, setSelectedTier] = useState<AppointmentsTier | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const changeMutation = useAppointmentsPlanChange();

  const otherTiers = APPOINTMENTS_TIERS.filter((t) => t !== currentTier);

  // Mirrors the web's disabled gate: needs an updatable, active subscription.
  const blocked =
    !hasStripeSubscription ||
    planStatus === 'past_due' ||
    planStatus === 'cancelling' ||
    planStatus === 'cancelled';

  // Skip proration previews entirely under the reader-app posture — we never
  // offer the in-app change there, so there is no estimate to show or fetch.
  const previews = useAppointmentsPlanPreviews(otherTiers, !blocked && !manageOnWeb);

  // Reader-app posture (native app-store builds): no in-app plan changes. Show a
  // single link to the web dashboard, where upgrades/downgrades and new
  // subscriptions are handled. The change applies back here automatically.
  if (manageOnWeb) {
    return (
      <Card>
        <Text variant="label">Change your plan</Text>
        <Text variant="bodySmall" tone="secondary" style={styles.intro}>
          Upgrades, downgrades, and new subscriptions are managed on the ResNeo
          website. Any change applies here automatically once you’re done.
        </Text>
        <Button
          label="Manage plan on the web"
          variant="secondary"
          fullWidth
          onPress={onManageOnWeb}
        />
      </Card>
    );
  }

  const selectedPreview = selectedTier ? previews[selectedTier] : null;
  const selectedIsUpgrade =
    selectedTier !== null &&
    APPOINTMENTS_TIER_ORDER[selectedTier] > APPOINTMENTS_TIER_ORDER[currentTier];

  function handleConfirm() {
    if (!selectedTier) return;
    hapticWarning();
    setErrorMsg(null);
    changeMutation.mutate(selectedTier, {
      onSuccess: (data) => {
        hapticSuccess();
        setSelectedTier(null);
        onChanged(data.message ?? `Your plan has been changed to ${planDisplayName(selectedTier)}.`);
      },
      onError: (err: Error) => {
        hapticError();
        setErrorMsg(err.message);
      },
    });
  }

  return (
    <Card>
      <Text variant="label">Change Appointments plan</Text>
      <Text variant="bodySmall" tone="secondary" style={styles.intro}>
        Move between Light, Plus, and Pro without starting a new checkout. We update your existing
        Stripe subscription and use the card already on file. Downgrades are available when your
        active calendars and team logins fit the target plan limits.
      </Text>

      {blocked && (
        <View style={[styles.notice, { backgroundColor: colors.warningSurface }]}>
          <Text variant="bodySmall" color={colors.warning}>
            {planStatus === 'past_due'
              ? 'Clear the overdue invoice before changing plan.'
              : planStatus === 'cancelling'
                ? 'Resume your current subscription before changing plan.'
                : planStatus === 'cancelled'
                  ? 'Resubscribe to your current plan before changing to another Appointments plan.'
                  : 'Plan changes need an active Stripe subscription on file.'}
          </Text>
        </View>
      )}

      <View style={styles.tierList}>
        {otherTiers.map((tier) => {
          const details = APPOINTMENTS_PLAN_DETAILS[tier];
          const isUpgrade = APPOINTMENTS_TIER_ORDER[tier] > APPOINTMENTS_TIER_ORDER[currentTier];
          const preview = blocked ? null : previews[tier];

          return (
            <View key={tier} style={[styles.tierCard, { borderColor: colors.border }]}>
              <View style={styles.tierHeader}>
                <Text variant="label">{planDisplayName(tier)}</Text>
                <Text variant="bodyMedium" tone="brand">
                  £{details.price}/month
                </Text>
              </View>
              <Text variant="caption" tone="secondary">
                {details.calendars} · {details.team} · {details.sms}
              </Text>
              <View style={[styles.previewBox, { backgroundColor: colors.surface }]}>
                <Text variant="caption" tone="secondary">
                  {preview ? (
                    isUpgrade ? (
                      <>
                        Pay the difference for the rest of this billing period:{' '}
                        <Text variant="caption" tone="default">
                          {preview.amount_due.formatted}
                        </Text>{' '}
                        today.
                      </>
                    ) : (
                      <>
                        Credit for unused time on your current plan:{' '}
                        <Text variant="caption" tone="default">
                          {preview.proration_total.formatted}
                        </Text>
                        .
                      </>
                    )
                  ) : blocked ? (
                    'Billing adjustment unavailable until this plan can be selected.'
                  ) : (
                    'Checking the estimated billing adjustment…'
                  )}
                </Text>
              </View>
              <Button
                label={`${isUpgrade ? 'Upgrade' : 'Downgrade'} to ${planDisplayName(tier).replace('Appointments ', '')}`}
                variant={isUpgrade ? 'primary' : 'secondary'}
                size="sm"
                fullWidth
                disabled={blocked || changeMutation.isPending}
                onPress={() => {
                  setErrorMsg(null);
                  setSelectedTier(tier);
                }}
              />
            </View>
          );
        })}
      </View>

      {selectedTier && (
        <View style={[styles.confirmPanel, { backgroundColor: colors.warningSurface }]}>
          <Text variant="label" color={colors.warning}>
            Confirm {selectedIsUpgrade ? 'upgrade' : 'downgrade'} to {planDisplayName(selectedTier)}
          </Text>
          <Text variant="bodySmall" color={colors.warning} style={styles.confirmBody}>
            This changes your existing subscription immediately. You do not need to go through the
            Stripe payment portal because Stripe will use the card already saved for your
            subscription.
          </Text>
          <Text variant="bodySmall" color={colors.warning} style={styles.confirmBody}>
            {selectedPreview
              ? selectedIsUpgrade
                ? `Because you are moving to a higher plan part-way through the month, Stripe will charge only the difference for the remaining days in this billing period. Estimated amount due today: ${selectedPreview.amount_due.formatted}.`
                : `Because you are moving to a lower plan part-way through the month, Stripe will work out the unused time on your current plan and apply it as credit on your subscription. Estimated credit: ${selectedPreview.proration_total.formatted}.`
              : 'Stripe will calculate the exact billing adjustment when the change is confirmed.'}
          </Text>
          <Text variant="caption" color={colors.warning}>
            Your new plan limits and SMS allowance will apply as soon as the change is confirmed.
          </Text>
          <View style={styles.confirmButtons}>
            <Button
              label="Keep current plan"
              variant="secondary"
              size="sm"
              disabled={changeMutation.isPending}
              onPress={() => setSelectedTier(null)}
              style={styles.confirmCancel}
            />
            <Button
              label={
                changeMutation.isPending
                  ? 'Confirming…'
                  : `Confirm ${selectedIsUpgrade ? 'upgrade' : 'downgrade'}`
              }
              variant="primary"
              size="sm"
              loading={changeMutation.isPending}
              disabled={changeMutation.isPending}
              onPress={handleConfirm}
              style={styles.confirmAction}
            />
          </View>
        </View>
      )}

      {errorMsg && (
        <Text variant="bodySmall" tone="danger" style={styles.errorText}>
          {errorMsg}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  notice: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  tierList: {
    gap: spacing.sm,
  },
  tierCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  previewBox: {
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  confirmPanel: {
    marginTop: spacing.sm,
    padding: spacing.base,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  confirmBody: {
    lineHeight: 20,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  confirmCancel: {
    flex: 1,
  },
  confirmAction: {
    flex: 1.4,
  },
  errorText: {
    marginTop: spacing.sm,
  },
});
