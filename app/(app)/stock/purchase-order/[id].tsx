import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AmountRow, ErrorLine, money, Notice, posStyles, usePosT } from '@/components/pos/parts';
import { ReceiveSheet, VariantPickerSheet } from '@/components/retail/PurchasingSheets';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { getApiUrl } from '@/lib/env';
import { posErrorMessage, posHeaders, retailPaths } from '@/lib/pos/api';
import { businessDateLabel } from '@/lib/pos/till-math';
import {
  addToDraft,
  draftChanged,
  draftFromLines,
  draftLinesBody,
  draftTotal,
  pickerLabel,
  poStatusId,
  poStatusTone,
  type DraftLine,
} from '@/lib/retail/purchasing';
import { shortWhen } from '@/lib/retail/stock-words';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { usePosBootstrap, usePosEnabled } from '@/lib/queries/usePos';
import {
  PurchaseOrderStaleError,
  usePurchaseOrder,
  usePurchaseOrderAction,
  useUpdatePurchaseOrder,
} from '@/lib/queries/usePurchasing';
import { downloadAndShareFile } from '@/lib/share/share-binary-file';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import type { PurchaseOrderDetail } from '@/types/retail';

/**
 * One purchase order in the app (POS app step 4b, plan P7-15; UX spec §6.13, §13.6).
 *
 * A draft, for `manage_purchase_orders`: its lines (quantity and unit cost, remove), "Add a
 * product" from the picker (the supplier's products first) and "Suggest an order", the expected
 * date and notes for the supplier, the total and the supplier's minimum; "Save order" (`PATCH`
 * with the version; a 412 loads the other person's order), "Send to supplier" (asks first; needs
 * the supplier's email) and "Cancel order". Any order: the PDF through the share sheet. A sent or
 * part received order, for `receive_stock`: "Receive delivery". Deliveries so far are listed.
 */
export default function PurchaseOrderScreen() {
  const t = usePosT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === 'string' ? id : '';
  const posEnabled = usePosEnabled();
  const boot = usePosBootstrap();
  const detail = usePurchaseOrder(orderId);
  const header = (title: string) => <Stack.Screen options={{ headerShown: true, title }} />;

  if (!posEnabled) {
    return (
      <Screen>
        {header(t('app.po.tab'))}
        <EmptyState title={t('till.off.title')} message={t('till.off.body', { venue: 'your venue' })} />
      </Screen>
    );
  }
  if (detail.isLoading) {
    return (
      <Screen padded={false}>
        {header(t('app.po.tab'))}
        <DetailSkeleton />
      </Screen>
    );
  }
  if (!detail.data) {
    return (
      <Screen>
        {header(t('app.po.tab'))}
        <ErrorState message={posErrorMessage(detail.error, t('po.error'))} onRetry={() => void detail.refetch()} />
      </Screen>
    );
  }
  return (
    <>
      {header(t('po.title', { poNumber: detail.data.order.number }))}
      <OrderBody
        key={`${detail.data.order.id}-${detail.data.order.version}`}
        data={detail.data}
        timeZone={boot.data?.venue?.timezone ?? 'Europe/London'}
        refreshing={detail.isRefetching}
        reload={() => void detail.refetch()}
      />
    </>
  );
}

