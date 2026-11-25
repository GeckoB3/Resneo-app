import { useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChargeNoShowPanel } from '@/components/bookings/ChargeNoShowPanel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { SectionCard } from '@/components/ui/SectionCard';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatPence } from '@/lib/format';
import { queryKeys } from '@/lib/queries/keys';
import { useFeesToCharge, useSendFeeLink, useWaiveFee, waiveFeeErrorMessage } from '@/lib/queries/useFeesToCharge';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import { FEE_CARD_CANNOT_BE_CHARGED, feesToChargeHeadline, type FeeToCharge } from '@/types/fees-to-charge';

/** How many rows the card lists before "Show all" (FC6). */
export const FEES_SHOWN = 5;

/** "3 fees to charge · £135.00". */
export function feesToChargeTitle(count: number, totalPence: number, currency: string): string {
  return `${feesToChargeHeadline(count)} · ${formatPence(totalPence, currency) ?? ''}`;
}

/** The Waive question (plan §2.1). */
export function waiveFeeQuestion(fee: Pick<FeeToCharge, 'amount_pence' | 'currency' | 'client_name' | 'reason'>): {
  title: string;
  body: string;
} {
  const kind = fee.reason === 'late_cancellation' ? 'late-cancellation' : 'no-show';
  const amount = formatPence(fee.amount_pence, fee.currency) ?? '';
  return {
    title: 'Waive this fee?',
    body: `Waive the ${amount} ${kind} fee for ${fee.client_name}? Their card will no longer be held for this booking.`,
  };
}

/**
 * The Today screen's "Fees to charge" card (web Docs/fees-to-charge-plan.md §2.1, §2.3): no-show and
 * client late-cancellation fees this business can still charge, soonest deadline first. Admins only:
 * the route answers 403 to anyone else, and an older server 404, and the card then stays hidden, as
 * it does when there is nothing to charge or the list cannot be read.
 *
 * Charge opens the existing charge panel for the visit (`ChargeNoShowPanel`, as the booking's card
 * sheet draws it), so the amount is seen and confirmed there. A row whose card can no longer be
 * charged offers "Send payment link" in its place, which opens the same panel. Waive asks first,
 * then releases the card hold for every service of the visit the fee covers.
 */
