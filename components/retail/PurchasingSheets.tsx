import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips, ErrorLine, Notice, PickRow, PosSheet, posStyles, usePosT } from '@/components/pos/parts';
import { CameraScanner, ScanButton, type ScanMessage } from '@/components/retail/CameraScanner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { SearchBar } from '@/components/ui/SearchBar';
import { Text } from '@/components/ui/Text';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { posErrorMessage, posFetch, retailPaths } from '@/lib/pos/api';
import { penceToInput } from '@/lib/pos/sale-math';
import {
  overBy,
  pickerLabel,
  receiveBody,
  receiveLineForCode,
  stillToCome,
  type ExtraDraft,
} from '@/lib/retail/purchasing';
import { sameBarcode } from '@/lib/retail/scan';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useBookingsList } from '@/lib/queries/useBookingsList';
import {
  useCreatePurchaseOrder,
  useReceivePurchaseOrder,
  useRecordUse,
  useSuppliers,
  useVariantPicker,
} from '@/lib/queries/usePurchasing';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import type { PickerVariant, PurchaseOrderDetail } from '@/types/retail';

/**
 * Purchase orders, deliveries and "Use stock" in the app (POS app step 4b, plan P7-15; UX spec
 * §6.12 to §6.14, §13.6), as the web's `PurchaseOrdersTab`, `ReceivePanel`, `UseStockDialog` and
 * `VariantPicker`, presented as phone sheets. Every code field takes typing, a keyboard-mode
 * scanner or the camera.
 */

function useDebounced(value: string, ms = 250): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim()), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

// ─── The product picker (#31 `po.addLine`, `po.receive.extra`; #32 Use stock) ─

/** A search for counted products (a barcode matches exactly), with the camera beside it. */
function VariantSearch({
  purpose,
  supplierId,
  onPick,
}: {
  purpose: 'use' | 'order';
  supplierId?: string | null;
  onPick: (v: PickerVariant) => void;
}) {
  const t = usePosT();
  const [q, setQ] = useState('');
  const [camera, setCamera] = useState(false);
  const debounced = useDebounced(q);
  const picker = useVariantPicker({ q: debounced, purpose, supplierId });
  const items = picker.data ?? [];
  return (
    <View style={posStyles.stack}>
      <SearchBar
        value={q}
        onChangeText={setQ}
        placeholder={purpose === 'use' ? t('use.product.choose') : t('po.search')}
        accessibilityLabel={purpose === 'use' ? t('use.product.choose') : t('po.search')}
        onClear={() => setQ('')}
        right={<ScanButton onPress={() => setCamera(true)} />}
      />
      <CameraScanner visible={camera} onClose={() => setCamera(false)} onScan={(code) => setQ(code)} />
      {picker.isLoading ? (
        <Text tone="muted">{t('app.loading')}</Text>
      ) : picker.isError ? (
        <ErrorLine message={posErrorMessage(picker.error, t('common.networkError'))} />
      ) : items.length === 0 ? (
        <Text tone="muted">{purpose === 'use' ? t('use.product.none') : t('po.search.none')}</Text>
      ) : (
        items.map((v) => (
          <PickRow
            key={v.variant_id}
            title={pickerLabel(v)}
            detail={[v.sku, v.brand_name, t('use.inStock', { count: v.on_hand })].filter(Boolean).join(' · ')}
            onPress={() => onPick(v)}
          />
        ))
      )}
    </View>
  );
}

export function VariantPickerSheet({
  visible,
  title,
  purpose,
  supplierId,
  onClose,
  onPick,
}: {
  visible: boolean;
  title: string;
  purpose: 'use' | 'order';
  supplierId?: string | null;
  onClose: () => void;
  onPick: (v: PickerVariant) => void;
}) {
  return (
    <PosSheet visible={visible} onClose={onClose} title={title}>
      {visible ? <VariantSearch purpose={purpose} supplierId={supplierId} onPick={onPick} /> : null}
    </PosSheet>
  );
}

// ─── Use stock (§6.14) ──────────────────────────────────────────────────────

export interface UseStockBooking {
  id: string;
  label: string;
}

/**
 * "Record products used" (`use.*`): a product used in treatments, whole units, and the booking it
 * was for (fixed when opened from a booking; otherwise today's bookings, or none). One request id
 * per sheet.
 */