function OrderBody({
  data,
  timeZone,
  refreshing,
  reload,
}: {
  data: PurchaseOrderDetail;
  timeZone: string;
  refreshing: boolean;
  reload: () => void;
}) {
  const t = usePosT();
  const toast = useToast();
  const accessToken = useAccessToken();
  const order = data.order;
  const supplier = data.supplier;
  const update = useUpdatePurchaseOrder(order.id);
  const action = usePurchaseOrderAction(order.id);
  const draftMode = order.status === 'draft' && data.can_manage;
  const [draft, setDraft] = useState<DraftLine[]>(() => draftFromLines(data.lines));
  const [expected, setExpected] = useState<string | null>(order.expected_on);
  const [notes, setNotes] = useState(order.notes ?? '');
  const [picking, setPicking] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [confirm, setConfirm] = useState<'send' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const changed =
    draftChanged(draft, data.lines) || (expected ?? null) !== (order.expected_on ?? null) || notes.trim() !== (order.notes ?? '').trim();
  const total = draftMode ? draftTotal(draft) : order.total_cost_pence;
  const belowMinimum = supplier.min_order_pence != null && supplier.min_order_pence > 0 && total < supplier.min_order_pence;
  const canReceive = data.can_receive && (order.status === 'sent' || order.status === 'part_received');
  const canCancel = data.can_manage && (order.status === 'draft' || order.status === 'sent');

  /** Saves the draft; answers the order's new version, or null when it was not saved. */
  async function save(): Promise<number | null> {
    const built = draftLinesBody(draft);
    if (built.problem) {
      setError(
        built.problem.kind === 'qty' ? t('po.qty.invalid', { product: built.problem.name }) : t('po.cost.invalid', { product: built.problem.name }),
      );
      return null;
    }
    setError(null);
    try {
      const res = await update.mutateAsync({ version: order.version, lines: built.lines, expected_on: expected, notes: notes.trim() || null });
      toast.success(t('po.saved'));
      return res.version;
    } catch (e) {
      if (e instanceof PurchaseOrderStaleError) {
        setNotice(t('app.po.stale'));
        return null;
      }
      setError(posErrorMessage(e, t('common.saveError')));
      return null;
    }
  }

  async function suggest() {
    setError(null);
    try {
      // Unsaved changes would be lost when the order is read again, so they are saved first.
      if (changed && (await save()) == null) return;
      const res = await action.mutateAsync({ action: 'suggest' });
      const added = typeof res.added === 'number' ? res.added : 0;
      setNotice(added > 0 ? t('po.suggest.added', { count: added, supplier: supplier.name }) : t('po.suggest.none', { supplier: supplier.name }));
    } catch (e) {
      setError(posErrorMessage(e, t('common.saveError')));
    }
  }

  async function send() {
    setConfirm(null);
    setError(null);
    try {
      let version = order.version;
      if (changed) {
        const saved = await save();
        if (saved == null) return;
        version = saved;
      }
      await action.mutateAsync({ action: 'send', version });
      toast.success(t('po.sent.toast', { supplier: supplier.name }));
    } catch (e) {
      setError(posErrorMessage(e, t('common.saveError')));
      reload();
    }
  }

  async function cancel() {
    setConfirm(null);
    setError(null);
    try {
      await action.mutateAsync({ action: 'cancel', version: order.version });
      toast.success(t('po.cancelled.toast'));
    } catch (e) {
      setError(posErrorMessage(e, t('common.saveError')));
    }
  }

  async function sharePdf() {
    if (!accessToken) return;
    setSharing(true);
    try {
      const res = await downloadAndShareFile({
        url: `${getApiUrl()}${retailPaths.purchaseOrderPdf(order.id)}`,
        filename: `purchase-order-${order.number}.pdf`,
        mimeType: 'application/pdf',
        headers: { ...posHeaders(), Authorization: `Bearer ${accessToken}` },
        dialogTitle: t('po.title', { poNumber: order.number }),
      });
      if (!res.ok) toast.error(t('app.po.pdfFailed'));
    } finally {
      setSharing(false);
    }
  }

  return (
    <Screen scroll={false} padded={false} keyboardAvoiding>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}>
        <Card>
          <View style={posStyles.stack}>
            <View style={posStyles.row}>
              <Text variant="subheading" style={styles.flex}>
                {supplier.name}
              </Text>
              <Badge label={t(poStatusId(order.status))} tone={poStatusTone(order.status)} />
            </View>
            {order.sent_at && order.sent_to_email ? (
              <Text variant="bodySmall" tone="muted">
                {t('po.sentTo', { email: order.sent_to_email, date: shortWhen(order.sent_at, timeZone) })}
              </Text>
            ) : null}
            {order.status === 'cancelled' && order.cancelled_at ? (
              <Text variant="bodySmall" tone="muted">
                {t('po.cancelled.note', { date: shortWhen(order.cancelled_at, timeZone) })}
              </Text>
            ) : null}
            {order.status === 'received' && order.received_at ? (
              <Text variant="bodySmall" tone="muted">
                {t('po.received.note', { date: shortWhen(order.received_at, timeZone) })}
              </Text>
            ) : null}
            {!draftMode && order.expected_on ? (
              <Text variant="bodySmall">{t('app.po.expected', { date: businessDateLabel(order.expected_on) })}</Text>
            ) : null}
            {!data.can_manage && order.status === 'draft' ? (
              <Text variant="caption" tone="muted">
                {t('po.readOnly')}
              </Text>
            ) : null}
          </View>
        </Card>

        {notice ? <Notice>{notice}</Notice> : null}

        {draftMode ? (
          <>
            {draft.length === 0 ? <Text tone="muted">{t('po.lines.empty')}</Text> : null}
            {draft.map((l, i) => (
              <Card key={l.variant_id}>
                <View style={posStyles.stack}>
                  <View style={posStyles.row}>
                    <Text variant="label" style={styles.flex}>
                      {l.name}
                    </Text>
                    <Button
                      label={t('app.po.extraRemove')}
                      size="sm"
                      variant="ghost"
                      accessibilityLabel={t('po.line.remove', { product: l.name })}
                      onPress={() => setDraft((cur) => cur.filter((_, j) => j !== i))}
                    />
                  </View>
                  {!l.exists ? <Notice tone="warning">{t('po.line.gone')}</Notice> : null}
                  {l.sku ? (
                    <Text variant="caption" tone="muted">
                      {l.sku}
                    </Text>
                  ) : null}
                  <View style={styles.pair}>
                    <Input
                      label={t('po.col.qty')}
                      accessibilityLabel={`${t('po.col.qty')} ${l.name}`}
                      value={l.qty}
                      onChangeText={(v) => setDraft((cur) => cur.map((x, j) => (j === i ? { ...x, qty: v } : x)))}
                      keyboardType="number-pad"
                      containerStyle={styles.flex}
                    />
                    <Input
                      label={t('po.col.cost')}
                      accessibilityLabel={`${t('po.col.cost')} ${l.name}`}
                      value={l.cost}
                      onChangeText={(v) => setDraft((cur) => cur.map((x, j) => (j === i ? { ...x, cost: v } : x)))}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      containerStyle={styles.flex}
                    />
                  </View>
                </View>
              </Card>
            ))}
            <View style={styles.actions}>
              <Button label={t('po.addLine')} size="sm" variant="secondary" onPress={() => setPicking(true)} />
              <Button
                label={t('po.suggest')}
                size="sm"
                variant="secondary"
                loading={action.isPending && action.variables?.action === 'suggest'}
                disabled={action.isPending || update.isPending}
                onPress={() => void suggest()}
              />
            </View>
            <Text variant="caption" tone="muted">
              {t('po.suggest.help', { supplier: supplier.name })}
            </Text>
            <View style={posStyles.stack}>
              <Text variant="label">{t('po.expected')}</Text>
              {expected ? (
                <View style={posStyles.row}>
                  <DatePickerField value={expected} onChange={setExpected} accessibilityLabel={t('po.expected')} />
                  <Button label={t('app.po.clearExpected')} size="sm" variant="ghost" onPress={() => setExpected(null)} />
                </View>
              ) : (
                <Button
                  label={t('app.po.setExpected')}
                  size="sm"
                  variant="ghost"
                  onPress={() => setExpected(new Date().toISOString().slice(0, 10))}
                />
              )}
            </View>
            <Input label={t('po.notes')} accessibilityLabel={t('po.notes')} value={notes} onChangeText={setNotes} multiline maxLength={2000} />
          </>
        ) : (
          data.lines.map((l) => (
            <Card key={l.id}>
              <View style={posStyles.stack}>
                <Text variant="label">{l.name}</Text>
                {l.added_at_receipt ? (
                  <Text variant="caption" tone="muted">
                    {t('po.line.added')}
                  </Text>
                ) : null}
                <Text variant="caption" tone="muted">
                  {t('po.receive.ordered', { received: l.quantity_received, ordered: l.quantity_ordered })}
                </Text>
                <AmountRow label={t('po.col.cost')} amount={money(l.unit_cost_pence)} muted />
                <AmountRow label={t('po.col.total')} amount={money(l.line_total_pence)} />
              </View>
            </Card>
          ))
        )}

        <AmountRow label={t('po.col.total')} amount={money(total)} strong />
        {belowMinimum && supplier.min_order_pence != null ? (
          <Notice tone="warning">{t('po.minOrder', { supplier: supplier.name, amount: money(supplier.min_order_pence) })}</Notice>
        ) : null}
        {draftMode && !supplier.email ? <Notice tone="warning">{t('po.noEmail', { supplier: supplier.name })}</Notice> : null}
        {draftMode && changed ? (
          <Text variant="caption" tone="muted">
            {t('po.unsaved')}
          </Text>
        ) : null}
        <ErrorLine message={error} />

        <View style={posStyles.buttons}>
          {draftMode ? (
            <>
              <Button label={t('app.po.save')} loading={update.isPending} disabled={!changed || update.isPending} onPress={() => void save()} fullWidth />
              <Button
                label={t('po.send')}
                variant="secondary"
                disabled={!supplier.email || draft.length === 0 || action.isPending || update.isPending}
                onPress={() => setConfirm('send')}
                fullWidth
              />
            </>
          ) : null}
          {canReceive ? <Button label={t('po.receive')} onPress={() => setReceiving(true)} fullWidth /> : null}
          <Button label={t('app.receipt.share')} variant="ghost" loading={sharing} onPress={() => void sharePdf()} fullWidth />
          {canCancel ? <Button label={t('po.cancel')} variant="ghost" disabled={action.isPending} onPress={() => setConfirm('cancel')} fullWidth /> : null}
        </View>

        {data.receipts.length > 0 ? (
          <View style={posStyles.stack}>
            <Text variant="label">{t('po.receipts.title')}</Text>
            {data.receipts.map((r) => (
              <View key={r.id} style={styles.receipt}>
                <Text variant="bodySmall">
                  {t('po.receipts.row', {
                    count: r.units,
                    amount: money(r.value_pence),
                    name: r.received_by_name ?? 'your team',
                    date: shortWhen(r.received_at, timeZone),
                  })}
                </Text>
                {r.delivery_ref ? (
                  <Text variant="caption" tone="muted">
                    {t('po.receipts.ref', { ref: r.delivery_ref })}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <VariantPickerSheet
        visible={picking}
        title={t('po.addLine')}
        purpose="order"
        supplierId={supplier.id}
        onClose={() => setPicking(false)}
        onPick={(v) => {
          setPicking(false);
          setDraft((cur) => addToDraft(cur, v, pickerLabel(v)));
        }}
      />
      <ReceiveSheet visible={receiving} detail={data} onClose={() => setReceiving(false)} />
      <ConfirmSheet
        visible={confirm === 'send'}
        title={t('po.send.title', { supplier: supplier.name })}
        message={t('po.send.body', {
          email: supplier.email ?? '',
          venue: data.sender.venue_name,
          replyTo: data.sender.reply_to ?? data.sender.venue_name,
        })}
        confirmLabel={t('po.send')}
        cancelLabel={t('common.cancel')}
        destructive={false}
        loading={action.isPending}
        onConfirm={() => void send()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmSheet
        visible={confirm === 'cancel'}
        title={t('po.cancel.title', { poNumber: order.number })}
        message={t('po.cancel.body', { supplier: supplier.name })}
        confirmLabel={t('po.cancel')}
        cancelLabel={t('common.cancel')}
        loading={action.isPending}
        onConfirm={() => void cancel()}
        onClose={() => setConfirm(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  flex: { flex: 1 },
  pair: { flexDirection: 'row', gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  receipt: { gap: spacing.xxs },
});
