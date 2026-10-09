import { format, parseISO } from 'date-fns';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ReceiptSheet, RefundSheet, TipSplitSheet } from '@/components/pos/AfterSaleSheets';
import { OpenPayLinks, TipLinkSheet } from '@/components/pos/PayLinkExtras';
import { PaySheet } from '@/components/pos/PaySheet';
import { ReaderPayPanel } from '@/components/pos/ReaderPayPanel';
import { SavedCardDeclinedNotice } from '@/components/pos/SavedCards';
import {
  AddItemsSheet,
  ClientSheet,
  CombineSheet,
  DiscountSheet,
  LineEditorSheet,
  ParkSheet,
  ServingSheet,
  VoidSheet,
  writeError,
  type Send,
} from '@/components/pos/SaleSheets';
import { IssuedVouchers, VoucherLineSheet, voucherLineDetails } from '@/components/pos/VoucherSheets';
import { AmountRow, money, Notice, posStyles, usePosT } from '@/components/pos/parts';
import { saleHref, useOpenCheckout } from '@/components/pos/useOpenCheckout';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { getStripePublishableKey } from '@/lib/env';
import { isTerminalSdkAvailable } from '@/lib/payments/terminal-sdk';
import { posPaths } from '@/lib/pos/api';
import { declinedSavedCardPayment, pendingCollectPayment, pendingReaderPayment, tipLinkOffered } from '@/lib/pos/card-methods';
import { canPos, cardAppAvailable } from '@/lib/pos/pos-enabled';
import {
  maxRefundablePence,
  paymentMethodName,
  pendingCardPayment,
  saleIsEditable,
  saleStatusCopyId,
  totalsRows,
} from '@/lib/pos/sale-math';
import { isVoucherLine } from '@/lib/pos/voucher-math';
import { SaleStaleError, usePosBootstrap, usePosEnabled, usePosSale, useSaleWrite } from '@/lib/queries/usePos';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosSale, PosSaleLine } from '@/types/pos';

/**
 * One sale in the app (POS app step 1, UX spec §13.3 "The sale", "Completion and receipts", "A
 * completed sale", "Refunds"). Lines, items from the catalogue with who did them, custom items and
 * fees, price changes with a reason, discounts within the staff limit, the client, who is serving,
 * park and resume, combine, void, "Refund and cancel", payments (cash, other types, split, card),
 * completion with receipts, refunds and tip splits. Every action the login's capabilities do not
 * allow is hidden. Nothing here is reachable without the venue's `pos_enabled`.
 *
 * App step 2 (P7-8): a counter reader payment waiting on the sale is followed here, with cancel
 * and try again; a declined card on file says why and offers another way to pay; a sale sent to a
 * phone can be cancelled; open pay links show their QR code again or are cancelled; and a visit
 * paid in full offers a tip-only link (`done.tipLink`).
 */

type SheetKind =
  | 'add'
  | 'discount'
  | 'client'
  | 'serving'
  | 'park'
  | 'void'
  | 'combine'
  | 'pay'
  | 'refund'
  | 'refundCancel'
  | 'receipt'
  | 'tips'
  | 'tipLink';

function when(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  try {
    const d = parseISO(iso);
    return { date: format(d, 'd MMM yyyy'), time: format(d, 'HH:mm') };
  } catch {
    return { date: '', time: '' };
  }
}