export function UseStockSheet({
  visible,
  booking,
  timeZone,
  onClose,
}: {
  visible: boolean;
  booking?: UseStockBooking | null;
  timeZone: string;
  onClose: () => void;
}) {
  return visible ? <UseStockBody booking={booking ?? null} timeZone={timeZone} onClose={onClose} /> : null;
}

function UseStockBody({ booking, timeZone, onClose }: { booking: UseStockBooking | null; timeZone: string; onClose: () => void }) {
  const t = usePosT();
  const toast = useToast();
  const record = useRecordUse();
  const requestId = useRef(newPaymentAttemptId());
  const [variant, setVariant] = useState<PickerVariant | null>(null);
  const [qty, setQty] = useState('1');
  const [bookingId, setBookingId] = useState<string>(booking?.id ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const today = useBookingsList({ enabled: !booking, timeZone });
  const todays = useMemo(
    () => (today.data?.bookings ?? []).filter((b) => b.status !== 'Cancelled').slice(0, 30),
    [today.data],
  );
  const qtyOk = /^\d{1,5}$/.test(qty.trim()) && Number(qty.trim()) >= 1;

  async function submit() {
    if (!variant) {
      setError(t('use.product.required'));
      return;
    }
    if (!qtyOk) {
      setError(t('use.qty.invalid'));
      return;
    }
    setError(null);
    try {
      await record.mutateAsync({
        clientRequestId: requestId.current,
        variantId: variant.variant_id,
        quantity: Number(qty.trim()),
        bookingId: bookingId || null,
        note: note.trim() || null,
      });
      hapticSuccess();
      toast.success(t('use.saved'));
      onClose();
    } catch (e) {
      setError(posErrorMessage(e, t('common.saveError')));
    }
  }

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={t('use.title')}
      subtitle={t('use.help')}
      footer={<Button label={t('use.confirm')} loading={record.isPending} disabled={record.isPending} onPress={() => void submit()} fullWidth />}>
      <Text variant="label">{t('use.product')}</Text>
      {variant ? (
        <PickRow
          title={pickerLabel(variant)}
          detail={t('use.inStock', { count: variant.on_hand })}
          selected
          onPress={() => setVariant(null)}
        />
      ) : (
        <VariantSearch purpose="use" onPick={(v) => setVariant(v)} />
      )}
      <Input label={t('use.qty')} accessibilityLabel={t('use.qty')} value={qty} onChangeText={setQty} keyboardType="number-pad" />
      <Text variant="label">{t('use.booking')}</Text>
      {booking ? (
        <Text variant="bodySmall">{booking.label}</Text>
      ) : (
        <ChoiceChips
          options={[
            { value: '', label: t('use.booking.none') },
            ...todays.map((b) => ({
              value: b.id,
              label: t('app.use.forBooking', { time: (b.booking_time ?? '').slice(0, 5), client: b.guest_name }),
            })),
          ]}
          value={bookingId}
          onChange={setBookingId}
        />
      )}
      <Input label={t('use.note')} accessibilityLabel={t('use.note')} value={note} onChangeText={setNote} maxLength={200} />
      <ErrorLine message={error} />
    </PosSheet>
  );
}

// ─── A new order (§6.13 "New order") ────────────────────────────────────────

/**
 * "New order": choose the supplier, then "Suggest an order" (everything from them at or below its
 * reorder level, in whole packs) or "Start an empty order". One request id per sheet.
 */
export function NewOrderSheet({
  visible,
  initialSupplierId,
  onClose,
  onCreated,
}: {
  visible: boolean;
  /** Low stock's "Suggest an order" opens the sheet with that supplier chosen. */
  initialSupplierId?: string | null;
  onClose: () => void;
  onCreated: (id: string, message: string | null) => void;
}) {
  return visible ? <NewOrderBody initialSupplierId={initialSupplierId ?? null} onClose={onClose} onCreated={onCreated} /> : null;
}

