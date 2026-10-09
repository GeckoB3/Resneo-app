import { type Href, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AmountRow, ErrorLine, money, posStyles, usePosT } from '@/components/pos/parts';
import {
  CancelOrderSheet,
  DispatchSheet,
  OrderRefundSheet,
  PickupSheet,
  RecordReturnSheet,
} from '@/components/shop/OrderSheets';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { getApiUrl, getWebUrl } from '@/lib/env';
import { posErrorMessage, posHeaders, shopPaths } from '@/lib/pos/api';
import { shortWhen, timeOfDay } from '@/lib/retail/stock-words';
import {
  formatPickupCode,
  MESSAGE_TITLES,
  orderActions,
  orderDate,
  orderStatusLabel,
  orderStatusTone,
  packingSlipFilename,
  timelineText,
} from '@/lib/shop/order-words';
import { downloadAndShareFile } from '@/lib/share/share-binary-file';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useOrderWrite, useShopOrder } from '@/lib/queries/useOrders';
import { usePosEnabled } from '@/lib/queries/usePos';
import { useVenue } from '@/lib/queries/useVenue';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import type { ShopOrderDetail } from '@/types/shop';

/**
 * One online order in the app (POS app step 5, plan P7-16; UX spec §8.2 to §8.7, §13.7), from the
 * Orders list, a pickup code and the `shop_order_new` push. The actions its state allows (§8.3):
 * start preparing; mark ready (asks first, then tells the customer); mark collected after checking
 * the pickup code, typed or scanned (or, without it, that staff checked who the customer is); mark
 * dispatched with the carrier and tracking, change tracking, mark delivered; cancel and refund in
 * full; refund or return chosen items; record a return and its dates. The packing slip is a PDF
 * (`/packing-slip.pdf`, Bearer) shared through the share sheet, to print or send; a server without
 * that route answers 404 and the slip opens on the web page instead. Items, the fulfilment, returns, payments and refunds, the customer,
 * messages and the timeline follow.
 */
export default function OrderScreen() {
  const t = usePosT();
  const params = useLocalSearchParams<{ id: string; code?: string; venue?: string }>();
  const orderId = typeof params.id === 'string' ? params.id : '';
  const initialCode = typeof params.code === 'string' ? params.code : null;
  const venueParam = typeof params.venue === 'string' ? params.venue : null;
  const venue = useVenue();
  const posEnabled = usePosEnabled();
  const detail = useShopOrder(orderId);
  const header = (title: string) => <Stack.Screen options={{ headerShown: true, title }} />;

  if (!posEnabled) {
    return (
      <Screen>
        {header(t('ord.title'))}
        <EmptyState title={t('till.off.title')} message={t('till.off.body', { venue: 'your venue' })} />
      </Screen>
    );
  }
  if (venueParam && venue.data?.id && venue.data.id !== venueParam) {
    return (
      <Screen>
        {header(t('ord.title'))}
        <EmptyState title={t('ord.title')} message={t('app.ord.otherVenue')} />
      </Screen>
    );
  }
  if (detail.isLoading) {
    return (
      <Screen padded={false}>
        {header(t('ord.title'))}
        <DetailSkeleton />
      </Screen>
    );
  }
  if (!detail.data) {
    return (
      <Screen>
        {header(t('ord.title'))}
        <ErrorState message={posErrorMessage(detail.error, t('ord.detail.notFound'))} onRetry={() => void detail.refetch()} />
      </Screen>
    );
  }
  return (
    <>
      {header(t('ord.detail.title', { orderNo: detail.data.order.number }))}
      <OrderBody data={detail.data} initialCode={initialCode} refreshing={detail.isRefetching} reload={() => void detail.refetch()} />
    </>
  );
}

type Dialog = 'pickup' | 'dispatch' | 'tracking' | 'cancel' | 'refund' | 'return' | 'ready' | null;

