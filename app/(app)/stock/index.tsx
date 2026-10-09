import { type Href, Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ChoiceChips, money, posStyles, usePosT } from '@/components/pos/parts';
import { CameraScanner, ScanButton } from '@/components/retail/CameraScanner';
import { NewOrderSheet, SuppliersSheet, UseStockSheet } from '@/components/retail/PurchasingSheets';
import { AdjustStockSheet, MovementsSheet, StartStocktakeSheet, type AdjustTarget } from '@/components/retail/StockSheets';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { SearchBar } from '@/components/ui/SearchBar';
import { Segmented } from '@/components/ui/Segmented';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { ApiError, apiErrorCode } from '@/lib/api/client';
import { posErrorMessage } from '@/lib/pos/api';
import { canPos, isTrackStockOn } from '@/lib/pos/pos-enabled';
import { productLabel, shortWhen, stockValueTilePence, stocktakeStatusId } from '@/lib/retail/stock-words';
import { usePosBootstrap, usePosEnabled } from '@/lib/queries/usePos';
import { usePurchaseOrders } from '@/lib/queries/usePurchasing';
import { useRetailProducts, useStockLevels, useStocktakes } from '@/lib/queries/useRetail';
import { poStatusId, poStatusTone } from '@/lib/retail/purchasing';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import type { RetailListProduct, StockFilter, StockLevelRow, StocktakeRow } from '@/types/retail';

/**
 * Products and stock in the app (POS app step 4, POS plan P7-12, P7-13; UX spec §6.1, §6.7, §6.8,
 * §6.11, §13.6), reached from the "Products and stock" tile in More, which exists only at venues
 * with `pos_enabled`.
 *
 * - Products: search by name, brand, SKU or barcode (a keyboard-mode scanner types into the field),
 *   live or archived, low stock; each row opens the product. Staff without `manage_products` see the
 *   list read only (`prod.readOnly`).
 * - Stock levels (Track stock on): the tiles, all, low, out or below zero, each counted option with
 *   what is in stock, held for online orders and available; Adjust (`adjust_stock`) and History.
 * - Stocktakes (Track stock on): the list, and Start (`count_stock`).
 */

type Tab = 'products' | 'levels' | 'stocktakes' | 'orders';

function useDebounced(value: string, ms = 250): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim()), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export default function ProductsAndStockScreen() {
  const t = usePosT();
  const posEnabled = usePosEnabled();
  const boot = usePosBootstrap();
  const [tab, setTab] = useState<Tab>('products');
  const [using, setUsing] = useState(false);
  const header = <Stack.Screen options={{ headerShown: true, title: t('app.tile.stock') }} />;

  if (!posEnabled) {
    return (
      <Screen>
        {header}
        <EmptyState title={t('till.off.title')} message={t('till.off.body', { venue: 'your venue' })} />
      </Screen>
    );
  }
  if (boot.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <ListSkeleton />
      </Screen>
    );
  }
  if (boot.isError || !boot.data) {
    const off = boot.error instanceof ApiError && apiErrorCode(boot.error) === 'feature_disabled';
    return (
      <Screen>
        {header}
        {off ? (
          <EmptyState title={t('till.off.title')} message={t('till.off.body', { venue: 'your venue' })} />
        ) : (
          <ErrorState
            title={t('prod.error')}
            message={posErrorMessage(boot.error, t('common.networkError'))}
            onRetry={() => void boot.refetch()}
          />
        )}
      </Screen>
    );
  }

  const trackStock = isTrackStockOn(boot.data);
  const timeZone = boot.data.venue?.timezone ?? 'Europe/London';
  const shown: Tab = trackStock ? tab : 'products';
  const canUse = trackStock && canPos(boot.data, 'record_professional_use');

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <View style={styles.tabs}>
        {trackStock ? (
          <Segmented
            options={[
              { value: 'products', label: t('prod.title') },
              { value: 'levels', label: t('stock.tab.levels') },
              { value: 'stocktakes', label: t('stock.tab.stocktakes') },
              { value: 'orders', label: t('app.po.tab') },
            ]}
            value={shown}
            onChange={setTab}
            wrapLabels
          />
        ) : null}
        {canUse ? <Button label={t('use.open')} variant="secondary" size="sm" onPress={() => setUsing(true)} /> : null}
      </View>
      <UseStockSheet visible={using} timeZone={timeZone} onClose={() => setUsing(false)} />
      {shown === 'products' ? (
        <ProductsTab canEdit={canPos(boot.data, 'manage_products')} trackStock={trackStock} />
      ) : shown === 'levels' ? (
        <LevelsTab canAdjust={canPos(boot.data, 'adjust_stock')} timeZone={timeZone} />
      ) : shown === 'orders' ? (
        <OrdersTab canManage={canPos(boot.data, 'manage_purchase_orders')} timeZone={timeZone} />
      ) : (
        <StocktakesTab canCount={canPos(boot.data, 'count_stock')} timeZone={timeZone} />
      )}
    </Screen>
  );
}

