import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { AmountRow, ChoiceChips, ErrorLine, money, PickRow, PosSheet, posStyles, usePosT } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { posErrorMessage } from '@/lib/pos/api';
import type { PosCopyId } from '@/lib/pos/copy';
import { movementReasonId, movementReference, parseWhole, stocktakeDefaultName } from '@/lib/retail/stock-words';
import { useAdjustStock, useRetailNamed, useStartStocktake, useStockMovements } from '@/lib/queries/useRetail';
import { useNamedList } from '@/lib/queries/useStockSetup';
import { useToast } from '@/providers/ToastProvider';
import type { AdjustmentReason, StockMovement } from '@/types/retail';

/**
 * The stock sheets in the app (POS app step 4, UX spec §6.9 to §6.11, §13.6): adjusting one option's
 * stock with a reason, one product's or option's movement history, and starting a stocktake.
 */

export interface AdjustTarget {
  variantId: string;
  label: string;
  onHand: number;
}

const REASONS: { value: AdjustmentReason; id: PosCopyId }[] = [
  { value: 'adjustment', id: 'adj.reason.adjustment' },
  { value: 'wastage', id: 'adj.reason.wastage' },
  { value: 'damaged', id: 'adj.reason.damaged' },
  { value: 'expired', id: 'adj.reason.expired' },
  { value: 'theft', id: 'adj.reason.theft' },
];

/**
 * Adjusting stock (§6.9, needs `adjust_stock`): add or remove whole units, or set the count, with a
 * required reason and an optional note, a preview of the new count, then `adj.confirm`. One request
 * id per sheet, kept across retries, so a double tap or a retry after a dropped connection never
 * moves stock twice. Going below zero is refused by the server (`err.stock.belowZero`), whose
 * sentence is shown word for word.
 */
export function AdjustStockSheet({ target, onClose }: { target: AdjustTarget | null; onClose: () => void }) {
  return target ? <AdjustBody key={target.variantId} target={target} onClose={onClose} /> : null;
}

function AdjustBody({ target, onClose }: { target: AdjustTarget; onClose: () => void }) {
  const t = usePosT();
  const toast = useToast();
  const adjust = useAdjustStock();
  const requestId = useRef(newPaymentAttemptId());
  const [mode, setMode] = useState<'change' | 'set'>('change');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState<AdjustmentReason | null>(null);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ qty?: string; reason?: string }>({});
  const [error, setError] = useState<string | null>(null);

  const parsed = parseWhole(qty);
  const to = parsed === null ? null : mode === 'set' ? parsed : target.onHand + parsed;

  async function save() {
    const errs: { qty?: string; reason?: string } = {};
    if (parsed === null || (mode === 'set' && parsed < 0)) errs.qty = t('adj.quantity.whole');
    else if (mode === 'change' && parsed === 0) errs.qty = t('adj.quantity.zero');
    if (!reason) errs.reason = t('adj.reason.required');
    setErrors(errs);
    if (errs.qty || errs.reason || parsed === null || !reason) return;
    setError(null);
    try {
      await adjust.mutateAsync({
        clientRequestId: requestId.current,
        variantId: target.variantId,
        mode,
        quantity: parsed,
        reason,
        note: note.trim() || null,
      });
      toast.success(t('adj.saved'));
      onClose();
    } catch (e) {
      setError(posErrorMessage(e, t('common.networkError')));
    }
  }

  return (
    <PosSheet visible onClose={onClose} title={t('adj.title', { product: target.label })}>
      <View style={posStyles.stack}>
        <Segmented
          options={[
            { value: 'change', label: t('adj.mode.change') },
            { value: 'set', label: t('adj.mode.set') },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setErrors((e) => ({ ...e, qty: undefined }));
          }}
        />
        <Input
          label={mode === 'set' ? t('adj.quantity.set') : t('adj.quantity.change')}
          helper={mode === 'change' ? t('adj.quantity.change.help') : undefined}
          value={qty}
          onChangeText={setQty}
          // The minus sign: iOS's number pad has none.
          keyboardType={mode === 'change' ? 'numbers-and-punctuation' : 'number-pad'}
          error={errors.qty}
          required
        />
        <Text variant="label">{t('adj.reason')}</Text>
        <ChoiceChips options={REASONS.map((r) => ({ value: r.value, label: t(r.id) }))} value={reason} onChange={setReason} />
        <ErrorLine message={errors.reason} />
        <Input
          label={t('adj.note')}
          helper={t('adj.note.help')}
          value={note}
          onChangeText={setNote}
          maxLength={200}
        />
        {to !== null && !errors.qty ? <Text variant="bodyMedium">{t('adj.preview', { from: target.onHand, to })}</Text> : null}
        <ErrorLine message={error} />
        <Button label={t('adj.confirm')} loading={adjust.isPending} onPress={() => void save()} fullWidth />
        <Button label={t('common.cancel')} variant="ghost" onPress={onClose} disabled={adjust.isPending} fullWidth />
      </View>
    </PosSheet>
  );
}

