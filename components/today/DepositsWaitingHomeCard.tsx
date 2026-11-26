import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { SectionCard } from '@/components/ui/SectionCard';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { keepWithoutDepositLabel, keepWithoutDepositQuestion } from '@/lib/booking/deposit-owed-line';
import { formatPence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useKeepWithoutDeposit, useSendDepositPaymentLinkById } from '@/lib/queries/useBookingMutations';
import { useDepositsWaiting } from '@/lib/queries/useDepositsWaiting';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import { depositsWaitingHeadline, type DepositWaitingItem } from '@/types/deposits-waiting';

/** How many rows the card lists before "Show all". */
export const DEPOSITS_SHOWN = 5;

/** The server's own words for a refusal, else a plain fallback. */
function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body as { error?: unknown; message?: unknown } | undefined;
    if (body && typeof body.error === 'string' && body.error) return body.error;
    if (body && typeof body.message === 'string' && body.message) return body.message;
    return error.message || fallback;
  }
  return fallback;
}

/**
 * The Today screen's "waiting for payment" card (web Docs/deposit-handling-review-plan.md DH3; web
 * `DepositsWaitingHomeCard`): upcoming staff bookings still owing their deposit, soonest deadline
 * first. Each row says the client, the service and time, what is owed, when it is cancelled if
 * still unpaid (or that it stays booked), and when the link went, with Send payment link (when the
 * client can be reached), Keep without deposit (a waiting booking only) and Open. Hidden when there
 * are none, and when the list cannot be read (an older server, a refusal, no connection).
 */
export function DepositsWaitingHomeCard() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const waiting = useDepositsWaiting();
  const sendLink = useSendDepositPaymentLinkById();
  const keep = useKeepWithoutDeposit();
  const [expanded, setExpanded] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [keeping, setKeeping] = useState<DepositWaitingItem | null>(null);

  const data = waiting.data ?? null;
  const items = data?.items ?? [];
  const currency = data?.currency ?? 'GBP';
  const show = !waiting.isError && items.length > 0;
  const rows = expanded ? items : items.slice(0, DEPOSITS_SHOWN);

  async function send(item: DepositWaitingItem) {
    setSendingId(item.booking_id);
    try {
      await sendLink.mutateAsync({ bookingId: item.booking_id });
      hapticSuccess();
      toast.success(`Payment link sent to ${item.client_name || 'the client'}.`);
    } catch (error) {
      hapticWarning();
      toast.error(errorText(error, 'The payment link could not be sent. Please try again.'));
    } finally {
      setSendingId(null);
    }
  }

  async function confirmKeep() {
    const item = keeping;
    if (!item) return;
    try {
      await keep.mutateAsync({ bookingId: item.booking_id });
      hapticSuccess();
      setKeeping(null);
      toast.success(`Kept the booking for ${item.client_name || 'the client'}.`);
    } catch (error) {
      hapticWarning();
      setKeeping(null);
      toast.error(errorText(error, 'Could not keep the booking. Please try again.'));
    }
  }

  const question = keeping
    ? keepWithoutDepositQuestion({
        word: keeping.word,
        amountPence: keeping.amount_pence,
        currency,
        guestName: keeping.client_name,
      })
    : null;

  return (
    <>
      {show && data ? (
        <View testID="deposits-waiting-home-card">
          <SectionCard elevated>
            <SectionCard.Header
              eyebrow="Deposits"
              title={depositsWaitingHeadline(data.count || items.length)}
              description="Send the payment link again, or keep the booking without it."
            />
            <SectionCard.Body style={styles.body}>
              {rows.map((item, i) => (
                <View
                  key={item.booking_id}
                  testID={`deposit-waiting-row-${item.booking_id}`}
                  style={[styles.row, i > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}>
                  <View style={styles.rowHead}>
                    <Text variant="bodySmall" style={styles.name}>
                      {item.client_name}
                    </Text>
                    <Text variant="bodySmall" style={styles.amount}>
                      {`${formatPence(item.amount_pence, currency) ?? ''} ${item.word}`}
                    </Text>
                  </View>
                  {item.text ? (
                    <Text variant="caption" tone="secondary">
                      {item.text}
                    </Text>
                  ) : null}
                  <View style={styles.meta}>
                    <Text
                      variant="caption"
                      tone={item.state === 'waiting' ? undefined : 'muted'}
                      color={item.state === 'waiting' ? colors.warning : undefined}
                      style={item.state === 'waiting' ? styles.urgent : undefined}>
                      {item.status_label}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {item.link_label}
                    </Text>
                  </View>
                  <View style={styles.actions}>
                    <Button
                      label="Open"
                      variant="ghost"
                      size="sm"
                      accessibilityHint={`Opens the booking for ${item.client_name}`}
                      onPress={() => router.push(`/booking/${item.booking_id}` as Href)}
                    />
                    {item.state === 'waiting' ? (
                      <Button
                        label={keepWithoutDepositLabel(item.word)}
                        variant="secondary"
                        size="sm"
                        disabled={keep.isPending}
                        onPress={() => setKeeping(item)}
                      />
                    ) : null}
                    {item.can_send ? (
                      <Button
                        label="Send payment link"
                        size="sm"
                        loading={sendingId === item.booking_id}
                        disabled={sendingId !== null}
                        onPress={() => void send(item)}
                      />
                    ) : null}
                  </View>
                </View>
              ))}
            </SectionCard.Body>
            {!expanded && items.length > DEPOSITS_SHOWN ? (
              <SectionCard.Footer style={styles.footer}>
                <Button label={`Show all ${items.length}`} variant="ghost" size="sm" onPress={() => setExpanded(true)} />
              </SectionCard.Footer>
            ) : null}
          </SectionCard>
        </View>
      ) : null}

      <ConfirmSheet
        visible={!!keeping}
        title={question?.title ?? ''}
        message={question?.message}
        confirmLabel={question?.confirmLabel ?? 'Keep booking'}
        destructive={false}
        loading={keep.isPending}
        onConfirm={() => void confirmKeep()}
        onClose={() => {
          if (!keep.isPending) setKeeping(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingVertical: spacing.xs },
  row: { gap: spacing.xs, paddingVertical: spacing.sm },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  name: { flexShrink: 1, minWidth: 0, fontWeight: '600' },
  amount: { flexShrink: 0, fontWeight: '600', fontVariant: ['tabular-nums'] },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  urgent: { fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end', paddingTop: spacing.xxs },
  footer: { alignItems: 'flex-end', paddingTop: spacing.xs },
});