// ─── Products ───────────────────────────────────────────────────────────────

function ProductsTab({ canEdit, trackStock }: { canEdit: boolean; trackStock: boolean }) {
  const t = usePosT();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [filter, setFilter] = useState<'live' | 'low' | 'archived'>('live');
  const [camera, setCamera] = useState(false);
  const list = useRetailProducts({ q, archived: filter === 'archived' ? 'archived' : 'live', low: filter === 'low' });
  const items = useMemo(() => (list.data?.pages ?? []).flatMap((p) => p.items), [list.data]);
  const filtered = Boolean(q) || filter !== 'live';

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />}>
      {canEdit ? (
        <Button label={t('prod.add')} onPress={() => router.push('/stock/product/new' as Href)} fullWidth />
      ) : (
        <Text variant="bodySmall" tone="muted">
          {t('prod.readOnly')}
        </Text>
      )}
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder={t('prod.search')}
        onClear={() => setSearch('')}
        submitBehavior="submit"
        accessibilityLabel={t('prod.search')}
        right={<ScanButton onPress={() => setCamera(true)} />}
      />
      {/* A scanned barcode is searched like a typed one: the products route matches it exactly. */}
      <CameraScanner visible={camera} onClose={() => setCamera(false)} onScan={(code) => setSearch(code)} />
      <ChoiceChips
        options={[
          { value: 'live', label: t('stock.filter.all') },
          ...(trackStock ? [{ value: 'low' as const, label: t('prod.filter.low') }] : []),
          { value: 'archived', label: t('prod.filter.archived') },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {list.isLoading ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState message={posErrorMessage(list.error, t('prod.error'))} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        filtered ? (
          <View style={posStyles.stack}>
            <Text tone="muted">{t('prod.none.filtered')}</Text>
            <Button
              label={t('prod.clearFilters')}
              variant="ghost"
              onPress={() => {
                setSearch('');
                setFilter('live');
              }}
            />
          </View>
        ) : (
          <EmptyState title={t('prod.empty.title')} message={t('prod.empty.body')} />
        )
      ) : (
        items.map((p) => (
          <ProductRow key={p.id} product={p} trackStock={trackStock} onPress={() => router.push(`/stock/product/${p.id}` as Href)} />
        ))
      )}
      {list.hasNextPage ? (
        <Button
          label={t('app.stock.more')}
          variant="secondary"
          loading={list.isFetchingNextPage}
          onPress={() => void list.fetchNextPage()}
          fullWidth
        />
      ) : null}
    </ScrollView>
  );
}