export function FeesToChargeHomeCard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { colors } = useTheme();
  // Only admins can charge (FC4): nobody else asks for the list.
  const isAdmin = useStaffMe().data?.staff?.role === 'admin';
  const fees = useFeesToCharge(isAdmin);
  const waive = useWaiveFee();
  const sendLink = useSendFeeLink();
  const [expanded, setExpanded] = useState(false);
  const [charging, setCharging] = useState<FeeToCharge | null>(null);
  const [waiving, setWaiving] = useState<FeeToCharge | null>(null);

  const data = fees.data ?? null;
  const items = data?.items ?? [];
  const show = !!data && data.count > 0 && items.length > 0;
  const rows = expanded ? items : items.slice(0, FEES_SHOWN);

  const closeCharge = useCallback(() => {
    setCharging(null);
    // A charge or a link takes the row off; read the list again on the way back.
    void queryClient.invalidateQueries({ queryKey: queryKeys.feesToCharge.all() });
  }, [queryClient]);

  // An older server without the visit charge: the booking's own screen charges it instead.
  const openBookingInstead = useCallback(() => {
    const fee = charging;
    setCharging(null);
    const bookingId = fee?.booking_ids[0];
    if (bookingId) router.push(`/booking/${bookingId}` as Href);
  }, [charging, router]);

  async function confirmWaive() {
    const fee = waiving;
    if (!fee) return;
    try {
      await waive.mutateAsync(fee);
      setWaiving(null);
      toast.success(`Fee waived for ${fee.client_name}.`);
    } catch (error) {
      setWaiving(null);
      // 409: nothing left to waive (charged or waived meanwhile). Say so, the list reads again.
      if (error instanceof ApiError && error.status === 409) toast.info(waiveFeeErrorMessage(error));
      else toast.error(waiveFeeErrorMessage(error));
    }
  }

  // A card that can no longer be charged (FC2): send the client a link to pay instead.
  async function sendPaymentLink(fee: FeeToCharge) {
    try {
      const out = await sendLink.mutateAsync(fee);
      toast.success(out.message);
    } catch (error) {
      toast.error(waiveFeeErrorMessage(error));
    }
  }

  const question = waiving ? waiveFeeQuestion(waiving) : null;

  return (
    <>
      {show && data ? (
        <SectionCard elevated>
          <SectionCard.Header
            title={feesToChargeTitle(data.count, data.total_pence, data.currency)}
            right={<Badge label={String(data.count)} tone="warning" solid />}
          />
          <SectionCard.Body style={styles.body}>
            {rows.map((fee, i) => (
              <View
                key={fee.visit_id}
                testID={`fee-row-${fee.visit_id}`}
                style={[styles.row, i > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}>
                <View style={styles.rowHead}>
                  <Text variant="bodySmall" style={styles.name}>
                    {fee.client_name}
                  </Text>
                  <Text variant="bodySmall" style={styles.amount}>
                    {formatPence(fee.amount_pence, fee.currency) ?? ''}
                  </Text>
                </View>
                <Text variant="caption" tone="secondary">
                  {fee.text}
                </Text>
                <View style={styles.meta}>
                  <Text
                    variant="caption"
                    testID={`fee-charge-by-${fee.visit_id}`}
                    tone={fee.urgent ? undefined : 'muted'}
                    color={fee.urgent ? colors.warning : undefined}
                    style={fee.urgent ? styles.urgent : undefined}>
                    {fee.charge_by_label}
                  </Text>
                  {!fee.chargeable ? <Badge label={FEE_CARD_CANNOT_BE_CHARGED} tone="danger" /> : null}
                </View>
                <View style={styles.actions}>
                  <Button
                    label="Waive"
                    variant="secondary"
                    size="sm"
                    accessibilityHint={`Waives the fee for ${fee.client_name}`}
                    disabled={waive.isPending}
                    onPress={() => setWaiving(fee)}
                  />
                  <Button
                    label={fee.chargeable ? 'Charge' : 'Send payment link'}
                    size="sm"
                    accessibilityHint={
                      fee.chargeable
                        ? `Opens the charge for ${fee.client_name}`
                        : `Sends ${fee.client_name} a link to pay the fee, as their card can't be charged`
                    }
                    disabled={!fee.chargeable && sendLink.isPending}
                    onPress={() => (fee.chargeable ? setCharging(fee) : void sendPaymentLink(fee))}
                  />
                </View>
              </View>
            ))}
          </SectionCard.Body>
          {!expanded && items.length > FEES_SHOWN ? (
            <SectionCard.Footer style={styles.footer}>
              <Button
                label={`Show all ${items.length}`}
                variant="ghost"
                size="sm"
                onPress={() => setExpanded(true)}
              />
            </SectionCard.Footer>
          ) : null}
        </SectionCard>
      ) : null}

      {/* Kept mounted while the list empties, so a charge's outcome stays on screen. */}
      <Sheet visible={!!charging} onClose={closeCharge}>
        {charging ? (
          <ChargeNoShowPanel
            visitId={charging.visit_id}
            bookingId={charging.booking_ids[0] ?? charging.visit_id}
            onUnavailable={openBookingInstead}
            onBack={closeCharge}
          />
        ) : null}
      </Sheet>

      <ConfirmSheet
        visible={!!waiving}
        title={question?.title ?? ''}
        message={question?.body}
        confirmLabel="Waive fee"
        cancelLabel="Keep"
        loading={waive.isPending}
        onConfirm={() => void confirmWaive()}
        onClose={() => {
          if (!waive.isPending) setWaiving(null);
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
