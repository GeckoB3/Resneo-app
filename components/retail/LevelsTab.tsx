import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { money, posStyles } from '@/components/pos/parts';
import { AdjustStockSheet, MovementsSheet, type AdjustTarget } from '@/components/retail/StockSheets';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SearchBar } from '@/components/ui/SearchBar';
import { Segmented } from '@/components/ui/Segmented';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { productLabel, stockValueTilePence } from '@/lib/retail/stock-words';
import { useStockT } from '@/lib/retail/stock-setup-copy';
import { useStockLevels } from '@/lib/queries/useRetail';
import { useLowStockSuppliers } from '@/lib/queries/useStockSetup';
import { spacing } from '@/theme/index';
import type { StockFilter, StockLevelRow } from '@/types/retail';

/**
 * Stock levels and low stock (UX spec §6.8), as the web's `StockLevelsTab.tsx`: the tiles (the
 * two value tiles only for `view_reports`, which the server sends as null to everyone else), a
 * filter, a search, and one row per counted option with in stock, held for online orders,
 * available, reorder at and a pill. `stock.adjust` (needs `adjust_stock`) and `stock.history`. On
 * the Low filter, `stock.suggestOrder` starts a suggested order per supplier (needs
 * `manage_purchase_orders`).
 */

function useDebounced(value: string, ms = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim()), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** The pill a stock row shows, if any: below zero, then out, then low (web `stockPill`). */
export function stockPill(row: Pick<StockLevelRow, 'on_hand' | 'reorder_level'>): 'negative' | 'out' | 'low' | null {
  if (row.on_hand < 0) return 'negative';
  if (row.on_hand <= 0) return 'out';
  if (row.reorder_level !== null && row.reorder_level !== undefined && row.on_hand <= row.reorder_level) return 'low';
  return null;
}

export function LevelsTab({
  canAdjust,
  canOrder,
  timeZone,
  initialFilter = 'all',
  onSuggestOrder,
}: {
  canAdjust: boolean;
  canOrder: boolean;
  timeZone: string;
  initialFilter?: StockFilter;
  onSuggestOrder: (supplierId: string) => void;
}) {
  const t = useStockT();
  const [filter, setFilter] = useState<StockFilter>(initialFilter);
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const levels = useStockLevels({ filter, q });
  const items = useMemo(() => (levels.data?.pages ?? []).flatMap((p) => p.items), [levels.data]);
  const tiles = levels.data?.pages[0]?.tiles ?? null;
  const valueCost = stockValueTilePence(tiles?.value_cost_pence);
  const valueRetail = stockValueTilePence(tiles?.value_retail_pence);
  const allowAdjust = canAdjust && levels.data?.pages[0]?.can_adjust !== false;
  const lowSuppliers = useLowStockSuppliers({ enabled: filter === 'low' && canOrder });
  const [adjusting, setAdjusting] = useState<AdjustTarget | null>(null);
  const [history, setHistory] = useState<{ variantId: string; label: string } | null>(null);

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={levels.isRefetching && !levels.isFetchingNextPage} onRefresh={() => void levels.refetch()} />}>
        {tiles ? (
          <View style={styles.tiles}>
            {valueCost !== null ? <StatTile label={t('stock.tile.valueCost')} value={money(valueCost)} style={styles.tile} /> : null}
            {valueRetail !== null ? <StatTile label={t('stock.tile.valueRetail')} value={money(valueRetail)} style={styles.tile} /> : null}
            <StatTile label={t('stock.tile.low')} value={String(tiles.low)} style={styles.tile} />
            <StatTile label={t('stock.tile.out')} value={String(tiles.out)} style={styles.tile} />
          </View>
        ) : null}
        <Segmented
          options={[
            { value: 'all', label: t('stock.filter.all') },
            { value: 'low', label: t('stock.filter.low') },
            { value: 'out', label: t('stock.filter.out') },
            { value: 'negative', label: t('stock.filter.negative') },
          ]}
          value={filter}
          onChange={setFilter}
          wrapLabels
        />
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder={t('stock.search')}
          onClear={() => setSearch('')}
          submitBehavior="submit"
          accessibilityLabel={t('stock.search')}
        />
        {filter === 'low' && canOrder && (lowSuppliers.data ?? []).length > 0 ? (
          <Card>
            <View style={posStyles.stack}>
              <Text variant="label">{t('stock.suggestOrder')}</Text>
              <View style={styles.actions}>
                {(lowSuppliers.data ?? []).map((s) => (
                  <Button
                    key={s.id}
                    label={s.name}
                    size="sm"
                    variant="secondary"
                    accessibilityLabel={t('stock.suggestOrder.from', { supplier: s.name })}
                    onPress={() => onSuggestOrder(s.id)}
                  />
                ))}
              </View>
            </View>
          </Card>
        ) : null}
        {levels.isLoading ? (
          <ListSkeleton />
        ) : levels.isError && items.length === 0 ? (
          <ErrorState message={posErrorMessage(levels.error, t('stock.error'))} onRetry={() => void levels.refetch()} />
        ) : items.length === 0 ? (
          filter !== 'all' || q ? (
            <Text tone="muted">{t('stock.none.filtered')}</Text>
          ) : (
            <EmptyState title={t('stock.empty.title')} message={t('stock.empty.body')} />
          )
        ) : (
          items.map((row) => (
            <LevelRow
              key={row.variant_id}
              row={row}
              canAdjust={allowAdjust}
              onAdjust={() =>
                setAdjusting({ variantId: row.variant_id, label: productLabel(row.product_name, row.option_name), onHand: row.on_hand })
              }
              onHistory={() => setHistory({ variantId: row.variant_id, label: productLabel(row.product_name, row.option_name) })}
            />
          ))
        )}
        {levels.hasNextPage ? (
          <Button
            label={t('app.stock.more')}
            variant="secondary"
            loading={levels.isFetchingNextPage}
            onPress={() => void levels.fetchNextPage()}
            fullWidth
          />
        ) : null}
      </ScrollView>
      <AdjustStockSheet target={adjusting} onClose={() => setAdjusting(null)} />
      <MovementsSheet target={history} timeZone={timeZone} onClose={() => setHistory(null)} />
    </>
  );
}

