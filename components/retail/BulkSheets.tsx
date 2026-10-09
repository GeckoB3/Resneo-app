import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ChoiceChips, ErrorLine, money, Notice, PosSheet, posStyles } from '@/components/pos/parts';
import { NamedChoice } from '@/components/retail/setup-parts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { bulkPreview, bulkPriceBody, type BulkKind, type BulkMode, type BulkPriceForm, type BulkWhich } from '@/lib/retail/product-list';
import { useStockT } from '@/lib/retail/stock-setup-copy';
import type { RetailListProduct, RetailNamedItem } from '@/types/retail';

/**
 * The bulk bar's sheets (UX spec §6.4), as the web's `BulkDialogs.tsx`: change prices (selling
 * price or cost, up, down or set, by a percentage or an amount, with a preview) and move to a
 * category. The caller sends the change and shows the server's sentence when it is refused.
 */

export function BulkPriceSheet({
  products,
  trackStock,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  products: RetailListProduct[] | null;
  trackStock: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  return products ? (
    <PriceBody products={products} trackStock={trackStock} busy={busy} error={error} onClose={onClose} onSubmit={onSubmit} />
  ) : null;
}

function PriceBody({
  products,
  trackStock,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  products: RetailListProduct[];
  trackStock: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const t = useStockT();
  const [form, setForm] = useState<BulkPriceForm>({ which: 'retail', mode: 'increase', kind: 'percent', value: '' });
  const ids = useMemo(() => products.map((p) => p.id), [products]);
  const body = bulkPriceBody(ids, form);
  const preview = bulkPreview(products, body, money, t);
  const set = (patch: Partial<BulkPriceForm>) => setForm((f) => ({ ...f, ...patch }));
  const showKind = form.mode !== 'set';
  const valueLabel = form.mode === 'set' ? t('x.newPrice') : t('x.changeBy');

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={t('bulk.price.title', { count: products.length })}
      footer={
        <View style={posStyles.buttons}>
          <Button label={t('bulk.price.confirm')} loading={busy} disabled={!body || busy} onPress={() => body && onSubmit(body)} fullWidth />
          <Button label={t('common.cancel')} variant="ghost" disabled={busy} onPress={onClose} fullWidth />
        </View>
      }>
      <ErrorLine message={error} />
      {trackStock ? (
        <View style={posStyles.stack}>
          <Text variant="label">{t('bulk.price.which')}</Text>
          <ChoiceChips<BulkWhich>
            options={[
              { value: 'retail', label: t('bulk.price.retail') },
              { value: 'cost', label: t('bulk.price.cost') },
            ]}
            value={form.which}
            onChange={(which) => set({ which })}
          />
        </View>
      ) : null}
      <Text variant="label">{t('x.howChange')}</Text>
      <ChoiceChips<BulkMode>
        options={[
          { value: 'increase', label: t('bulk.price.increase') },
          { value: 'decrease', label: t('bulk.price.decrease') },
          { value: 'set', label: t('bulk.price.set') },
        ]}
        value={form.mode}
        onChange={(mode) => set({ mode })}
      />
      {showKind ? (
        <>
          <Text variant="label">{t('x.percentOrAmount')}</Text>
          <ChoiceChips<BulkKind>
            options={[
              { value: 'percent', label: t('x.percent') },
              { value: 'amount', label: t('x.amount') },
            ]}
            value={form.kind}
            onChange={(kind) => set({ kind })}
          />
        </>
      ) : null}
      <Input
        label={valueLabel}
        accessibilityLabel={valueLabel}
        value={form.value}
        onChangeText={(value) => set({ value })}
        keyboardType="decimal-pad"
        inputMode="decimal"
        rightSlot={showKind && form.kind === 'percent' ? <Text tone="muted">%</Text> : undefined}
      />
      {preview ? <Notice>{preview}</Notice> : null}
    </PosSheet>
  );
}

export function BulkCategorySheet({
  count,
  categories,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  count: number | null;
  categories: RetailNamedItem[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (categoryId: string | null) => void;
}) {
  return count !== null ? (
    <CategoryBody count={count} categories={categories} busy={busy} error={error} onClose={onClose} onSubmit={onSubmit} />
  ) : null;
}

function CategoryBody({
  count,
  categories,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  count: number;
  categories: RetailNamedItem[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (categoryId: string | null) => void;
}) {
  const t = useStockT();
  const [value, setValue] = useState('');
  return (
    <PosSheet
      visible
      onClose={onClose}
      title={t('bulk.category.title', { count })}
      footer={
        <View style={posStyles.buttons}>
          <Button label={t('bulk.category.confirm')} loading={busy} disabled={busy} onPress={() => onSubmit(value || null)} fullWidth />
          <Button label={t('common.cancel')} variant="ghost" disabled={busy} onPress={onClose} fullWidth />
        </View>
      }>
      <ErrorLine message={error} />
      <NamedChoice label={t('prod.f.category')} first={t('x.noCategory')} items={categories} value={value} onChange={setValue} />
    </PosSheet>
  );
}
