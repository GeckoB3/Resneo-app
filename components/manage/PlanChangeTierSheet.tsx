import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { hapticError, hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useAppointmentsPlanChange,
  useAppointmentsPlanPreview,
  type AppointmentsPlanPreview,
} from '@/lib/queries/useBillingStatus';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export type AppointmentsTier = 'light' | 'plus' | 'appointments';

const TIER_DISPLAY: Record<AppointmentsTier, string> = {
  light: 'Light',
  plus: 'Plus',
  appointments: 'Pro',
};

const TIER_PRICE: Record<AppointmentsTier, string> = {
  light: '£29/mo',
  plus: '£59/mo',
  appointments: '£99/mo',
};

const TIER_CALENDARS: Record<AppointmentsTier, string> = {
  light: '1 calendar',
  plus: 'Up to 5 calendars',
  appointments: 'Unlimited calendars',
};

const TIER_TEAM: Record<AppointmentsTier, string> = {
  light: '1 team login',
  plus: 'Up to 5 team logins',
  appointments: 'Unlimited team logins',
};

// ---------------------------------------------------------------------------
// Tier selection sheet
// ---------------------------------------------------------------------------

type Props = {
  visible: boolean;
  currentTier: AppointmentsTier;
  onClose: () => void;
  onSuccess: (newTier: AppointmentsTier) => void;
};

export function PlanChangeTierSheet({ visible, currentTier, onClose, onSuccess }: Props) {
  const { colors } = useTheme();
  const [selectedTier, setSelectedTier] = useState<AppointmentsTier | null>(null);
  const [preview, setPreview] = useState<AppointmentsPlanPreview | null>(null);
  const [step, setStep] = useState<'select' | 'confirm'>('select');

  const previewMutation = useAppointmentsPlanPreview();
  const changeMutation = useAppointmentsPlanChange();

  const tiers: AppointmentsTier[] = ['light', 'plus', 'appointments'];
  const otherTiers = tiers.filter((t) => t !== currentTier);

  function handleSelectTier(tier: AppointmentsTier) {
    setSelectedTier(tier);
    setPreview(null);
    setStep('confirm');

    previewMutation.mutate(tier, {
      onError: (err: Error) => {
        hapticError();
        Alert.alert('Could not load preview', err.message);
        setStep('select');
        setSelectedTier(null);
      },
    });
  }

  function handleConfirm() {
    if (!selectedTier) return;
    hapticWarning();
    changeMutation.mutate(selectedTier, {
      onSuccess: (data) => {
        hapticSuccess();
        onSuccess(selectedTier);
        Alert.alert('Plan changed', data.message ?? `Moved to ${TIER_DISPLAY[selectedTier]}.`);
        handleClose();
      },
      onError: (err: Error) => {
        hapticError();
        Alert.alert('Plan change failed', err.message);
      },
    });
  }

  function handleClose() {
    setSelectedTier(null);
    setPreview(null);
    setStep('select');
    previewMutation.reset();
    changeMutation.reset();
    onClose();
  }

  // When preview comes back, update it
  if (previewMutation.isSuccess && previewMutation.data && preview !== previewMutation.data) {
    setPreview(previewMutation.data);
  }

  return (
    <Sheet visible={visible} onClose={handleClose} maxHeight="90%">
      <Text variant="subheading" style={styles.title}>
        Change plan
      </Text>
      <Text variant="bodySmall" tone="secondary" style={styles.subtitle}>
        Current: Appointments {TIER_DISPLAY[currentTier]}
      </Text>

      {step === 'select' && (
        <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
          {otherTiers.map((tier) => (
            <Card key={tier} style={styles.tierCard}>
              <View style={styles.tierHeader}>
                <Text variant="label">Appointments {TIER_DISPLAY[tier]}</Text>
                <Text variant="bodyMedium" tone="brand">
                  {TIER_PRICE[tier]}
                </Text>
              </View>
              <Text variant="bodySmall" tone="secondary">
                {TIER_CALENDARS[tier]} · {TIER_TEAM[tier]}
              </Text>
              <Button
                label={
                  (tiers.indexOf(tier) > tiers.indexOf(currentTier) ? 'Upgrade' : 'Downgrade') +
                  ` to ${TIER_DISPLAY[tier]}`
                }
                variant={tiers.indexOf(tier) > tiers.indexOf(currentTier) ? 'primary' : 'secondary'}
                fullWidth
                size="sm"
                style={styles.tierButton}
                onPress={() => handleSelectTier(tier)}
              />
            </Card>
          ))}
        </ScrollView>
      )}

      {step === 'confirm' && selectedTier && (
        <View style={styles.confirmContainer}>
          {previewMutation.isPending && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.brand} />
              <Text variant="bodySmall" tone="secondary">
                Loading preview…
              </Text>
            </View>
          )}

          {previewMutation.isSuccess && preview && (
            <View>
              <Text variant="label" style={styles.previewTitle}>
                {preview.is_upgrade ? 'Upgrade' : 'Downgrade'} to Appointments{' '}
                {TIER_DISPLAY[selectedTier]}
              </Text>

              {/* Proration summary */}
              <View
                style={[
                  styles.prorationBox,
                  {
                    backgroundColor: preview.is_upgrade
                      ? colors.brandSubtle
                      : colors.successSurface,
                  },
                ]}>
                {preview.is_upgrade ? (
                  <>
                    <Text variant="bodySmall" tone="secondary">
                      Charged today (prorated)
                    </Text>
                    <Text variant="subheading" tone="brand">
                      {preview.amount_due.formatted}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text variant="bodySmall" tone="secondary">
                      Credit applied to next invoice
                    </Text>
                    <Text variant="subheading" style={{ color: colors.success }}>
                      {preview.proration_total.formatted}
                    </Text>
                  </>
                )}
              </View>

              <Text variant="bodySmall" tone="secondary" style={styles.prorationNote}>
                {preview.is_upgrade
                  ? 'Stripe will invoice the prorated difference for this billing period immediately.'
                  : 'Stripe will apply the prorated credit to your next invoice.'}
              </Text>
            </View>
          )}

          <View style={styles.confirmButtons}>
            <Button
              label="Back"
              variant="secondary"
              onPress={() => setStep('select')}
              style={styles.backButton}
            />
            <Button
              label={
                changeMutation.isPending
                  ? 'Confirming…'
                  : `Confirm ${preview?.is_upgrade ? 'upgrade' : 'change'}`
              }
              variant="primary"
              loading={changeMutation.isPending}
              disabled={previewMutation.isPending || changeMutation.isPending}
              onPress={handleConfirm}
              style={styles.confirmButton}
            />
          </View>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: spacing.xs,
  },
  subtitle: {
    marginBottom: spacing.base,
  },
  scroll: {
    maxHeight: 400,
  },
  tierCard: {
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tierButton: {
    marginTop: spacing.xs,
  },
  confirmContainer: {
    gap: spacing.base,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    justifyContent: 'center',
  },
  previewTitle: {
    marginBottom: spacing.sm,
  },
  prorationBox: {
    padding: spacing.base,
    borderRadius: radius.card,
    gap: spacing.xs,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  prorationNote: {
    textAlign: 'center',
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  backButton: {
    flex: 1,
  },
  confirmButton: {
    flex: 2,
  },
});