function LevelRow({
  row,
  canAdjust,
  onAdjust,
  onHistory,
}: {
  row: StockLevelRow;
  canAdjust: boolean;
  onAdjust: () => void;
  onHistory: () => void;
}) {
  const t = useStockT();
  const kind = stockPill(row);
  const pill =
    kind === 'negative'
      ? { label: t('stock.pill.negative'), tone: 'danger' as const }
      : kind === 'out'
        ? { label: t('stock.pill.out'), tone: 'danger' as const }
        : kind === 'low'
          ? { label: t('stock.pill.low'), tone: 'warning' as const }
          : null;
  const detail = [row.option_name, row.sku, row.brand_name].filter(Boolean).join(' · ');
  return (
    <Card>
      <View style={posStyles.stack}>
        <View style={posStyles.row}>
          <View style={styles.flex}>
            <Text variant="label">{row.product_name}</Text>
            {detail ? (
              <Text variant="caption" tone="muted">
                {detail}
              </Text>
            ) : null}
          </View>
          {pill ? <Badge label={pill.label} tone={pill.tone} /> : null}
        </View>
        <View style={styles.grid}>
          <Figure label={t('stock.col.onHand')} value={String(row.on_hand)} strong />
          <Figure label={t('stock.col.reserved')} value={String(row.reserved)} />
          <Figure label={t('stock.col.available')} value={String(row.available)} />
          <Figure
            label={t('stock.col.reorderAt')}
            value={row.reorder_level == null ? t('ss.notSet') : String(row.reorder_level)}
            muted={row.reorder_level == null}
          />
        </View>
        <View style={styles.actions}>
          {canAdjust ? <Button label={t('stock.adjust')} size="sm" variant="secondary" onPress={onAdjust} /> : null}
          <Button label={t('stock.history')} size="sm" variant="ghost" onPress={onHistory} />
        </View>
      </View>
    </Card>
  );
}

function Figure({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <View style={styles.figure}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant={strong ? 'label' : 'bodySmall'} tone={muted ? 'muted' : 'default'}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: '45%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.xs },
  figure: { width: '50%', gap: spacing.xxs },
});
