import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatPositivePence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useBookingDeposit, type DepositAction } from '@/lib/queries/useBookingMutations';
import { spacing } from '@/theme/index';

export type DepositTarget = {
  id: string;
  guestName: string;
  amountPence?: number | null;
  status?: string | null;
  /** Stripe refunds are admin-only (mirrors web permissions). */
  canRefund?: boolean;
};

type DepositSheetProps = {
  target: DepositTarget | null;
  onClose: () => void;
};

/** Bottom-sheet for deposit actions: send link, record cash, waive, refund. */
export function DepositSheet({ target, onClose }: DepositSheetProps) {
  const mutation = useBookingDeposit(target?.id ?? '');

  const [pending, setPending] = useState<DepositAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seededId, setSeededId] = useState<string | null>(null);

  if (target && target.id !== seededId) {
    setSeededId(target.id);
    setPending(null);
    setError(null);
  } else if (!target && seededId !== null) {
    setSeededId(null);
  }

  async function run(action: DepositAction) {
    setError(null);
    setPending(action);
    try {
      await mutation.mutateAsync({ action });
      hapticSuccess();
      setPending(null);
      onClose();
    } catch (e) {
      hapticWarning();
      setPending(null);
      setError(e instanceof ApiError ? e.message : 'Could not complete this deposit action.');
    }
  }

  function confirmRefund() {
    Alert.alert('Refund deposit', 'Refund this deposit to the guest?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Refund', style: 'destructive', onPress: () => void run('refund') },
    ]);
  }

  const amount = formatPositivePence(target?.amountPence);

  return (
    <Sheet visible={!!target} onClose={onClose}>
      {target && seededId === target.id ? (
        <View style={styles.body}>
              <View style={styles.headerBlock}>
                <Text variant="overline" tone="muted">
                  Deposit
                </Text>
                <Text variant="title">
                  {amount ?? 'No deposit set'}
                  {target.status ? ` · ${target.status}` : ''}
                </Text>
                <Text variant="bodySmall" tone="muted">
                  {target.guestName}
                </Text>
              </View>

              <View style={styles.buttons}>
                <Button
                  label="Send payment link"
                  onPress={() => void run('send_payment_link')}
                  loading={pending === 'send_payment_link'}
                  disabled={pending !== null}
                  fullWidth
                />
                <Button
                  label="Record cash payment"
                  variant="secondary"
                  onPress={() => void run('record_cash')}
                  loading={pending === 'record_cash'}
                  disabled={pending !== null}
                  fullWidth
                />
                <Button
                  label="Waive deposit"
                  variant="ghost"
                  onPress={() => void run('waive')}
                  loading={pending === 'waive'}
                  disabled={pending !== null}
                  fullWidth
                />
                {target.canRefund !== false ? (
                  <Button
                    label="Refund"
                    variant="danger"
                    onPress={confirmRefund}
                    loading={pending === 'refund'}
                    disabled={pending !== null}
                    fullWidth
                  />
                ) : null}
              </View>

              {error ? (
                <Text variant="bodySmall" tone="danger">
                  {error}
                </Text>
              ) : null}

              <Button label="Close" variant="secondary" onPress={onClose} fullWidth />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
  },
  headerBlock: {
    gap: spacing.xs,
  },
  buttons: {
    gap: spacing.sm,
  },
});
