import { useRef, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { ChoiceChips, ErrorLine, money, Notice, posStyles, PosSheet, usePosT } from '@/components/pos/parts';
import { CameraScanner, cameraScanAvailable, ScanButton } from '@/components/retail/CameraScanner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { hapticSuccess } from '@/lib/haptics';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { posErrorMessage } from '@/lib/pos/api';
import { PICKUP_BARCODE_TYPES } from '@/lib/retail/scan';
import { CARRIERS, lineRefundPence, normalisePickupCode, suggestedTrackingUrl } from '@/lib/shop/order-words';
import type { OrderWrite } from '@/lib/queries/useOrders';
import { spacing } from '@/theme/index';
import type { ShopOrderDetail, ShopOrderLine, ShopOrderReturn } from '@/types/shop';

/**
 * The order's sheets in the app (POS app step 5, plan P7-16; UX spec §8.4 to §8.7, §13.7), as the
 * web's `OrderDetailView` dialogs: checking the pickup code (typed, or scanned from the customer's
 * QR code), dispatching with tracking, cancel and refund, refund or return, and recording a return.
 */

type Write = (input: OrderWrite) => Promise<unknown>;

// ─── Checking the pickup code (§8.4) ────────────────────────────────────────

export function PickupSheet({
  visible,
  initialCode,
  customerName,
  write,
  onClose,
  onDone,
}: {
  visible: boolean;
  initialCode?: string | null;
  customerName: string;
  write: Write;
  onClose: () => void;
  onDone: () => void;
}) {
  return visible ? (
    <PickupBody initialCode={initialCode ?? ''} customerName={customerName} write={write} onClose={onClose} onDone={onDone} />
  ) : null;
}

function PickupBody({
  initialCode,
  customerName,
  write,
  onClose,
  onDone,
}: {
  initialCode: string;
  customerName: string;
  write: Write;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = usePosT();
  const [code, setCode] = useState(initialCode);
  const [noCode, setNoCode] = useState(false);
  const [checked, setChecked] = useState(false);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = noCode ? checked : normalisePickupCode(code).length === 6;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await write({
        kind: 'status',
        body: noCode ? { status: 'collected', pickup_code: null, without_code: true } : { status: 'collected', pickup_code: normalisePickupCode(code), without_code: false },
      });
      hapticSuccess();
      onDone();
    } catch (e) {
      setError(posErrorMessage(e, t('ord.error')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={t('pickup.title')}
      subtitle={noCode ? t('pickup.noCode.body', { customerName }) : t('pickup.body')}
      footer={
        <View style={posStyles.buttons}>
          <Button
            label={noCode ? t('pickup.confirmWithout') : t('pickup.confirm')}
            loading={busy}
            disabled={!ready || busy}
            onPress={() => void submit()}
            fullWidth
          />
          <Button label={noCode ? t('pickup.code') : t('pickup.noCode')} variant="ghost" onPress={() => setNoCode((v) => !v)} fullWidth />
        </View>
      }>
      {noCode ? (
        <View style={posStyles.row}>
          <Switch value={checked} onValueChange={setChecked} accessibilityLabel={t('pickup.noCode.checked')} />
          <Text variant="bodyMedium" style={styles.flex}>
            {t('pickup.noCode.checked')}
          </Text>
        </View>
      ) : (
        <>
          <Input
            label={t('pickup.code')}
            accessibilityLabel={t('pickup.code')}
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            maxLength={12}
            rightSlot={cameraScanAvailable ? <ScanButton label={t('app.scan.pickup')} onPress={() => setCamera(true)} /> : undefined}
          />
          <CameraScanner
            visible={camera}
            title={t('app.scan.pickup')}
            barcodeTypes={PICKUP_BARCODE_TYPES}
            onClose={() => setCamera(false)}
            onScan={(scanned) => setCode(normalisePickupCode(scanned))}
          />
        </>
      )}
      <ErrorLine message={error} />
    </PosSheet>
  );
}

// ─── Dispatching with tracking (§8.5) ───────────────────────────────────────

export function DispatchSheet({
  visible,
  update,
  customerName,
  initial,
  write,
  onClose,
  onDone,
}: {
  visible: boolean;
  update: boolean;
  customerName: string;
  initial: { carrier: string | null; tracking_number: string | null; tracking_url: string | null };
  write: Write;
  onClose: () => void;
  onDone: () => void;
}) {
  return visible ? (
    <DispatchBody update={update} customerName={customerName} initial={initial} write={write} onClose={onClose} onDone={onDone} />
  ) : null;
}

function DispatchBody({
  update,
  customerName,
  initial,
  write,
  onClose,
  onDone,
}: {
  update: boolean;
  customerName: string;
  initial: { carrier: string | null; tracking_number: string | null; tracking_url: string | null };
  write: Write;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = usePosT();
  const known = CARRIERS.find((c) => c.id === initial.carrier && c.id !== 'other');
  const [carrier, setCarrier] = useState(known?.id ?? (initial.carrier ? 'other' : 'Royal Mail'));
  const [otherName, setOtherName] = useState(known ? '' : (initial.carrier ?? ''));
  const [number, setNumber] = useState(initial.tracking_number ?? '');
  const [url, setUrl] = useState(initial.tracking_url ?? '');
  const [urlEdited, setUrlEdited] = useState(Boolean(initial.tracking_url));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finalUrl = urlEdited ? url.trim() : suggestedTrackingUrl(carrier, number);

  async function submit() {
    if (finalUrl && !/^https:\/\//i.test(finalUrl)) {
      setError(t('dispatch.url.invalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await write({
        kind: 'status',
        body: {
          status: 'dispatched',
          carrier: carrier === 'other' ? otherName.trim() || null : carrier,
          tracking_number: number.trim() || null,
          tracking_url: finalUrl || null,
          tracking_only: update,
        },
      });
      hapticSuccess();
      onDone();
    } catch (e) {
      setError(posErrorMessage(e, t('ord.error')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={t('dispatch.title')}
      footer={<Button label={update ? t('dispatch.update') : t('dispatch.confirm')} loading={busy} disabled={busy} onPress={() => void submit()} fullWidth />}>
      <Text variant="label">{t('dispatch.carrier')}</Text>
      <ChoiceChips options={CARRIERS.map((c) => ({ value: c.id, label: t(c.label) }))} value={carrier} onChange={setCarrier} />
      {carrier === 'other' ? (
        <Input label={t('dispatch.carrier.otherName')} accessibilityLabel={t('dispatch.carrier.otherName')} value={otherName} onChangeText={setOtherName} maxLength={60} />
      ) : null}
      <Input
        label={t('dispatch.tracking')}
        accessibilityLabel={t('dispatch.tracking')}
        value={number}
        onChangeText={setNumber}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={80}
      />
      <Input
        label={t('dispatch.url')}
        accessibilityLabel={t('dispatch.url')}
        value={urlEdited ? url : finalUrl}
        onChangeText={(v) => {
          setUrlEdited(true);
          setUrl(v);
        }}
        placeholder="https://"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      {!update ? (
        <Text variant="bodySmall" tone="muted">
          {number.trim() ? t('dispatch.note', { customerName }) : t('dispatch.noTracking', { customerName })}
        </Text>
      ) : null}
      <ErrorLine message={error} />
    </PosSheet>
  );
}

// ─── Cancel and refund (§8.7) ───────────────────────────────────────────────

const CANCEL_REASONS = ['stock', 'customer', 'notCollected', 'other'] as const;

export function CancelOrderSheet({
  visible,
  orderNo,
  amountPence,
  write,
  onClose,
  onDone,
}: {
  visible: boolean;
  orderNo: number;
  amountPence: number;
  write: Write;
  onClose: () => void;
  onDone: () => void;
}) {
  return visible ? <CancelBody orderNo={orderNo} amountPence={amountPence} write={write} onClose={onClose} onDone={onDone} /> : null;
}

function CancelBody({
  orderNo,
  amountPence,
  write,
  onClose,
  onDone,
}: {
  orderNo: number;
  amountPence: number;
  write: Write;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = usePosT();
  const requestId = useRef(newPaymentAttemptId());
  const [reason, setReason] = useState<(typeof CANCEL_REASONS)[number]>('stock');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await write({ kind: 'cancel', body: { client_request_id: requestId.current, reason } });
      hapticSuccess();
      onDone();
    } catch (e) {
      setError(posErrorMessage(e, t('ord.error')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={t('ord.cancel.title', { orderNo, amount: money(amountPence) })}
      subtitle={t('ord.cancel.body')}
      footer={
        <View style={posStyles.buttons}>
          <Button label={t('ord.cancel.confirm')} variant="danger" loading={busy} disabled={busy} onPress={() => void submit()} fullWidth />
          <Button label={t('ord.cancel.keep')} variant="secondary" disabled={busy} onPress={onClose} fullWidth />
        </View>
      }>
      <Text variant="label">{t('ord.cancel.reason')}</Text>
      <ChoiceChips
        options={CANCEL_REASONS.map((r) => ({ value: r, label: t(`ord.cancel.reason.${r}`) }))}
        value={reason}
        onChange={setReason}
      />
      <ErrorLine message={error} />
    </PosSheet>
  );
}

// ─── Refund or return (§8.7) ────────────────────────────────────────────────

/**
 * "Refund or return": chosen items (and the delivery) back to the card they paid with, the counted
 * ones put back in stock when ticked, a reason and a note; from a recorded return, its lines are
 * chosen and the return is marked refunded. After the return window it warns (faulty goods only).
 */
export function OrderRefundSheet({
  visible,
  detail,
  returnRequest,
  pastWindow,
  write,
  onClose,
  onDone,
}: {
  visible: boolean;
  detail: ShopOrderDetail;
  returnRequest: ShopOrderReturn | null;
  pastWindow: string | null;
  write: Write;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return visible ? (
    <RefundBody detail={detail} returnRequest={returnRequest} pastWindow={pastWindow} write={write} onClose={onClose} onDone={onDone} />
  ) : null;
}

function RefundBody({
  detail,
  returnRequest,
  pastWindow,
  write,
  onClose,
  onDone,
}: {
  detail: ShopOrderDetail;
  returnRequest: ShopOrderReturn | null;
  pastWindow: string | null;
  write: Write;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = usePosT();
  const requestId = useRef(newPaymentAttemptId());
  const lines = detail.lines.filter((l) => l.line_type === 'product' || l.line_type === 'delivery');
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries((returnRequest?.lines ?? []).map((l) => [l.line_id, l.quantity])),
  );
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const reasons = detail.settings.refund_reasons.length ? detail.settings.refund_reasons : ['Product returned'];
  const [reason, setReason] = useState(reasons[0]!);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = lines.filter((l) => (qty[l.id] ?? 0) > 0);
  const amount = chosen.reduce((s, l) => s + lineRefundPence(l, qty[l.id] ?? 0), 0);
  const customer = detail.order.contact_name ?? 'the customer';

  async function submit() {
    if (!chosen.length) {
      setError(t('refund.nothing'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await write({
        kind: 'refund',
        body: {
          client_request_id: requestId.current,
          lines: chosen.map((l) => ({ line_id: l.id, quantity: qty[l.id] ?? 0, restock: restock[l.id] === true })),
          reason,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(returnRequest ? { return_request_id: returnRequest.id } : {}),
        },
      });
      hapticSuccess();
      onDone(t('refund.sentCard', { clientName: customer }));
    } catch (e) {
      setError(posErrorMessage(e, t('ord.error')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={t('ord.refund.title', { orderNo: detail.order.number })}
      footer={
        <View style={posStyles.buttons}>
          {amount > 0 ? (
            <Text variant="bodySmall">{t('refund.summary', { amount: money(amount), destination: t('refund.dest.card') })}</Text>
          ) : null}
          <Button label={t('refund.confirm', { amount: money(amount) })} variant="danger" loading={busy} disabled={amount <= 0 || busy} onPress={() => void submit()} fullWidth />
        </View>
      }>
      {pastWindow ? (
        <Notice tone="warning">{`${t('refund.windowClosed', { date: pastWindow })} ${t('refund.faultyWarning')}`}</Notice>
      ) : null}
      <Text variant="label">{t('refund.what')}</Text>
      {lines.map((l) => (
        <RefundLine
          key={l.id}
          line={l}
          qty={qty[l.id] ?? 0}
          onQty={(n) => setQty((cur) => ({ ...cur, [l.id]: n }))}
          restock={restock[l.id] === true}
          onRestock={l.line_type === 'product' && l.track_stock ? (v) => setRestock((cur) => ({ ...cur, [l.id]: v })) : null}
        />
      ))}
      <Text variant="label">{t('refund.reason')}</Text>
      <ChoiceChips options={reasons.map((r) => ({ value: r, label: r }))} value={reason} onChange={setReason} />
      <Input label={t('refund.note')} accessibilityLabel={t('refund.note')} value={note} onChangeText={setNote} maxLength={500} />
      <ErrorLine message={error} />
    </PosSheet>
  );
}

function RefundLine({
  line,
  qty,
  onQty,
  restock,
  onRestock,
}: {
  line: ShopOrderLine;
  qty: number;
  onQty: (n: number) => void;
  restock: boolean;
  onRestock: ((v: boolean) => void) | null;
}) {
  const t = usePosT();
  const left = line.quantity - line.refunded_quantity;
  if (left <= 0) return null;
  const name = `${line.name}${line.option_name ? `, ${line.option_name}` : ''}`;
  return (
    <View style={styles.line}>
      <Stepper
        label={`${name} (${money(line.total_pence - line.refunded_pence)})`}
        value={String(qty)}
        onDecrement={() => onQty(Math.max(0, qty - 1))}
        onIncrement={() => onQty(Math.min(left, qty + 1))}
      />
      {onRestock && qty > 0 ? (
        <View style={posStyles.row}>
          <Switch value={restock} onValueChange={onRestock} accessibilityLabel={t('refund.restock')} />
          <View style={styles.flex}>
            <Text variant="bodySmall">{t('refund.restock')}</Text>
            <Text variant="caption" tone="muted">
              {t('refund.restock.help')}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ─── Recording a return (§8.7 `ret.record`) ─────────────────────────────────

const RETURN_REASONS = ['changedMind', 'faulty', 'wrong', 'other'] as const;

export function RecordReturnSheet({
  visible,
  detail,
  write,
  onClose,
  onDone,
}: {
  visible: boolean;
  detail: ShopOrderDetail;
  write: Write;
  onClose: () => void;
  onDone: () => void;
}) {
  return visible ? <ReturnBody detail={detail} write={write} onClose={onClose} onDone={onDone} /> : null;
}

function ReturnBody({ detail, write, onClose, onDone }: { detail: ShopOrderDetail; write: Write; onClose: () => void; onDone: () => void }) {
  const t = usePosT();
  const requestId = useRef(newPaymentAttemptId());
  const goods = detail.lines.filter((l) => l.line_type === 'product');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<(typeof RETURN_REASONS)[number]>('changedMind');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = goods.filter((l) => (qty[l.id] ?? 0) > 0);

  async function submit() {
    if (!chosen.length) {
      setError(t('refund.nothing'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await write({
        kind: 'returns',
        body: {
          client_request_id: requestId.current,
          lines: chosen.map((l) => ({ line_id: l.id, quantity: qty[l.id] ?? 0 })),
          reason: t(`ret.record.reason.${reason}`),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      hapticSuccess();
      onDone();
    } catch (e) {
      setError(posErrorMessage(e, t('ord.error')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={t('ret.record.title', { orderNo: detail.order.number })}
      subtitle={t('ret.record.body')}
      footer={<Button label={t('ret.record.confirm')} loading={busy} disabled={busy} onPress={() => void submit()} fullWidth />}>
      {goods.map((l) => {
        const left = l.quantity - l.refunded_quantity;
        if (left <= 0) return null;
        const name = `${l.name}${l.option_name ? `, ${l.option_name}` : ''}`;
        const n = qty[l.id] ?? 0;
        return (
          <Stepper
            key={l.id}
            label={name}
            value={String(n)}
            onDecrement={() => setQty((cur) => ({ ...cur, [l.id]: Math.max(0, n - 1) }))}
            onIncrement={() => setQty((cur) => ({ ...cur, [l.id]: Math.min(left, n + 1) }))}
          />
        );
      })}
      <Text variant="label">{t('ret.record.reason')}</Text>
      <ChoiceChips
        options={RETURN_REASONS.map((r) => ({ value: r, label: t(`ret.record.reason.${r}`) }))}
        value={reason}
        onChange={setReason}
      />
      <Input label={t('ret.record.note')} accessibilityLabel={t('ret.record.note')} value={note} onChangeText={setNote} maxLength={1000} />
      <ErrorLine message={error} />
    </PosSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  line: { gap: spacing.sm },
});
