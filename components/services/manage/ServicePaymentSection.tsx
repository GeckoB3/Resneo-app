import { type Dispatch, type SetStateAction } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { CARD_HOLD_PERCENT_HELPER } from '@/lib/booking/card-hold-fee';
import { currencySymbol } from '@/lib/format';
import {
  CARD_HOLD_FEE_MODE_OPTIONS,
  PAYMENT_OPTIONS,
  type CardHoldFeeMode,
} from '@/lib/services/service-form-options';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ServicePaymentRequirement } from '@/types/services-manage';

export interface ServicePaymentSectionProps {
  paymentReq: ServicePaymentRequirement;
  setPaymentReq: Dispatch<SetStateAction<ServicePaymentRequirement>>;
  isCardHoldSelected: boolean;
  holdFeeMode: CardHoldFeeMode;
  setHoldFeeMode: Dispatch<SetStateAction<CardHoldFeeMode>>;
  usesVariants: boolean;
  holdFeeIsPercent: boolean;
  price: string;
  setPrice: Dispatch<SetStateAction<string>>;
  deposit: string;
  setDeposit: Dispatch<SetStateAction<string>>;
  holdFeePercent: string;
  setHoldFeePercent: Dispatch<SetStateAction<string>>;
  holdPercentExample: string | null;
  stripeConnected: boolean;
}

/**
 * The service form's Online payment part: the four options, the card hold's
 * fee, price and deposit, and the Stripe warning. Moved out of the Services
 * screen unchanged (codebase standards P5.2).
 */
export function ServicePaymentSection({
  paymentReq,
  setPaymentReq,
  isCardHoldSelected,
  holdFeeMode,
  setHoldFeeMode,
  usesVariants,
  holdFeeIsPercent,
  price,
  setPrice,
  deposit,
  setDeposit,
  holdFeePercent,
  setHoldFeePercent,
  holdPercentExample,
  stripeConnected,
}: ServicePaymentSectionProps) {
  const { colors } = useTheme();
  return (
    <>
      <Text variant="overline" tone="muted">Online payment</Text>
      {PAYMENT_OPTIONS.map((option) => {
        const selected = paymentReq === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => setPaymentReq(option.value)}
            style={({ pressed }) => [
              styles.radioRow,
              {
                borderColor: selected ? colors.brand : colors.border,
                backgroundColor: selected ? colors.brandSubtle : colors.surface,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <View
              style={[
                styles.radioDot,
                { borderColor: selected ? colors.brand : colors.borderStrong },
              ]}>
              {selected ? (
                <View style={[styles.radioDotInner, { backgroundColor: colors.brand }]} />
              ) : null}
            </View>
            <View style={styles.radioText}>
              <Text variant="bodyMedium">{option.label}</Text>
              <Text variant="caption" tone="muted">{option.hint}</Text>
            </View>
          </Pressable>
        );
      })}
      {isCardHoldSelected ? (
        <View style={styles.sectionStack} testID="services-hold-fee-mode">
          <Text variant="label">No-show fee</Text>
          <Segmented
            options={CARD_HOLD_FEE_MODE_OPTIONS}
            value={holdFeeMode}
            onChange={setHoldFeeMode}
            wrapLabels
          />
        </View>
      ) : null}
      {!usesVariants || paymentReq === 'deposit' || (isCardHoldSelected && !holdFeeIsPercent) ? (
        <View style={styles.moneyRow}>
          {!usesVariants ? (
            <View style={styles.moneyField}>
              <Input label={`Price (${currencySymbol()})`} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
            </View>
          ) : null}
          {paymentReq === 'deposit' || (isCardHoldSelected && !holdFeeIsPercent) ? (
            <View style={styles.moneyField}>
              <Input
                label={
                  isCardHoldSelected
                    ? usesVariants
                      ? `Default no-show fee (${currencySymbol()})`
                      : `No-show fee (${currencySymbol()})`
                    : usesVariants
                      ? `Default deposit (${currencySymbol()})`
                      : `Deposit (${currencySymbol()})`
                }
                helper={
                  isCardHoldSelected
                    ? usesVariants
                      ? `Used when an option leaves its fee blank. Must be at least ${currencySymbol()}1.`
                      : `The no-show fee must be at least ${currencySymbol()}1.`
                    : usesVariants
                      ? 'Used when an option leaves its deposit blank.'
                      : undefined
                }
                value={deposit}
                onChangeText={setDeposit}
                keyboardType="decimal-pad"
              />
            </View>
          ) : null}
        </View>
      ) : null}
      {holdFeeIsPercent ? (
        <View style={styles.sectionStack}>
          <Input
            label="No-show fee (%)"
            helper={CARD_HOLD_PERCENT_HELPER}
            value={holdFeePercent}
            onChangeText={setHoldFeePercent}
            keyboardType="number-pad"
            maxLength={3}
            testID="services-hold-fee-percent"
          />
          {holdPercentExample ? (
            <Text variant="caption" tone="secondary" testID="services-hold-fee-example">
              {holdPercentExample}
            </Text>
          ) : null}
        </View>
      ) : null}
      {usesVariants && paymentReq === 'full_payment' ? (
        <Text variant="caption" tone="muted">
          Each option offered to clients needs its own price. That&apos;s what they pay online.
        </Text>
      ) : null}

      {/* Stripe-not-connected warning when an online payment is required (web parity). */}
      {paymentReq !== 'none' && !stripeConnected ? (
        <View style={[styles.stripeWarning, { backgroundColor: colors.warningSurface }]}>
          <Text variant="caption" color={colors.warning}>
            Stripe is not connected. Connect your Stripe account in More, then Plan &amp; payments,
            before clients can pay online.
          </Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // Vertical rhythm for inputs/rows inside a CollapsibleCard body (the card body
  // is a single View, so the sheet-level `gap` doesn't reach these children).
  sectionStack: {
    gap: spacing.md,
  },
  moneyRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  moneyField: {
    flex: 1,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  radioDot: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDotInner: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  radioText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  stripeWarning: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
