import { type Href, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ChoiceChips, money, Notice, PickRow, posStyles } from '@/components/pos/parts';
import { DateFilter, ShareFileButton } from '@/components/retail/setup-parts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { SearchBar } from '@/components/ui/SearchBar';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { EMPTY_FILTERS } from '@/lib/retail/product-list';
import { movementReasonId, movementReference, productLabel, shortWhen, signed, timeOfDay } from '@/lib/retail/stock-words';
import { stockSetupPaths, type MovementFilters } from '@/lib/retail/stock-setup-paths';
import { useStockT } from '@/lib/retail/stock-setup-copy';
import { useMovementList, useProductList } from '@/lib/queries/useStockSetup';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { MovementReason, StockMovement } from '@/types/retail';

/**
 * Movement history (UX spec §6.10), the Movements tab, as the web's `MovementsTab.tsx`: filters
 * for one product (searched) or one option (from `stock.history`), the reason and the dates; each
 * row with when, the product and option, the signed change, the reason, in stock after, the value
 * at cost, the reference (a sale opens the sale, a stocktake or purchase order its page), who and
 * the note. `mov.export` (needs `export`) shares the same filters as a CSV.
 */

export const MOVEMENT_REASONS: MovementReason[] = [
  'opening',
  'receive',
  'sale',
  'refund_restock',
  'adjustment',
  'stocktake',
  'wastage',
  'damaged',
  'expired',
  'theft',
  'professional_use',
  'professional_use_reversal',
  'transfer_out',
  'transfer_in',
  'import',
];

function useDebounced(value: string, ms = 250): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim()), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export interface MovementScope {
  variantId?: string | null;
  productId?: string | null;
  label?: string | null;
}

export function MovementsTab({
  canExport,
  timeZone,
  initialScope,
}: {
  canExport: boolean;
  timeZone: string;
  initialScope?: MovementScope | null;
}) {
  const t = useStockT();
  const router = useRouter();
  const [scope, setScope] = useState<MovementScope | null>(initialScope ?? null);
  const [reason, setReason] = useState<string>('');
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const filters: MovementFilters = {
    variantId: scope?.variantId ?? null,
    productId: scope?.variantId ? null : (scope?.productId ?? null),
    reason: reason || null,
    from,
    to,
  };
  const list = useMovementList(filters);
  const items = useMemo(() => (list.data?.pages ?? []).flatMap((p) => p.items), [list.data]);
  const first = items[0];
  const scopeLabel = scope
    ? (scope.label ?? (first ? (scope.variantId ? productLabel(first.product_name, first.option_name) : first.product_name) : null))
    : null;
  const anyFilter = Boolean(scope || reason || from || to);

  function clear() {
    setScope(null);
    setReason('');
    setFrom(null);
    setTo(null);
  }

  function openReference(m: StockMovement) {
    if (m.sale_id) router.push(`/checkout/${m.sale_id}` as Href);
    else if (m.stocktake_id) router.push(`/stock/stocktake/${m.stocktake_id}` as Href);
    else if (m.purchase_order_id) router.push(`/stock/purchase-order/${m.purchase_order_id}` as Href);
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />}>
      <Card>
        <View style={posStyles.stack}>
          {scope ? (
            <Notice action={{ label: t('mov.filter.clear'), onPress: () => setScope(null) }}>
              {t('mov.filter.showing', { product: scopeLabel ?? t('mov.filter.product') })}
            </Notice>
          ) : (
            <ProductPicker onPick={(id, label) => setScope({ productId: id, label })} />
          )}
          <Text variant="label">{t('mov.filter.reason')}</Text>
          <ChoiceChips
            options={[
              { value: '', label: t('mov.filter.allReasons') },
              ...MOVEMENT_REASONS.map((r) => ({ value: r, label: t(movementReasonId(r)) })),
            ]}
            value={reason}
            onChange={setReason}
          />
          <View style={styles.dates}>
            <DateFilter label={t('mov.filter.from')} value={from} onChange={setFrom} maximumDate={to ? isoDate(to) : undefined} />
            <DateFilter label={t('mov.filter.to')} value={to} onChange={setTo} minimumDate={from ? isoDate(from) : undefined} />
          </View>
          <View style={styles.actions}>
            {anyFilter ? <Button label={t('mov.filter.clear')} variant="ghost" size="sm" onPress={clear} /> : null}
            {canExport ? (
              <ShareFileButton label={t('mov.export')} path={stockSetupPaths.movementsCsv(filters)} filename="stock-movements.csv" />
            ) : null}
          </View>
        </View>
      </Card>

      {list.isLoading ? (
        <ListSkeleton />
      ) : list.isError && items.length === 0 ? (
        <ErrorState message={posErrorMessage(list.error, t('mov.error'))} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <Text tone="muted">{t('mov.empty')}</Text>
      ) : (
        items.map((m) => <MovementCard key={m.id} m={m} timeZone={timeZone} onReference={() => openReference(m)} />)
      )}
      {list.hasNextPage ? (
        <Button label={t('app.stock.more')} variant="secondary" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} fullWidth />
      ) : null}
    </ScrollView>
  );
}

function isoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1, 12);
}

function ProductPicker({ onPick }: { onPick: (productId: string, label: string) => void }) {
  const t = useStockT();
  const [q, setQ] = useState('');
  const term = useDebounced(q);
  const search = useProductList({ ...EMPTY_FILTERS, q: term }, false, { enabled: term.length >= 2 });
  const results = term.length >= 2 ? (search.data?.pages[0]?.items ?? []).slice(0, 8) : [];
  return (
    <View style={posStyles.stack}>
      <SearchBar
        value={q}
        onChangeText={setQ}
        placeholder={t('mov.filter.productSearch')}
        accessibilityLabel={t('mov.filter.product')}
        onClear={() => setQ('')}
      />
      {results.map((p) => (
        <PickRow
          key={p.id}
          title={p.name}
          onPress={() => {
            onPick(p.id, p.name);
            setQ('');
          }}
        />
      ))}
    </View>
  );
}

function MovementCard({ m, timeZone, onReference }: { m: StockMovement; timeZone: string; onReference: () => void }) {
  const t = useStockT();
  const { colors } = useTheme();
  const reference = movementReference(m, t);
  const linkable = Boolean(m.sale_id || m.stocktake_id || m.purchase_order_id);
  return (
    <Card>
      <View style={styles.card}>
        <View style={posStyles.row}>
          <View style={styles.flex}>
            <Text variant="label">{productLabel(m.product_name, m.option_name)}</Text>
            <Text variant="caption" tone="muted">
              {`${shortWhen(m.occurred_at, timeZone)} ${timeOfDay(m.occurred_at, timeZone)}`}
              {m.staff_name ? `, ${m.staff_name}` : ''}
            </Text>
          </View>
          <Text variant="label" style={{ color: m.delta < 0 ? colors.danger : colors.success }}>
            {t('mov.delta', { signedCount: signed(m.delta) })}
          </Text>
        </View>
        <View style={posStyles.row}>
          <Text variant="bodySmall" style={styles.flex}>
            {t(movementReasonId(m.reason))}
          </Text>
          <Text variant="bodySmall" tone="muted">
            {`${t('mov.col.after')}: ${m.on_hand_after}${m.value_pence == null ? '' : `, ${money(Math.round(m.value_pence))}`}`}
          </Text>
        </View>
        {reference ? (
          linkable ? (
            <Pressable onPress={onReference} accessibilityRole="link" hitSlop={6}>
              <Text variant="bodySmall" tone="brand">
                {reference}
              </Text>
            </Pressable>
          ) : (
            <Text variant="bodySmall">{reference}</Text>
          )
        ) : null}
        {m.note ? (
          <Text variant="caption" tone="muted">
            {m.note}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  flex: { flex: 1 },
  card: { gap: spacing.xs },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