function OrderBody({
  data,
  initialCode,
  refreshing,
  reload,
}: {
  data: ShopOrderDetail;
  initialCode: string | null;
  refreshing: boolean;
  reload: () => void;
}) {
  const t = usePosT();
  const toast = useToast();
  const router = useRouter();
  const o = data.order;
  const write = useOrderWrite(o.id);
  const tz = data.venue.timezone;
  const status = o.fulfilment_status ?? 'new';
  const isDelivery = o.fulfilment_type === 'delivery';
  const customer = o.contact_name ?? 'the customer';
  // Found by its pickup code: the check opens with the code filled in.
  const [dialog, setDialog] = useState<Dialog>(initialCode && status === 'ready' ? 'pickup' : null);
  const [fromReturn, setFromReturn] = useState<string | null>(null);
  const [evidenceFor, setEvidenceFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharingSlip, setSharingSlip] = useState(false);
  const accessToken = useAccessToken();
  const actions = orderActions(data);
  const goods = data.lines.filter((l) => l.line_type === 'product');

  function moved(next: string) {
    toast.success(t('ord.done.moved', { orderNo: o.number, status: orderStatusLabel(next, t) }));
  }

  async function move(next: 'preparing' | 'ready' | 'delivered') {
    setBusy(true);
    setError(null);
    try {
      await write.mutateAsync({ kind: 'status', body: { status: next } });
      moved(next);
    } catch (e) {
      setError(posErrorMessage(e, t('ord.error')));
    } finally {
      setBusy(false);
    }
  }

  async function returnAction(returnId: string, action: 'received' | 'evidence') {
    setError(null);
    try {
      await write.mutateAsync({ kind: 'returnUpdate', returnId, body: { action } });
    } catch (e) {
      setError(posErrorMessage(e, t('ord.error')));
    }
  }

  function openSlipOnWeb() {
    const base = getWebUrl() || 'https://reserve-ni.vercel.app';
    const url = `${base}/dashboard/orders/${encodeURIComponent(o.id)}/packing-slip`;
    toast.info(t('app.ord.slip.web'));
    void WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => undefined));
  }

  // The slip as a PDF through the share sheet, as the X and Z reports are shared. A server before
  // the PDF route answers 404, so the slip opens on the web page as it did before.
  async function shareSlip() {
    if (!accessToken || sharingSlip) return;
    setSharingSlip(true);
    try {
      const res = await downloadAndShareFile({
        url: `${getApiUrl()}${shopPaths.packingSlipPdf(o.id)}`,
        filename: packingSlipFilename(o.number),
        mimeType: 'application/pdf',
        headers: { ...posHeaders(), Authorization: `Bearer ${accessToken}` },
        dialogTitle: t('ord.action.packingSlip'),
      });
      if (!res.ok) {
        if (res.status === 404) openSlipOnWeb();
        else toast.error(t('app.ord.slip.failed'));
      }
    } finally {
      setSharingSlip(false);
    }
  }

  const actionButton = (key: (typeof actions)[number]) => {
    switch (key) {
      case 'preparing':
        return <Button key={key} label={t('ord.action.preparing')} variant="secondary" disabled={busy} onPress={() => void move('preparing')} fullWidth />;
      case 'ready':
        return <Button key={key} label={t('ord.action.ready')} disabled={busy} onPress={() => setDialog('ready')} fullWidth />;
      case 'dispatch':
        return <Button key={key} label={t('ord.action.dispatch')} disabled={busy} onPress={() => setDialog('dispatch')} fullWidth />;
      case 'collected':
        return <Button key={key} label={t('ord.action.collected')} disabled={busy} onPress={() => setDialog('pickup')} fullWidth />;
      case 'delivered':
        return <Button key={key} label={t('ord.action.delivered')} disabled={busy} onPress={() => void move('delivered')} fullWidth />;
      case 'editTracking':
        return <Button key={key} label={t('ord.action.editTracking')} variant="secondary" disabled={busy} onPress={() => setDialog('tracking')} fullWidth />;
      case 'recordReturn':
        return <Button key={key} label={t('ret.record')} variant="secondary" onPress={() => setDialog('return')} fullWidth />;
      case 'cancelRefund':
        return <Button key={key} label={t('ord.action.cancelRefund')} variant="danger" onPress={() => setDialog('cancel')} fullWidth />;
      case 'refund':
        return (
          <Button
            key={key}
            label={t('ord.action.refund')}
            variant="secondary"
            onPress={() => {
              setFromReturn(null);
              setDialog('refund');
            }}
            fullWidth
          />
        );
      case 'packingSlip':
        return (
          <Button
            key={key}
            label={t('ord.action.packingSlip')}
            variant="ghost"
            loading={sharingSlip}
            disabled={sharingSlip}
            onPress={() => void shareSlip()}
            fullWidth
          />
        );
      default:
        return null;
    }
  };

  const address = [o.delivery_address?.line1, o.delivery_address?.line2, o.delivery_address?.town, o.delivery_address?.postcode].filter(Boolean).join(', ');
  const pastWindow = data.return_window_closed && data.return_window_ends ? orderDate(data.return_window_ends, tz) : null;

  return (
    <Screen scroll={false} padded={false}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}>
        <View style={styles.chips}>
          <Badge label={orderStatusLabel(status, t)} tone={orderStatusTone(status)} />
          <Badge label={isDelivery ? t('ord.type.delivery') : t('ord.type.collection')} />
        </View>
        <Text variant="bodySmall" tone="muted">
          {t('ord.detail.placed', { date: orderDate(o.created_at, tz), time: timeOfDay(o.created_at, tz) })}
        </Text>
        <ErrorLine message={error} />
        {actions.length ? <View style={posStyles.buttons}>{actions.map(actionButton)}</View> : null}

        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('ord.detail.items')}</Text>
            {goods.map((l) => (
              <AmountRow
                key={l.id}
                label={`${l.quantity} x ${l.name}${l.option_name ? `, ${l.option_name}` : ''}${l.refunded_quantity > 0 ? ` (${l.refunded_quantity} ${t('ord.flag.refunded').toLowerCase()})` : ''}`}
                amount={money(l.total_pence)}
              />
            ))}
            <AmountRow label={t('ord.detail.subtotal')} amount={money(o.subtotal_pence - o.delivery_pence)} muted />
            {isDelivery ? <AmountRow label={t('ord.detail.delivery')} amount={money(o.delivery_pence)} muted /> : null}
            <AmountRow label={t('ord.detail.total')} amount={money(o.total_pence)} strong />
            {data.settings.vat_registered && o.tax_pence > 0 ? (
              <Text variant="caption" tone="muted">
                {t('ord.detail.vat', { amount: money(o.tax_pence) })}
              </Text>
            ) : null}
          </View>
        </Card>

        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('ord.detail.fulfilment')}</Text>
            {isDelivery ? (
              <>
                <Text variant="bodyMedium">{t('ord.detail.deliverTo')}</Text>
                <Text variant="bodySmall">{address}</Text>
                {o.delivery_rate?.name ? (
                  <Text variant="bodySmall">{`${o.delivery_rate.name}${o.delivery_rate.estimate ? `: ${o.delivery_rate.estimate}` : ''}`}</Text>
                ) : null}
                {o.carrier ? (
                  <Text variant="bodySmall">
                    {o.tracking_number
                      ? t('ord.detail.tracking', { carrier: o.carrier, trackingNumber: o.tracking_number })
                      : t('ord.detail.trackingNone', { carrier: o.carrier })}
                  </Text>
                ) : null}
                {o.tracking_url ? (
                  <Button
                    label={t('ord.detail.track')}
                    size="sm"
                    variant="ghost"
                    onPress={() => void WebBrowser.openBrowserAsync(o.tracking_url!).catch(() => undefined)}
                  />
                ) : null}
              </>
            ) : (
              <>
                <Text variant="bodySmall">{t('ord.detail.collectFrom', { venue: data.venue.name })}</Text>
                {o.pickup_code ? (
                  <Text variant="subheading">{t('ord.detail.pickupCode', { pickupCode: formatPickupCode(o.pickup_code) ?? '' })}</Text>
                ) : null}
                {o.hold_until && status === 'ready' ? (
                  <Text variant="bodySmall">{t('sstatus.pickup.holdUntil', { date: orderDate(o.hold_until, tz) })}</Text>
                ) : null}
              </>
            )}
          </View>
        </Card>

        {data.returns.length ? (
          <Card>
            <View style={posStyles.stack}>
              <Text variant="label">{t('ord.detail.returns')}</Text>
              {data.returns.map((r) => {
                const names = r.lines
                  .map((rl) => {
                    const l = data.lines.find((x) => x.id === rl.line_id);
                    return l ? `${rl.quantity} x ${l.name}${l.option_name ? `, ${l.option_name}` : ''}` : null;
                  })
                  .filter(Boolean)
                  .join(', ');
                return (
                  <View key={r.id} style={styles.returnCard}>
                    <Text variant="bodyMedium">{t('ret.card.title', { date: orderDate(r.created_at, tz) })}</Text>
                    <Text variant="bodySmall">{names}</Text>
                    <Text variant="bodySmall" tone="muted">{`${r.reason}${r.note ? `. ${r.note}` : ''}`}</Text>
                    {r.goods_received_at ? <Text variant="bodySmall">{t('ret.receivedOn', { date: orderDate(r.goods_received_at, tz) })}</Text> : null}
                    {r.evidence_of_return_at ? (
                      <Text variant="bodySmall">{t('ret.evidenceOn', { date: orderDate(r.evidence_of_return_at, tz) })}</Text>
                    ) : null}
                    {r.refund_due_by && r.status !== 'refunded' ? (
                      <Text variant="bodyMedium" tone="danger">
                        {t('ret.dueBy', { date: orderDate(r.refund_due_by, tz) })}
                      </Text>
                    ) : null}
                    {r.status === 'refunded' ? <Badge label={t('ret.refunded')} tone="success" /> : null}
                    {r.status !== 'refunded' ? (
                      <View style={styles.chips}>
                        {!r.goods_received_at ? (
                          <Button label={t('ret.received')} size="sm" variant="secondary" onPress={() => void returnAction(r.id, 'received')} />
                        ) : null}
                        {!r.evidence_of_return_at && !r.goods_received_at ? (
                          <Button label={t('ret.evidence')} size="sm" variant="secondary" onPress={() => setEvidenceFor(r.id)} />
                        ) : null}
                        {data.can.refund ? (
                          <Button
                            label={t('ret.refund')}
                            size="sm"
                            onPress={() => {
                              setFromReturn(r.id);
                              setDialog('refund');
                            }}
                          />
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </Card>
        ) : null}

        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('ord.detail.payments')}</Text>
            {data.payments
              .filter((p) => p.status === 'succeeded')
              .map((p) => (
                <Text key={p.id} variant="bodySmall">
                  {t('ord.detail.paid', { amount: money(p.amount_pence), date: p.succeeded_at ? shortWhen(p.succeeded_at, tz) : '' })}
                </Text>
              ))}
            {data.refunds.map((r) => (
              <Text key={r.id} variant="bodySmall">
                {r.status === 'succeeded'
                  ? t('ord.detail.refund', { amount: money(r.amount_pence), date: shortWhen(r.succeeded_at ?? r.created_at, tz) })
                  : r.status === 'pending'
                    ? t('ord.detail.refundPending', { amount: money(r.amount_pence) })
                    : `${money(r.amount_pence)}: ${t('refund.status.failed')}`}
              </Text>
            ))}
          </View>
        </Card>

        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('ord.detail.customer')}</Text>
            <Text variant="bodyMedium">{o.contact_name ?? ''}</Text>
            {o.contact_email ? (
              <Button label={o.contact_email} size="sm" variant="ghost" onPress={() => void Linking.openURL(`mailto:${o.contact_email}`).catch(() => undefined)} />
            ) : null}
            {o.contact_phone ? (
              <Button label={o.contact_phone} size="sm" variant="ghost" onPress={() => void Linking.openURL(`tel:${o.contact_phone}`).catch(() => undefined)} />
            ) : null}
            <Text variant="caption" tone="muted">
              {o.marketing_consent ? t('ord.customer.marketing') : t('ord.customer.noMarketing')}
            </Text>
            {o.guest_id ? (
              <Button label={t('ord.customer.profile')} size="sm" variant="secondary" onPress={() => router.push(`/client/${o.guest_id}` as Href)} />
            ) : null}
          </View>
        </Card>

        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('ord.detail.messages')}</Text>
            {data.messages.length ? (
              data.messages.map((m, i) => (
                <Text key={`${m.message_type}-${i}`} variant="bodySmall">
                  {`${MESSAGE_TITLES[m.message_type] ?? m.message_type}: ${shortWhen(m.at, tz)} ${timeOfDay(m.at, tz)}${m.status === 'failed' ? ` (${t('refund.status.failed').toLowerCase()})` : ''}`}
                </Text>
              ))
            ) : (
              <Text variant="bodySmall" tone="muted">
                {t('ord.detail.noMessages')}
              </Text>
            )}
          </View>
        </Card>

        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('ord.detail.timeline')}</Text>
            {data.timeline.map((e, i) => (
              <View key={`${e.at}-${i}`}>
                <Text variant="caption" tone="muted">{`${shortWhen(e.at, tz)} ${timeOfDay(e.at, tz)}`}</Text>
                <Text variant="bodySmall">{timelineText(e, t, money)}</Text>
              </View>
            ))}
          </View>
        </Card>
      </ScrollView>

      <ConfirmSheet
        visible={dialog === 'ready'}
        title={t('ord.ready.confirm.title', { orderNo: o.number })}
        message={t('ord.ready.confirm.body', { customerName: customer })}
        confirmLabel={t('ord.action.ready')}
        cancelLabel={t('common.cancel')}
        destructive={false}
        loading={busy}
        onConfirm={() => {
          setDialog(null);
          void move('ready');
        }}
        onClose={() => setDialog(null)}
      />
      <ConfirmSheet
        visible={evidenceFor !== null}
        title={t('ret.evidence.title')}
        message={t('ret.evidence.body')}
        confirmLabel={t('ret.evidence')}
        cancelLabel={t('common.cancel')}
        destructive={false}
        onConfirm={() => {
          const id = evidenceFor;
          setEvidenceFor(null);
          if (id) void returnAction(id, 'evidence');
        }}
        onClose={() => setEvidenceFor(null)}
      />
      <PickupSheet
        visible={dialog === 'pickup'}
        initialCode={initialCode}
        customerName={customer}
        write={write.mutateAsync}
        onClose={() => setDialog(null)}
        onDone={() => {
          setDialog(null);
          moved('collected');
        }}
      />
      <DispatchSheet
        visible={dialog === 'dispatch' || dialog === 'tracking'}
        update={dialog === 'tracking'}
        customerName={customer}
        initial={{ carrier: o.carrier, tracking_number: o.tracking_number, tracking_url: o.tracking_url }}
        write={write.mutateAsync}
        onClose={() => setDialog(null)}
        onDone={() => {
          const wasUpdate = dialog === 'tracking';
          setDialog(null);
          if (!wasUpdate) moved('dispatched');
        }}
      />
      <CancelOrderSheet
        visible={dialog === 'cancel'}
        orderNo={o.number}
        amountPence={o.paid_pence - o.refunded_pence}
        write={write.mutateAsync}
        onClose={() => setDialog(null)}
        onDone={() => {
          setDialog(null);
          toast.success(t('ord.done.cancelled', { orderNo: o.number }));
        }}
      />
      <OrderRefundSheet
        visible={dialog === 'refund'}
        detail={data}
        returnRequest={data.returns.find((r) => r.id === fromReturn) ?? null}
        pastWindow={pastWindow}
        write={write.mutateAsync}
        onClose={() => setDialog(null)}
        onDone={(message) => {
          setDialog(null);
          toast.success(message);
        }}
      />
      <RecordReturnSheet visible={dialog === 'return'} detail={data} write={write.mutateAsync} onClose={() => setDialog(null)} onDone={() => setDialog(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  returnCard: { gap: spacing.xs },
});