export default function SaleScreen() {
  const t = usePosT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const saleId = typeof id === 'string' ? id : '';
  const posEnabled = usePosEnabled();
  const boot = usePosBootstrap();
  const saleQ = usePosSale(saleId);
  const write = useSaleWrite(saleId);
  const send: Send = (input) => write.mutateAsync(input);
  const me = useStaffMe();

  const header = (title: string) => <Stack.Screen options={{ headerShown: true, title }} />;

  if (!posEnabled) {
    return (
      <Screen>
        {header(t('till.title'))}
        <EmptyState title={t('till.off.title')} message={t('till.off.body', { venue: 'your venue' })} />
      </Screen>
    );
  }
  if (saleQ.isLoading || boot.isLoading) {
    return (
      <Screen padded={false}>
        {header(t('till.title'))}
        <DetailSkeleton />
      </Screen>
    );
  }
  if (saleQ.error instanceof ApiError && saleQ.error.status === 404) {
    return (
      <Screen>
        {header(t('till.title'))}
        <EmptyState title={t('sale.notFound.title')} message={t('sale.notFound.body')} />
      </Screen>
    );
  }
  if (!saleQ.data || !boot.data) {
    const err = saleQ.error ?? boot.error;
    return (
      <Screen>
        {header(t('till.title'))}
        <ErrorState
          title={t('till.error.title')}
          message={err instanceof ApiError ? err.message : t('till.error.body')}
          onRetry={() => {
            void saleQ.refetch();
            void boot.refetch();
          }}
        />
      </Screen>
    );
  }

  return (
    <SaleBody
      sale={saleQ.data}
      bootstrap={boot.data}
      send={send}
      refreshing={saleQ.isRefetching}
      onRefresh={() => void saleQ.refetch()}
      myCalendarIds={me.data?.staff?.linked_calendar_ids ?? []}
      header={header(t('sale.title', { saleNo: saleQ.data.number_label }))}
    />
  );
}

