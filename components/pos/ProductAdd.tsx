import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { ErrorLine, money, Notice, PickRow, posStyles, usePosT, writeError, type Send } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { checkStock, optionLabel, productPrice, quantityOnSale, stockHint } from '@/lib/pos/product-math';
import type { PosCatalogueProduct, PosCatalogueProductOption, PosSale, PosStockRules } from '@/types/pos';

/**
 * Adding products at the till in the app (POS app step 4, UX spec §3.8, P4-4), as the web till's
 * `ProductAdd.tsx`: product rows with their stock hints, the option chooser, and `useAddProduct`,
 * which adds one (a second tap or scan adds one more to the same line, on the server), says what
 * happened, and warns about stock (D15) and age restricted products (§3.26, v1: a reminder only,
 * nothing recorded or refused).
 */

export interface AddNotice {
  tone: 'info' | 'warning' | 'error';
  lines: string[];
  action?: { label: string; onPress: () => void };
}

/** What happened after an add or a scan, above the lists. */
export function AddNoticeBanner({ notice }: { notice: AddNotice | null }) {
  if (!notice) return null;
  if (notice.tone === 'error') {
    return (
      <View style={posStyles.stack}>
        {notice.lines.map((l) => (
          <ErrorLine key={l} message={l} />
        ))}
        {notice.action ? <Button label={notice.action.label} size="sm" variant="secondary" onPress={notice.action.onPress} /> : null}
      </View>
    );
  }
  return (
    <Notice tone={notice.tone === 'warning' ? 'warning' : 'success'} action={notice.action}>
      {notice.lines.join(' ')}
    </Notice>
  );
}

/** The person serving, as the lines route takes a seller (exactly one of calendar or login). */
function sellerOf(sale: PosSale): { calendar_id: string; name?: string } | { staff_id: string; name?: string } | null {
  const op = sale.operator;
  if (op.calendar_id) return { calendar_id: op.calendar_id, ...(op.name ? { name: op.name } : {}) };
  if (op.staff_id) return { staff_id: op.staff_id, ...(op.name ? { name: op.name } : {}) };
  return null;
}

/** Adds products to the sale on screen and reports how it went through `onNotice`. */
export function useAddProduct(input: {
  sale: PosSale;
  send: Send;
  rules: PosStockRules;
  venueName: string;
  onNotice: (n: AddNotice | null) => void;
}) {
  const t = usePosT();
  const { sale, send, rules, venueName, onNotice } = input;
  const [busy, setBusy] = useState(false);

  const add = useCallback(
    async (product: PosCatalogueProduct, option: PosCatalogueProductOption, quantity = 1): Promise<boolean> => {
      const label = optionLabel(product, option);
      const stock = checkStock(option, quantityOnSale(sale.lines, option.id), quantity, rules);
      if (stock.kind === 'blocked') {
        hapticWarning();
        onNotice({ tone: 'error', lines: [t('err.stock.none', { product: label, venue: venueName })] });
        return false;
      }
      setBusy(true);
      try {
        const seller = sellerOf(sale);
        await send({
          action: 'lines',
          body: {
            version: sale.version,
            ops: [{ op: 'add', line: { kind: 'product', variant_id: option.id, quantity, ...(seller ? { seller } : {}) } }],
          },
        });
      } catch (e) {
        hapticWarning();
        onNotice({ tone: 'error', lines: [writeError(e, t)] });
        return false;
      } finally {
        setBusy(false);
      }
      const lines = [t('scan.added', { product: label })];
      if (stock.kind === 'over') lines.push(t('add.stock.warnOver', { count: stock.left }));
      if (stock.kind === 'reserved') lines.push(t('add.stock.warnReserved', { count: stock.held }));
      if (product.restriction === 'age_18') lines.push(t('age.reminder', { product: label }));
      if (lines.length > 1) hapticWarning();
      else hapticSuccess();
      onNotice({ tone: lines.length > 1 ? 'warning' : 'info', lines });
      return true;
    },
    [onNotice, rules, sale, send, t, venueName],
  );

  return { add, busy };
}

/** Product rows (UX spec §3.8 tiles, as rows on a phone): name, option count, price or "From", stock. */
export function ProductRows({
  products,
  rules,
  disabled,
  onPick,
}: {
  products: PosCatalogueProduct[];
  rules: PosStockRules;
  disabled?: boolean;
  onPick: (product: PosCatalogueProduct) => void;
}) {
  const t = usePosT();
  return (
    <>
      {products.map((p) => {
        const hint = stockHint(p, rules);
        const detail = [
          p.options.length > 1 ? t('add.options', { count: p.options.length }) : null,
          productPrice(p, money, (amount) => t('add.from', { amount })),
          hint ? (hint.kind === 'out' ? t('add.stock.out') : t('add.stock.left', { count: hint.count })) : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <PickRow
            key={p.id}
            title={p.brand_name ? `${p.name} (${p.brand_name})` : p.name}
            detail={detail || null}
            disabled={disabled}
            onPress={() => onPick(p)}
          />
        );
      })}
    </>
  );
}

/** "Choose an option" (UX spec §3.8 `add.variant.title`): one row per option with price and stock. */
export function OptionChooser({
  product,
  rules,
  busy,
  onPick,
  onBack,
}: {
  product: PosCatalogueProduct;
  rules: PosStockRules;
  busy: boolean;
  onPick: (option: PosCatalogueProductOption) => void;
  onBack: () => void;
}) {
  const t = usePosT();
  return (
    <View style={posStyles.stack}>
      <Text variant="label">{product.name}</Text>
      {product.options.map((o) => {
        const counted = rules.track_stock && o.track_stock;
        const stock = counted ? (o.available <= 0 ? t('add.stock.out') : t('add.stock.left', { count: o.available })) : null;
        return (
          <PickRow
            key={o.id}
            title={o.name ?? product.name}
            detail={[money(o.price_pence), stock].filter(Boolean).join(' · ')}
            disabled={busy}
            onPress={() => onPick(o)}
          />
        );
      })}
      <Button label={t('app.card.back')} variant="ghost" onPress={onBack} fullWidth />
    </View>
  );
}