/** Movement history (§6.10): one option's, or one product's, newest first, paged. */
export function MovementsSheet({
  target,
  timeZone,
  onClose,
}: {
  target: { variantId?: string | null; productId?: string | null; label: string } | null;
  timeZone: string;
  onClose: () => void;
}) {
  return target ? <MovementsBody target={target} timeZone={timeZone} onClose={onClose} /> : null;
}

function movementWhen(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

function MovementsBody({
  target,
  timeZone,
  onClose,
}: {
  target: { variantId?: string | null; productId?: string | null; label: string };
  timeZone: string;
  onClose: () => void;
}) {
  const t = usePosT();
  const q = useStockMovements({ variantId: target.variantId ?? null, productId: target.productId ?? null });
  const items = useMemo(() => (q.data?.pages ?? []).flatMap((p) => p.items), [q.data]);
  return (
    <PosSheet visible onClose={onClose} title={t('app.stock.historyTitle', { product: target.label })}>
      <View style={posStyles.stack}>
        {q.isLoading ? (
          <Text tone="muted">{t('app.loading')}</Text>
        ) : q.isError ? (
          <>
            <ErrorLine message={posErrorMessage(q.error, t('mov.error'))} />
            <Button label={t('common.tryAgain')} variant="secondary" onPress={() => void q.refetch()} />
          </>
        ) : items.length === 0 ? (
          <Text tone="muted">{t('mov.empty')}</Text>
        ) : (
          items.map((m) => <MovementRow key={m.id} m={m} timeZone={timeZone} showProduct={!target.variantId} />)
        )}
        {q.hasNextPage ? (
          <Button
            label={t('app.stock.more')}
            variant="secondary"
            loading={q.isFetchingNextPage}
            onPress={() => void q.fetchNextPage()}
            fullWidth
          />
        ) : null}
      </View>
    </PosSheet>
  );
}

function MovementRow({ m, timeZone, showProduct }: { m: StockMovement; timeZone: string; showProduct: boolean }) {
  const t = usePosT();
  const reference = movementReference(m, t);
  const product = [m.product_name, m.option_name].filter(Boolean).join(', ');
  const signed = m.delta > 0 ? `+${m.delta}` : String(m.delta);
  return (
    <View style={posStyles.stack}>
      <AmountRow label={`${t(movementReasonId(m.reason))}${showProduct && product ? `: ${product}` : ''}`} amount={signed} strong />
      <Text variant="caption" tone="muted">
        {[
          movementWhen(m.occurred_at, timeZone),
          `${t('mov.col.after')}: ${m.on_hand_after}`,
          m.value_pence != null ? money(Math.round(m.value_pence)) : null,
          reference,
          m.staff_name ? t('app.stock.who', { staffName: m.staff_name }) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {m.note ? (
        <Text variant="caption" tone="muted">
          {m.note}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Starting a stocktake (§6.11 Start, needs `count_stock`): a name (`take.name.default` with today's
 * date), everything or only some categories, brands or suppliers, then `take.start.confirm`. One request id
 * per sheet, so a retry starts it once. Answers the new stocktake's id.
 */
export function StartStocktakeSheet({
  visible,
  timeZone,
  onClose,
  onStarted,
}: {
  visible: boolean;
  timeZone: string;
  onClose: () => void;
  onStarted: (stocktakeId: string) => void;
}) {
  return visible ? <StartBody timeZone={timeZone} onClose={onClose} onStarted={onStarted} /> : null;
}

function StartBody({
  timeZone,
  onClose,
  onStarted,
}: {
  timeZone: string;
  onClose: () => void;
  onStarted: (stocktakeId: string) => void;
}) {
  const t = usePosT();
  const start = useStartStocktake();
  const requestId = useRef(newPaymentAttemptId());
  const [name, setName] = useState(() => t('take.name.default', { date: stocktakeDefaultName(timeZone) }));
  const [scope, setScope] = useState<'full' | 'partial'>('full');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const categories = useRetailNamed('categories', { enabled: scope === 'partial' });
  const brands = useRetailNamed('brands', { enabled: scope === 'partial' });
  const suppliers = useNamedList('suppliers', { enabled: scope === 'partial' });

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function go() {
    setError(null);
    if (!name.trim()) {
      setError(t('take.name.required'));
      return;
    }
    if (scope === 'partial' && categoryIds.length === 0 && brandIds.length === 0 && supplierIds.length === 0) {
      setError(t('take.scope.pickOne'));
      return;
    }
    try {
      const res = await start.mutateAsync({
        clientRequestId: requestId.current,
        name: name.trim(),
        scope:
          scope === 'full'
            ? { type: 'full' }
            : {
                type: 'partial',
                ...(categoryIds.length ? { category_ids: categoryIds } : {}),
                ...(brandIds.length ? { brand_ids: brandIds } : {}),
                ...(supplierIds.length ? { supplier_ids: supplierIds } : {}),
              },
      });
      onStarted(res.stocktake_id);
    } catch (e) {
      setError(posErrorMessage(e, t('common.networkError')));
    }
  }

  return (
    <PosSheet visible onClose={onClose} title={t('take.start.title')} subtitle={t('take.start.help')}>
      <View style={posStyles.stack}>
        <Input label={t('take.name')} value={name} onChangeText={setName} maxLength={80} />
        <Segmented
          options={[
            { value: 'full', label: t('take.scope.full') },
            { value: 'partial', label: t('take.scope.partial') },
          ]}
          value={scope}
          onChange={setScope}
        />
        {scope === 'partial' ? (
          <>
            <Text variant="label">{t('take.scope.categories')}</Text>
            {(categories.data ?? []).length === 0 ? (
              <Text variant="caption" tone="muted">
                {categories.isLoading ? t('app.loading') : t('take.scope.none')}
              </Text>
            ) : (
              (categories.data ?? []).map((c) => (
                <PickRow
                  key={c.id}
                  title={c.name}
                  selected={categoryIds.includes(c.id)}
                  onPress={() => setCategoryIds((l) => toggle(l, c.id))}
                />
              ))
            )}
            <Text variant="label">{t('take.scope.brands')}</Text>
            {(brands.data ?? []).length === 0 ? (
              <Text variant="caption" tone="muted">
                {brands.isLoading ? t('app.loading') : t('take.scope.none')}
              </Text>
            ) : (
              (brands.data ?? []).map((b) => (
                <PickRow key={b.id} title={b.name} selected={brandIds.includes(b.id)} onPress={() => setBrandIds((l) => toggle(l, b.id))} />
              ))
            )}
            <Text variant="label">{t('take.scope.suppliers')}</Text>
            {(suppliers.data ?? []).length === 0 ? (
              <Text variant="caption" tone="muted">
                {suppliers.isLoading ? t('app.loading') : t('take.scope.none')}
              </Text>
            ) : (
              (suppliers.data ?? []).map((s) => (
                <PickRow
                  key={s.id}
                  title={s.name}
                  selected={supplierIds.includes(s.id)}
                  onPress={() => setSupplierIds((l) => toggle(l, s.id))}
                />
              ))
            )}
          </>
        ) : null}
        <ErrorLine message={error} />
        <Button label={t('take.start.confirm')} loading={start.isPending} onPress={() => void go()} fullWidth />
        <Button label={t('common.cancel')} variant="ghost" onPress={onClose} disabled={start.isPending} fullWidth />
      </View>
    </PosSheet>
  );
}