function NewOrderBody({
  initialSupplierId,
  onClose,
  onCreated,
}: {
  initialSupplierId: string | null;
  onClose: () => void;
  onCreated: (id: string, message: string | null) => void;
}) {
  const t = usePosT();
  const suppliers = useSuppliers();
  const create = useCreatePurchaseOrder();
  // One key per supplier and kind, kept across a retry, so a double tap never makes two orders (web `NewOrderDialog`).
  const keys = useRef(new Map<string, string>());
  const [supplierId, setSupplierId] = useState<string | null>(initialSupplierId);
  const [error, setError] = useState<string | null>(null);
  const live = (suppliers.data ?? []).filter((s) => !s.archived_at);
  const supplier = live.find((s) => s.id === supplierId) ?? null;

  async function start(suggest: boolean) {
    if (!supplier) {
      setError(t('app.po.chooseSupplier'));
      return;
    }
    setError(null);
    try {
      const keyName = `${suggest ? 'suggest' : 'blank'}:${supplier.id}`;
      if (!keys.current.has(keyName)) keys.current.set(keyName, newPaymentAttemptId());
      const res = await create.mutateAsync({ clientRequestId: keys.current.get(keyName)!, supplierId: supplier.id, suggest });
      const message = suggest
        ? (res.suggested ?? 0) > 0
          ? t('po.suggest.added', { count: res.suggested ?? 0, supplier: supplier.name })
          : t('po.suggest.none', { supplier: supplier.name })
        : null;
      onCreated(res.purchase_order_id, message);
    } catch (e) {
      setError(posErrorMessage(e, t('common.saveError')));
    }
  }

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={t('po.new.title')}
      footer={
        live.length > 0 ? (
          <View style={posStyles.buttons}>
            <Button label={t('po.suggest')} loading={create.isPending && create.variables?.suggest === true} disabled={create.isPending} onPress={() => void start(true)} fullWidth />
            <Button
              label={t('po.new.blank')}
              variant="secondary"
              loading={create.isPending && create.variables?.suggest === false}
              disabled={create.isPending}
              onPress={() => void start(false)}
              fullWidth
            />
          </View>
        ) : null
      }>
      <Text variant="label">{t('po.new.supplier')}</Text>
      {suppliers.isLoading ? (
        <Text tone="muted">{t('app.loading')}</Text>
      ) : suppliers.isError ? (
        <ErrorLine message={posErrorMessage(suppliers.error, t('sup.error'))} />
      ) : live.length === 0 ? (
        <Notice>{t('app.po.noSuppliers')}</Notice>
      ) : (
        live.map((s) => (
          <PickRow key={s.id} title={s.name} detail={s.email ?? s.contact_name} selected={s.id === supplierId} onPress={() => setSupplierId(s.id)} />
        ))
      )}
      {supplier ? (
        <Text variant="caption" tone="muted">
          {t('po.suggest.help', { supplier: supplier.name })}
        </Text>
      ) : null}
      <ErrorLine message={error} />
    </PosSheet>
  );
}

// ─── Receiving a delivery (§6.13 "Receive") ─────────────────────────────────

/**
 * "Receive delivery" (`receive_stock`): scan items as they are unpacked (each scan adds one to its
 * line; something not on the order can be added as an extra), or type how many arrived and at what
 * cost; a delivery note reference; then "Add {count} items to stock" with the sheet's request id
 * and the order's version. More than ordered is allowed, with `po.receive.over`.
 */
export function ReceiveSheet({ visible, detail, onClose }: { visible: boolean; detail: PurchaseOrderDetail; onClose: () => void }) {
  return visible ? <ReceiveBody detail={detail} onClose={onClose} /> : null;
}