function ProductRow({ product, trackStock, onPress }: { product: RetailListProduct; trackStock: boolean; onPress: () => void }) {
  const t = usePosT();
  const prices = product.variants.map((v) => v.price_pence);
  const min = prices.length ? Math.min(...prices) : null;
  const price =
    min === null ? '' : prices.length > 1 && min !== Math.max(...prices) ? t('prod.row.from', { amount: money(min) }) : money(min);
  const counted = product.variants.filter((v) => v.track_stock);
  const stock = !trackStock
    ? null
    : counted.length === 0
      ? t('prod.row.notTracked')
      : (() => {
          const onHand = counted.reduce((n, v) => n + v.on_hand, 0);
          return onHand <= 0 ? t('prod.row.out') : t('prod.row.stock', { count: onHand });
        })();
  const low = trackStock && counted.some((v) => v.reorder_level != null && v.on_hand <= v.reorder_level);
  return (
    <Card onPress={onPress} accessibilityRole="button" accessibilityLabel={product.name}>
      <View style={posStyles.stack}>
        <View style={posStyles.row}>
          <View style={styles.flex}>
            <Text variant="label">{product.name}</Text>
            <Text variant="caption" tone="muted">
              {[
                product.brand_name,
                product.variants.length > 1 ? t('prod.row.options', { count: product.variants.length }) : null,
                product.category_name,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Text variant="label">{price}</Text>
        </View>
        <View style={styles.chips}>
          {stock ? <Badge label={stock} tone={stock === t('prod.row.out') ? 'danger' : 'neutral'} /> : null}
          {product.sold_online ? <Badge label={t('prod.pill.online')} /> : null}
          {product.usage === 'professional' ? <Badge label={t('prod.pill.backbar')} /> : null}
          {low ? <Badge label={t('prod.pill.low')} tone="warning" /> : null}
          {product.archived_at ? <Badge label={t('prod.pill.archived')} /> : null}
        </View>
      </View>
    </Card>
  );
}

// ─── Stock levels ───────────────────────────────────────────────────────────

function LevelsTab({ canAdjust, timeZone }: { canAdjust: boolean; timeZone: string }) {
  const t = usePosT();
  const [filter, setFilter] = useState<StockFilter>('all');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const levels = useStockLevels({ filter, q });
  const items = useMemo(() => (levels.data?.pages ?? []).flatMap((p) => p.items), [levels.data]);
  const tiles = levels.data?.pages[0]?.tiles ?? null;
  // Null for staff without view_reports: no tile at all, never a value of nothing.
  const valueCost = stockValueTilePence(tiles?.value_cost_pence);
  const allowAdjust = canAdjust && levels.data?.pages[0]?.can_adjust !== false;
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
        {levels.isLoading ? (
          <ListSkeleton />
        ) : levels.isError ? (
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
  const t = usePosT();
  const pill =
    row.on_hand < 0
      ? { label: t('stock.pill.negative'), tone: 'danger' as const }
      : row.available <= 0
        ? { label: t('stock.pill.out'), tone: 'danger' as const }
        : row.reorder_level != null && row.on_hand <= row.reorder_level
          ? { label: t('stock.pill.low'), tone: 'warning' as const }
          : null;
  return (
    <Card>
      <View style={posStyles.stack}>
        <View style={posStyles.row}>
          <View style={styles.flex}>
            <Text variant="label">{productLabel(row.product_name, row.option_name)}</Text>
            <Text variant="caption" tone="muted">
              {[
                `${t('stock.col.onHand')}: ${row.on_hand}`,
                row.reserved ? `${t('stock.col.reserved')}: ${row.reserved}` : null,
                `${t('stock.col.available')}: ${row.available}`,
                row.reorder_level != null ? `${t('stock.col.reorderAt')}: ${row.reorder_level}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          {pill ? <Badge label={pill.label} tone={pill.tone} /> : null}
        </View>
        <View style={styles.actions}>
          {canAdjust ? <Button label={t('stock.adjust')} size="sm" variant="secondary" onPress={onAdjust} /> : null}
          <Button label={t('stock.history')} size="sm" variant="ghost" onPress={onHistory} />
        </View>
      </View>
    </Card>
  );
}

// ─── Purchase orders (app step 4b) ──────────────────────────────────────────

type OrderFilter = 'open' | 'all' | 'received' | 'cancelled';

function OrdersTab({ canManage, timeZone }: { canManage: boolean; timeZone: string }) {
  const t = usePosT();
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<OrderFilter>('open');
  const [creating, setCreating] = useState(false);
  const [suppliers, setSuppliers] = useState(false);
  const list = usePurchaseOrders(filter);
  const items = useMemo(() => (list.data?.pages ?? []).flatMap((p) => p.items), [list.data]);
  const allowNew = canManage && list.data?.pages[0]?.can_manage !== false;

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />}>
        <View style={styles.actions}>
          {allowNew ? <Button label={t('po.new')} onPress={() => setCreating(true)} /> : null}
          <Button label={t('app.po.suppliers')} variant="secondary" onPress={() => setSuppliers(true)} />
        </View>
        <ChoiceChips
          options={[
            { value: 'open', label: t('po.filter.open') },
            { value: 'received', label: t('po.filter.received') },
            { value: 'cancelled', label: t('po.filter.cancelled') },
            { value: 'all', label: t('po.filter.all') },
          ]}
          value={filter}
          onChange={setFilter}
        />
        {list.isLoading ? (
          <ListSkeleton />
        ) : list.isError ? (
          <ErrorState message={posErrorMessage(list.error, t('po.list.error'))} onRetry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState title={t('po.empty.title')} message={t('po.empty.body')} />
        ) : (
          items.map((o) => (
            <Card key={o.id} onPress={() => router.push(`/stock/purchase-order/${o.id}` as Href)} accessibilityRole="button" accessibilityLabel={t('app.po.row', { poNumber: o.number })}>
              <View style={posStyles.stack}>
                <View style={posStyles.row}>
                  <View style={styles.flex}>
                    <Text variant="label">{`${t('app.po.row', { poNumber: o.number })} · ${o.supplier_name}`}</Text>
                    <Text variant="caption" tone="muted">
                      {[
                        t('app.po.units', { received: o.received_units, ordered: o.ordered_units }),
                        o.expected_on ? t('app.po.expected', { date: shortWhen(`${o.expected_on}T12:00:00Z`, timeZone) }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Text variant="label">{money(o.total_cost_pence)}</Text>
                </View>
                <View style={styles.chips}>
                  <Badge label={t(poStatusId(o.status))} tone={poStatusTone(o.status)} />
                </View>
              </View>
            </Card>
          ))
        )}
        {list.hasNextPage ? (
          <Button label={t('app.stock.more')} variant="secondary" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} fullWidth />
        ) : null}
      </ScrollView>
      <NewOrderSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={(id, message) => {
          setCreating(false);
          if (message) toast.info(message);
          router.push(`/stock/purchase-order/${id}` as Href);
        }}
      />
      <SuppliersSheet visible={suppliers} onClose={() => setSuppliers(false)} />
    </>
  );
}

// ─── Stocktakes ─────────────────────────────────────────────────────────────

function StocktakesTab({ canCount, timeZone }: { canCount: boolean; timeZone: string }) {
  const t = usePosT();
  const router = useRouter();
  const list = useStocktakes();
  const [starting, setStarting] = useState(false);
  const allowStart = canCount && list.data?.can_count !== false;
  const rows = list.data?.stocktakes ?? [];

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}>
        {allowStart ? <Button label={t('take.start')} onPress={() => setStarting(true)} fullWidth /> : null}
        {list.isLoading ? (
          <ListSkeleton />
        ) : list.isError ? (
          <ErrorState message={posErrorMessage(list.error, t('take.list.error'))} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title={t('take.empty.title')} message={t('take.empty.body')} />
        ) : (
          rows.map((r) => (
            <StocktakeCard key={r.id} row={r} timeZone={timeZone} onPress={() => router.push(`/stock/stocktake/${r.id}` as Href)} />
          ))
        )}
      </ScrollView>
      <StartStocktakeSheet
        visible={starting}
        timeZone={timeZone}
        onClose={() => setStarting(false)}
        onStarted={(id) => {
          setStarting(false);
          router.push(`/stock/stocktake/${id}` as Href);
        }}
      />
    </>
  );
}

function StocktakeCard({ row, timeZone, onPress }: { row: StocktakeRow; timeZone: string; onPress: () => void }) {
  const t = usePosT();
  const tone = row.status === 'committed' ? 'success' : row.status === 'review' ? 'warning' : row.status === 'counting' ? 'accent' : 'neutral';
  return (
    <Card onPress={onPress} accessibilityRole="button" accessibilityLabel={row.name}>
      <View style={posStyles.stack}>
        <View style={posStyles.row}>
          <View style={styles.flex}>
            <Text variant="label">{row.name}</Text>
            <Text variant="caption" tone="muted">
              {[
                t('mov.ref.stocktake', { number: row.number }),
                row.scope?.type === 'partial' ? t('take.scope.partial') : t('take.scope.full'),
                t('take.startedBy', { name: row.started_by_name ?? 'your team', date: shortWhen(row.started_at, timeZone) }),
              ].join(' · ')}
            </Text>
          </View>
          <Badge label={t(stocktakeStatusId(row.status))} tone={tone} />
        </View>
        {row.status === 'committed' && row.variance_value_pence != null ? (
          <Text variant="bodySmall">{t('take.variance', { amount: money(Math.round(row.variance_value_pence)) })}</Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  tabs: { paddingHorizontal: spacing.base, paddingTop: spacing.base, gap: spacing.sm },
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1 },
});
