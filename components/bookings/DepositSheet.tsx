import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useBookingDeposit, type DepositAction } from '@/lib/queries/useBookingMutations';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

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

function formatAmount(pence?: number | null): string | null {
  if (pence == null || pence <= 0) return null;
  return `£${(pence / 100).toFixed(2)}`;
}

/** Bottom-sheet for deposit actions: send link, record cash, waive, refund. */
export function DepositSheet({ target, onClose }: DepositSheetProps) {
  const { colors } = useTheme();
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

  const amount = formatAmount(target?.amountPence);

  return (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.surfaceRaised }]}>
          {target && seededId === target.id ? (
            <View style={styles.content}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />

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
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  sheet: {
    borderTopLeftRadius: radius.surface,
    borderTopRightRadius: radius.surface,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
  },
  headerBlock: {
    gap: spacing.xs,
  },
  buttons: {
    gap: spacing.sm,
  },
});