function SaleBody({
  sale,
  bootstrap,
  send,
  refreshing,
  onRefresh,
  myCalendarIds,
  header,
}: {
  sale: PosSale;
  bootstrap: NonNullable<ReturnType<typeof usePosBootstrap>['data']>;
  send: Send;
  refreshing: boolean;
  onRefresh: () => void;
  myCalendarIds: string[];
  header: ReactNode;
}) {
  const t = usePosT();
  const { colors } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const { open, openingKey } = useOpenCheckout();
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [line, setLine] = useState<PosSaleLine | null>(null);
  const [discountLineId, setDiscountLineId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [receiptNote, setReceiptNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const can = (c: Parameters<typeof canPos>[1]) => canPos(bootstrap, c);
  const isAdmin = bootstrap.role === 'admin';
  const editable = saleIsEditable(sale);
  const pendingCard = pendingCardPayment(sale);
  const readerPending = pendingReaderPayment(sale);
  const savedDeclined = declinedSavedCardPayment(sale);
  const collectPending = pendingCollectPayment(sale);
  const linesEditable = sale.status === 'open' && !pendingCard;
  const moneyPaid = sale.payments.some((p) => p.is_money && p.status === 'succeeded');
  const refundable = maxRefundablePence(sale.payments) > 0 || sale.payments.some((p) => p.refundable_tip_pence > 0);
  const vat = bootstrap.tax_settings?.vat_registered === true;
  const rows = useMemo(() => totalsRows(sale, { vatRegistered: vat }), [sale, vat]);
  const timeZone = bootstrap.venue?.timezone ?? 'Europe/London';
  const cardAvailable = cardAppAvailable({
    bootstrap,
    terminalAvailable: isTerminalSdkAvailable(),
    publishableKey: Boolean(getStripePublishableKey()),
  });

  async function act(label: string, input: Parameters<Send>[0], success?: string) {
    setBusy(label);
    setNotice(null);
    try {
      await send(input);
      if (success) toast.success(success);
    } catch (e) {
      if (e instanceof SaleStaleError) setNotice(t('stale.notice'));
      else toast.error(writeError(e, t));
    } finally {
      setBusy(null);
    }
  }

  const closeSheet = () => setSheet(null);
  const statusLabel = t(saleStatusCopyId(sale));
  const completed = sale.status === 'completed';
  const voided = sale.status === 'voided';
  const lastChange = [...sale.payments].reverse().find((p) => p.method === 'cash' && (p.change_given_pence ?? 0) > 0);
  const paidMethods = [...new Set(sale.payments.filter((p) => p.status === 'succeeded').map(paymentMethodName))];

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.badges}>
          <Badge
            label={statusLabel}
            tone={completed ? 'success' : sale.status === 'part_paid' ? 'warning' : voided ? 'neutral' : 'brand'}
          />
          {sale.refund_status === 'partial' ? <Badge label={t('sale.refund.partial')} /> : null}
          {sale.refund_status === 'full' ? <Badge label={t('sale.refund.full')} /> : null}
        </View>

        {notice ? <Notice tone="warning">{notice}</Notice> : null}

        {sale.parked && editable ? (
          <Notice
            action={{
              label: t('park.resume'),
              loading: busy === 'resume',
              onPress: () => void act('resume', { action: 'resume', body: { version: sale.version } }),
            }}>
            {t('park.banner', {
              staffName: sale.operator.name ?? sale.created_by_name ?? 'your team',
              device: sale.parked.device ?? 'a device',
              time: when(sale.parked.at).time,
              note: sale.parked.note ?? '',
            }).trim()}
          </Notice>
        ) : null}

        {readerPending && can('take_payment') ? (
          <Card>
            <ReaderPayPanel
              key={readerPending.id}
              sale={sale}
              bootstrap={bootstrap}
              send={send}
              amountPence={readerPending.amount_pence}
              pendingPaymentId={readerPending.id}
              onPaid={() => setReceiptNote(null)}
              onBack={() => undefined}
            />
          </Card>
        ) : savedDeclined ? (
          <SavedCardDeclinedNotice sale={sale} payment={savedDeclined} send={send} canTakePayment={can('take_payment')} />
        ) : collectPending ? (
          <Notice
            tone="warning"
            action={
              can('take_payment')
                ? {
                    label: t('app.sale.cancelCard'),
                    loading: busy === 'cancelCard',
                    onPress: () =>
                      void act('cancelCard', {
                        action: 'cancel',
                        path: posPaths.collectCancel(collectPending.id),
                        money: true,
                        body: {},
                      }),
                  }
                : undefined
            }>
            {t('app.sale.cardWaiting')}
          </Notice>
        ) : pendingCard ? (
          <Notice
            tone="warning"
            action={
              can('take_payment')
                ? {
                    label: t('app.sale.cancelCard'),
                    loading: busy === 'cancelCard',
                    onPress: () =>
                      void act('cancelCard', {
                        action: 'cancel',
                        path: posPaths.cancelPayment(sale.id, pendingCard.id),
                        money: true,
                        body: {},
                      }),
                  }
                : undefined
            }>
            {t('app.sale.cardWaiting')}
          </Notice>
        ) : null}

        {voided ? (
          <Text variant="bodySmall" tone="muted">
            {t('sale.voidedLine', {
              ...when(sale.voided_at),
              staffName: sale.created_by_name ?? 'your team',
              reason: sale.void_reason ?? '',
            })}
          </Text>
        ) : null}

        {/* The client and who is serving. */}
        <View style={styles.people}>
          <Pressable
            disabled={!editable}
            onPress={() => setSheet('client')}
            accessibilityRole="button"
            style={[styles.personChip, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text variant="caption" tone="muted">
              {t('app.sale.client')}
            </Text>
            <Text variant="label">{sale.guest?.name || (editable ? t('client.add') : t('sales.walkIn'))}</Text>
          </Pressable>
          <Pressable
            disabled={!editable}
            onPress={() => setSheet('serving')}
            accessibilityRole="button"
            style={[styles.personChip, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text variant="caption" tone="muted">
              {t('app.sale.serving')}
            </Text>
            <Text variant="label">{sale.operator.name ?? 'Not set'}</Text>
          </Pressable>
        </View>

        {/* Lines. */}
        <Card>
          <View style={posStyles.stack}>
            {sale.lines.length === 0 ? (
              <Text tone="muted">{t('app.sale.lines.empty')}</Text>
            ) : (
              sale.lines.map((l) => (
                <LineRow
                  key={l.id}
                  line={l}
                  timeZone={timeZone}
                  onPress={
                    // A gift voucher line opens its sell form while it can change, else what it says.
                    isVoucherLine(l) || linesEditable || can('edit_credit') ? () => setLine(l) : undefined
                  }
                />
              ))
            )}
            {sale.discounts.map((d) => (
              <View key={d.id} style={posStyles.row}>
                <Text variant="bodySmall" style={styles.flex}>
                  {d.reason ? `${t('totals.discounts')}: ${d.reason}` : t('totals.discounts')}
                </Text>
                <Text variant="bodySmall">-{money(d.applied_pence)}</Text>
                {linesEditable && can('apply_discount') ? (
                  <Button
                    label={t('disc.remove')}
                    size="sm"
                    variant="ghost"
                    loading={busy === `disc-${d.id}`}
                    onPress={() =>
                      void act(`disc-${d.id}`, {
                        action: 'discount',
                        method: 'DELETE',
                        path: posPaths.discount(sale.id, d.id, sale.version),
                      })
                    }
                  />
                ) : null}
              </View>
            ))}
            {linesEditable ? (
              <View style={posStyles.buttons}>
                <Button label={t('add.open')} variant="secondary" onPress={() => setSheet('add')} fullWidth />
                {can('apply_discount') && sale.lines.length > 0 ? (
                  <Button
                    label={t('sale.discount')}
                    variant="ghost"
                    onPress={() => {
                      setDiscountLineId(null);
                      setSheet('discount');
                    }}
                    fullWidth
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        </Card>

        {/* Totals. */}
        <Card>
          <View style={styles.totals}>
            {rows.map((r) => (
              <AmountRow
                key={r.id}
                label={r.id === 'totals.vatIncluded' ? t('totals.vatIncluded', { amount: money(r.amountPence) }) : t(r.id)}
                amount={r.id === 'totals.vatIncluded' ? '' : r.amountPence < 0 ? `-${money(-r.amountPence)}` : money(r.amountPence)}
                strong={r.tone === 'strong' || r.tone === 'balance'}
                muted={r.tone === 'muted' || r.tone === 'note'}
              />
            ))}
            {sale.tip_pence > 0 ? (
              <>
                <AmountRow label={t('totals.tips')} amount={money(sale.tip_pence)} muted />
                <Text variant="caption" tone="muted">
                  {t('totals.tips.note')}
                </Text>
              </>
            ) : null}
          </View>
        </Card>

        {/* Payments. */}
        {sale.payments.length ? (
          <Card>
            <View style={posStyles.stack}>
              <Text variant="label">{t('pay.list')}</Text>
              {sale.payments.map((p) => (
                <View key={p.id} style={posStyles.row}>
                  <Text variant="bodySmall" style={styles.flex}>
                    {paymentMethodName(p)}
                    {p.tip_pence > 0 ? ` (${t('tip.label').toLowerCase()} ${money(p.tip_pence)})` : ''}
                  </Text>
                  <Text variant="bodySmall" tone={p.status === 'succeeded' ? 'default' : 'muted'}>
                    {money(p.amount_pence)} ·{' '}
                    {p.status === 'pending'
                      ? t('pay.status.pending')
                      : p.status === 'failed'
                        ? t('pay.status.failed')
                        : p.status === 'cancelled'
                          ? t('pay.status.cancelled')
                          : t('pay.status.succeeded')}
                  </Text>
                </View>
              ))}
              {sale.refunds.map((r) => (
                <AmountRow
                  key={r.id}
                  label={`${r.source === 'stripe_dashboard' ? t('refund.external') : t('sale.done.refund')}: ${r.reason}`}
                  amount={`-${money(r.amount_pence + r.tip_pence)} · ${
                    r.status === 'pending' ? t('refund.status.pending') : r.status === 'failed' ? t('refund.status.failed') : t('refund.status.succeeded')
                  }`}
                  muted
                />
              ))}
            </View>
          </Card>
        ) : null}

        <OpenPayLinks sale={sale} bootstrap={bootstrap} send={send} canTakePayment={can('take_payment')} />

        {/* Completed: what happened, and the money after it. */}
        {completed ? (
          <Card>
            <View style={posStyles.stack}>
              <Text variant="heading">{sale.total_pence === 0 ? t('done.titleZero') : t('done.title')}</Text>
              {paidMethods.length ? (
                <Text variant="bodySmall">
                  {t('done.summary', { total: money(sale.total_pence), methods: paidMethods.join(', ') })}
                </Text>
              ) : null}
              {sale.completed_at ? (
                <Text variant="caption" tone="muted">
                  {t('sale.completedLine', {
                    ...when(sale.completed_at),
                    staffName: sale.operator.name ?? sale.created_by_name ?? 'your team',
                  })}
                </Text>
              ) : null}
              {lastChange ? (
                <Text variant="bodyMedium">{t('done.change', { amount: money(lastChange.change_given_pence ?? 0) })}</Text>
              ) : null}
              {sale.tip_pence > 0 && sale.tips.length ? (
                <Text variant="bodySmall">
                  {t('done.tip', { amount: money(sale.tip_pence), allocation: sale.tips.map((s) => s.name).join(', ') })}
                </Text>
              ) : null}
              <IssuedVouchers sale={sale} timeZone={timeZone} canPdf={can('create_sale') || can('manage_vouchers')} />
              <Text variant="caption" tone="muted">
                {receiptNote ?? t('app.receipt.notSent.pos')}
              </Text>
            </View>
          </Card>
        ) : null}

        {/* Actions. */}
        <View style={posStyles.buttons}>
          {editable && sale.balance_due_pence > 0 && !pendingCard && can('take_payment') ? (
            <Button
              label={`${t('sale.pay.open')}: ${t('sale.bar.balance', { balance: money(sale.balance_due_pence) })}`}
              onPress={() => setSheet('pay')}
              fullWidth
            />
          ) : null}
          {editable && sale.balance_due_pence <= 0 && !pendingCard && sale.lines.length > 0 && can('take_payment') ? (
            <>
              <Text variant="caption" tone="muted">
                {t('pay.finish.help')}
              </Text>
              <Button
                label={t('pay.finish')}
                loading={busy === 'complete'}
                onPress={() => void act('complete', { action: 'complete', money: true, body: { version: sale.version } })}
                fullWidth
              />
            </>
          ) : null}
          {!editable && !voided && can('take_payment') && (moneyPaid || completed) ? (
            <Button label={t('sale.done.receipt')} variant="secondary" onPress={() => setSheet('receipt')} fullWidth />
          ) : null}
          {refundable && can('refund') && !pendingCard ? (
            <Button label={t('sale.done.refund')} variant="secondary" onPress={() => setSheet('refund')} fullWidth />
          ) : null}
          {tipLinkOffered(sale, bootstrap) ? (
            <Button label={t('done.tipLink')} variant="secondary" onPress={() => setSheet('tipLink')} fullWidth />
          ) : null}
          {completed && sale.tip_pence > 0 && can('edit_tips') ? (
            <Button label={t('done.tips.change')} variant="ghost" onPress={() => setSheet('tips')} fullWidth />
          ) : null}
          {editable && can('park_sale') && !sale.parked && !pendingCard ? (
            <Button label={sale.status === 'part_paid' ? t('part.park') : t('sale.park')} variant="ghost" onPress={() => setSheet('park')} fullWidth />
          ) : null}
          {sale.status === 'open' && !moneyPaid && !pendingCard && can('create_sale') ? (
            <Button label={t('attach.combine')} variant="ghost" onPress={() => setSheet('combine')} fullWidth />
          ) : null}
          {sale.status === 'open' && !moneyPaid && !pendingCard && can('void_open_sale') ? (
            <Button label={t('sale.void')} variant="ghost" onPress={() => setSheet('void')} fullWidth />
          ) : null}
          {editable && moneyPaid && refundable && !pendingCard && can('void_open_sale') && can('refund') ? (
            <Button label={t('sale.refundAndVoid')} variant="ghost" onPress={() => setSheet('refundCancel')} fullWidth />
          ) : null}
          {(completed || voided) && can('create_sale') ? (
            <Button
              label={t('done.newSale')}
              variant="ghost"
              loading={openingKey === 'blank'}
              onPress={() => void open('blank', { replace: true })}
              fullWidth
            />
          ) : null}
        </View>
      </ScrollView>

      <AddItemsSheet
        visible={sheet === 'add'}
        onClose={closeSheet}
        sale={sale}
        bootstrap={bootstrap}
        send={send}
        myCalendarIds={myCalendarIds}
      />
      <DiscountSheet
        visible={sheet === 'discount'}
        onClose={closeSheet}
        sale={sale}
        bootstrap={bootstrap}
        send={send}
        lineId={discountLineId}
      />
      <ClientSheet visible={sheet === 'client'} onClose={closeSheet} sale={sale} send={send} />
      <ServingSheet visible={sheet === 'serving'} onClose={closeSheet} sale={sale} bootstrap={bootstrap} send={send} />
      <ParkSheet
        visible={sheet === 'park'}
        onClose={closeSheet}
        sale={sale}
        send={send}
        onParked={() => {
          closeSheet();
          toast.success(t('park.done', { saleNo: sale.number_label }));
          router.back();
        }}
      />
      <VoidSheet visible={sheet === 'void'} onClose={closeSheet} sale={sale} bootstrap={bootstrap} send={send} />
      <CombineSheet
        visible={sheet === 'combine'}
        onClose={closeSheet}
        sale={sale}
        send={send}
        onCombined={(survivor) => {
          closeSheet();
          if (survivor !== sale.id) router.replace(saleHref(survivor));
        }}
      />
      <PaySheet
        visible={sheet === 'pay'}
        onClose={closeSheet}
        sale={sale}
        bootstrap={bootstrap}
        send={send}
        cardAvailable={cardAvailable}
        isAdmin={isAdmin}
        onPaid={() => setReceiptNote(null)}
        onPark={can('park_sale') && !sale.parked ? () => setSheet('park') : undefined}
      />
      {sheet === 'tipLink' ? <TipLinkSheet visible onClose={closeSheet} sale={sale} /> : null}
      <RefundSheet
        visible={sheet === 'refund' || sheet === 'refundCancel'}
        onClose={closeSheet}
        sale={sale}
        bootstrap={bootstrap}
        send={send}
        cancelSale={sheet === 'refundCancel'}
        onRefunded={(message) => toast.success(message)}
      />
      <ReceiptSheet
        visible={sheet === 'receipt'}
        onClose={closeSheet}
        sale={sale}
        send={send}
        onSent={(message) => {
          setReceiptNote(message);
          toast.success(message);
        }}
      />
      <TipSplitSheet visible={sheet === 'tips'} onClose={closeSheet} sale={sale} send={send} />
      {line && isVoucherLine(line) ? (
        <VoucherLineSheet
          key={line.id}
          line={line}
          sale={sale}
          send={send}
          editable={linesEditable}
          timeZone={timeZone}
          onClose={() => setLine(null)}
        />
      ) : null}
      <LineEditorSheet
        line={line && !isVoucherLine(line) ? line : null}
        onClose={() => setLine(null)}
        sale={sale}
        bootstrap={bootstrap}
        send={send}
        editable={linesEditable}
      />
    </Screen>
  );
}

function LineRow({ line, timeZone, onPress }: { line: PosSaleLine; timeZone: string; onPress?: () => void }) {
  const t = usePosT();
  const changed = line.unit_price_pence !== line.list_unit_price_pence && line.list_unit_price_pence > 0;
  const who = line.performer?.name ?? line.seller?.name;
  const voucher = isVoucherLine(line);
  const content = (
    <View style={styles.line}>
      <View style={styles.flex}>
        <Text variant="bodyMedium">
          {line.quantity > 1 ? `${t('line.qtyPrefix', { count: line.quantity })} ` : ''}
          {voucher ? t('line.voucher', { amount: money(line.unit_price_pence) }) : line.name}
        </Text>
        <Text variant="caption" tone="muted">
          {voucher
            ? voucherLineDetails(line, t, timeZone).join(' · ')
            : [line.option_name, who, line.booking ? line.booking.booking_time : null].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.badges}>
          {line.line_type === 'custom' ? <Badge label={t('line.chip.custom')} /> : null}
          {line.line_type === 'fee' ? <Badge label={t('line.chip.fee')} /> : null}
          {line.walkin_booking && who ? <Badge label={t('line.chip.walkIn', { staffName: who })} /> : null}
          {changed ? <Badge label={t('line.chip.priceChanged', { listPrice: money(line.list_unit_price_pence) })} tone="warning" /> : null}
          {line.line_discount_pence > 0 ? <Badge label={t('line.chip.discount', { amount: money(line.line_discount_pence) })} /> : null}
          {line.paid_by_credit ? <Badge label={t('line.chip.paid')} tone="success" /> : null}
        </View>
      </View>
      <Text variant="bodyMedium">{money(line.total_pence)}</Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={line.name} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  people: { flexDirection: 'row', gap: spacing.sm },
  personChip: { flex: 1, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xxs },
  totals: { gap: spacing.xs },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
});