function ReceiveBody({ detail, onClose }: { detail: PurchaseOrderDetail; onClose: () => void }) {
  const t = usePosT();
  const toast = useToast();
  const accessToken = useAccessToken();
  const receive = useReceivePurchaseOrder(detail.order.id);
  const requestId = useRef(newPaymentAttemptId());
  const lines = detail.lines.filter((l) => l.exists);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [cost, setCost] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, penceToInput(l.unit_cost_pence)])),
  );
  const [extras, setExtras] = useState<ExtraDraft[]>([]);
  const [ref, setRef] = useState('');
  const [scan, setScan] = useState('');
  const [camera, setCamera] = useState(false);
  const [looking, setLooking] = useState(false);
  const [picking, setPicking] = useState(false);
  const [message, setMessage] = useState<ScanMessage>(null);
  const [offer, setOffer] = useState<PickerVariant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const body = receiveBody(lines, qty, cost, extras);

  function bump(lineId: string) {
    setQty((cur) => {
      const n = Number((cur[lineId] ?? '').trim() || '0');
      return { ...cur, [lineId]: String((Number.isFinite(n) ? n : 0) + 1) };
    });
  }

  function addExtra(v: PickerVariant, quantity = 1) {
    setExtras((cur) => {
      const there = cur.find((e) => e.variant_id === v.variant_id);
      if (there) return cur.map((e) => (e === there ? { ...e, qty: String(Number(e.qty || '0') + quantity) } : e));
      return [...cur, { variant_id: v.variant_id, name: pickerLabel(v), qty: String(quantity), cost: v.cost_pence != null ? penceToInput(Math.round(v.cost_pence)) : '' }];
    });
  }

  async function handleCode(raw: string) {
    const code = raw.trim();
    if (!code) return;
    setOffer(null);
    const line = receiveLineForCode(lines, code);
    if (line) {
      bump(line.id);
      hapticSuccess();
      setMessage({ tone: 'success', text: t('po.receive.scan.added', { product: line.name }) });
      return;
    }
    // Not on this order: look the code up, and offer it as something that wasn't ordered.
    if (!accessToken) return;
    setLooking(true);
    try {
      const res = await posFetch<{ items?: PickerVariant[] }>(retailPaths.variants({ q: code, purpose: 'order' }), { accessToken });
      const lc = code.toLowerCase();
      const hit = (res.items ?? []).find((v) => v.barcodes.some((b) => sameBarcode(b, code)) || (v.sku ?? '').trim().toLowerCase() === lc);
      if (hit) {
        const there = extras.some((e) => e.variant_id === hit.variant_id);
        if (there) {
          addExtra(hit);
          hapticSuccess();
          setMessage({ tone: 'success', text: t('po.receive.scan.added', { product: pickerLabel(hit) }) });
        } else {
          hapticWarning();
          setOffer(hit);
          setMessage({ tone: 'warning', text: t('po.receive.scan.notOnOrder', { product: pickerLabel(hit) }) });
        }
      } else {
        hapticWarning();
        setMessage({ tone: 'warning', text: t('po.receive.scan.unknown', { barcode: code }) });
      }
    } catch (e) {
      setMessage({ tone: 'error', text: posErrorMessage(e, t('common.networkError')) });
    } finally {
      setLooking(false);
    }
  }

  async function submit() {
    if (body.problem) {
      setError(
        body.problem.kind === 'nothing'
          ? t('po.receive.nothing')
          : body.problem.kind === 'qty'
            ? t('po.receive.qty.invalid')
            : t('po.cost.invalid', { product: body.problem.name ?? '' }),
      );
      return;
    }
    setError(null);
    try {
      const res = await receive.mutateAsync({
        clientRequestId: requestId.current,
        version: detail.order.version,
        deliveryRef: ref.trim() || null,
        lines: body.lines,
        extras: body.extras,
      });
      hapticSuccess();
      toast.success(t('po.receive.done', { count: res.units }));
      onClose();
    } catch (e) {
      setError(posErrorMessage(e, t('common.saveError')));
    }
  }

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={t('po.receive.title', { poNumber: detail.order.number })}
      footer={
        <Button
          label={t('po.receive.confirm', { count: body.units })}
          loading={receive.isPending}
          disabled={receive.isPending || body.units <= 0}
          onPress={() => void submit()}
          fullWidth
        />
      }>
      <SearchBar
        value={scan}
        onChangeText={setScan}
        placeholder={t('po.receive.scan')}
        accessibilityLabel={t('po.receive.scan')}
        onClear={() => setScan('')}
        onSubmitEditing={() => {
          const code = scan;
          setScan('');
          void handleCode(code);
        }}
        submitBehavior="submit"
        right={
          <ScanButton
            onPress={() => {
              setMessage(null);
              setCamera(true);
            }}
          />
        }
      />
      <CameraScanner
        visible={camera}
        mode="continuous"
        onClose={() => setCamera(false)}
        onScan={(code) => void handleCode(code)}
        paused={looking}
        message={message}
      />
      {message ? (
        <Notice
          tone={message.tone === 'success' ? 'success' : message.tone === 'info' ? 'info' : 'warning'}
          action={
            offer
              ? {
                  label: t('po.receive.scan.addIt'),
                  onPress: () => {
                    addExtra(offer);
                    setOffer(null);
                    setMessage({ tone: 'success', text: t('po.receive.scan.added', { product: pickerLabel(offer) }) });
                  },
                }
              : undefined
          }>
          {message.text}
        </Notice>
      ) : null}
      <Button
        label={t('po.receive.fill')}
        size="sm"
        variant="ghost"
        onPress={() => setQty(Object.fromEntries(lines.map((l) => [l.id, String(stillToCome(l))])))}
      />
      {lines.map((l) => {
        const over = overBy(l, qty[l.id] ?? '');
        return (
          <Card key={l.id}>
            <View style={posStyles.stack}>
              <Text variant="label">{l.name}</Text>
              <Text variant="caption" tone="muted">
                {[t('po.receive.ordered', { received: l.quantity_received, ordered: l.quantity_ordered }), l.sku].filter(Boolean).join(' · ')}
              </Text>
              <View style={styles.pair}>
                <Input
                  label={t('po.receive.qty')}
                  accessibilityLabel={`${t('po.receive.qty')} ${l.name}`}
                  value={qty[l.id] ?? ''}
                  onChangeText={(v) => setQty((cur) => ({ ...cur, [l.id]: v }))}
                  keyboardType="number-pad"
                  placeholder="0"
                  containerStyle={styles.flex}
                />
                <Input
                  label={t('po.receive.cost')}
                  accessibilityLabel={`${t('po.receive.cost')} ${l.name}`}
                  value={cost[l.id] ?? ''}
                  onChangeText={(v) => setCost((cur) => ({ ...cur, [l.id]: v }))}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  containerStyle={styles.flex}
                />
              </View>
              {over > 0 ? <Notice tone="warning">{t('po.receive.over', { count: over })}</Notice> : null}
            </View>
          </Card>
        );
      })}
      {extras.map((e) => (
        <Card key={e.variant_id}>
          <View style={posStyles.stack}>
            <View style={posStyles.row}>
              <Text variant="label" style={styles.flex}>
                {e.name}
              </Text>
              <Button
                label={t('app.po.extraRemove')}
                size="sm"
                variant="ghost"
                onPress={() => setExtras((cur) => cur.filter((x) => x.variant_id !== e.variant_id))}
              />
            </View>
            <Text variant="caption" tone="muted">
              {t('po.line.added')}
            </Text>
            <View style={styles.pair}>
              <Input
                label={t('po.receive.qty')}
                accessibilityLabel={`${t('po.receive.qty')} ${e.name}`}
                value={e.qty}
                onChangeText={(v) => setExtras((cur) => cur.map((x) => (x.variant_id === e.variant_id ? { ...x, qty: v } : x)))}
                keyboardType="number-pad"
                containerStyle={styles.flex}
              />
              <Input
                label={t('po.receive.cost')}
                accessibilityLabel={`${t('po.receive.cost')} ${e.name}`}
                value={e.cost}
                onChangeText={(v) => setExtras((cur) => cur.map((x) => (x.variant_id === e.variant_id ? { ...x, cost: v } : x)))}
                keyboardType="decimal-pad"
                inputMode="decimal"
                containerStyle={styles.flex}
              />
            </View>
          </View>
        </Card>
      ))}
      <Button label={t('po.receive.extra')} size="sm" variant="secondary" onPress={() => setPicking(true)} />
      <Input label={t('po.receive.ref')} accessibilityLabel={t('po.receive.ref')} value={ref} onChangeText={setRef} maxLength={80} />
      <ErrorLine message={error} />
      <VariantPickerSheet
        visible={picking}
        title={t('po.receive.extra')}
        purpose="order"
        supplierId={detail.order.supplier_id}
        onClose={() => setPicking(false)}
        onPick={(v) => {
          setPicking(false);
          const line = lines.find((l) => l.variant_id === v.variant_id);
          if (line) bump(line.id);
          else addExtra(v);
        }}
      />
    </PosSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pair: { flexDirection: 'row', gap: spacing.sm },
});
