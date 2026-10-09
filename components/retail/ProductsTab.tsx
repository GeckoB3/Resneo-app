import { Image } from 'expo-image';
import { type Href, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ChoiceChips, money, PosSheet, posStyles } from '@/components/pos/parts';
import { BulkCategorySheet, BulkPriceSheet } from '@/components/retail/BulkSheets';
import { CameraScanner, ScanButton } from '@/components/retail/CameraScanner';
import { NamedChoice, ShareFileButton, SwitchRow } from '@/components/retail/setup-parts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SearchBar } from '@/components/ui/SearchBar';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { EMPTY_FILTERS, filterCount, hasFilters, isLow, priceLabel, stockLabel } from '@/lib/retail/product-list';
import { stockSetupPaths, type ProductListFilters } from '@/lib/retail/stock-setup-paths';
import { useStockT } from '@/lib/retail/stock-setup-copy';
import { useBulkProducts, useNamedList, useProductList } from '@/lib/queries/useStockSetup';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { RetailListProduct } from '@/types/retail';

/**
 * The products list in the app (UX spec §6.1, §6.4), as the web's `ProductsList.tsx`: search on
 * the server as you type (a scanned barcode is searched like a typed one), filters in a sheet
 * (category, brand, supplier and low stock with Track stock on, use, sold online, archived), and
 * for people who can edit products a select mode with bulk price, category and archive changes.
 * `prod.import` (needs `import_products`) opens the import; `prod.export` (needs `export`) shares
 * the CSV. Staff without `manage_products` see it read only.
 */

function useDebounced(value: string, ms = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim()), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export function ProductsTab({
  canEdit,
  canImport,
  canExport,
  trackStock,
}: {
  canEdit: boolean;
  canImport: boolean;
  canExport: boolean;
  trackStock: boolean;
}) {
  const t = useStockT();
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [filters, setFilters] = useState<ProductListFilters>(EMPTY_FILTERS);
  const [sheet, setSheet] = useState(false);
  const [camera, setCamera] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Map<string, RetailListProduct>>(new Map());
  const [dialog, setDialog] = useState<'price' | 'category' | 'archive' | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const applied = useMemo(() => ({ ...filters, q }), [filters, q]);
  const list = useProductList(applied, trackStock);
  const bulk = useBulkProducts();
  const categories = useNamedList('categories');
  const brands = useNamedList('brands');
  const suppliers = useNamedList('suppliers', { enabled: trackStock });
  const items = useMemo(() => (list.data?.pages ?? []).flatMap((p) => p.items), [list.data]);
  const filtered = hasFilters(filters) || q !== '';
  const count = filterCount(filters, trackStock);

  const change = (patch: Partial<ProductListFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const clearFilters = () => {
    setSearch('');
    setFilters(EMPTY_FILTERS);
  };
  const toggle = (p: RetailListProduct) =>
    setSelected((cur) => {
      const next = new Map(cur);
      if (next.has(p.id)) next.delete(p.id);
      else next.set(p.id, p);
      return next;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Map());
  };

  /** Sends one bulk change; answers the server's sentence when it is refused, else null. */
  async function runBulk(body: Record<string, unknown>, done: string): Promise<string | null> {
    setBulkError(null);
    try {
      await bulk.mutateAsync(body);
      toast.success(done);
      setDialog(null);
      stopSelecting();
      return null;
    } catch (e) {
      const sentence = posErrorMessage(e, t('common.networkError'));
      setBulkError(sentence);
      return sentence;
    }
  }

  async function archiveSelected() {
    const ids = [...selected.keys()];
    if (filters.archived) {
      const refused = await runBulk({ op: 'unarchive', product_ids: ids }, t('x.bulk.unarchiveDone'));
      if (refused) toast.error(refused);
      return;
    }
    setDialog('archive');
  }

  const selectedList = [...selected.values()];

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.content, selecting && selected.size > 0 ? styles.withBar : null]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />
        }>
        <Text variant="bodySmall" tone="muted">
          {t('prod.subtitle')}
        </Text>
        <View style={styles.actions}>
          {canEdit ? <Button label={t('prod.add')} onPress={() => router.push('/stock/product/new' as Href)} /> : null}
          {canImport ? <Button label={t('prod.import')} variant="secondary" onPress={() => router.push('/stock/import' as Href)} /> : null}
          {canExport ? (
            <ShareFileButton label={t('prod.export')} path={stockSetupPaths.productsExport(filters.archived)} filename="products.csv" />
          ) : null}
        </View>
        {!canEdit ? (
          <Text variant="bodySmall" tone="muted">
            {t('prod.readOnly')}
          </Text>
        ) : null}
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder={t('prod.search')}
          onClear={() => setSearch('')}
          submitBehavior="submit"
          accessibilityLabel={t('prod.search')}
          right={<ScanButton onPress={() => setCamera(true)} />}
        />
        <CameraScanner visible={camera} onClose={() => setCamera(false)} onScan={(code) => setSearch(code)} />
        <View style={styles.actions}>
          <Button
            label={count > 0 ? `${t('prod.filter.button')} (${count})` : t('prod.filter.button')}
            variant="secondary"
            size="sm"
            onPress={() => setSheet(true)}
          />
          {canEdit ? (
            <Button
              label={selecting ? t('x.selectDone') : t('prod.select')}
              variant={selecting ? 'primary' : 'secondary'}
              size="sm"
              onPress={() => (selecting ? stopSelecting() : setSelecting(true))}
            />
          ) : null}
        </View>
        {selecting && selected.size === 0 ? (
          <Text variant="caption" tone="muted">
            {t('ss.selected.none')}
          </Text>
        ) : null}

        {list.isLoading ? (
          <ListSkeleton />
        ) : list.isError && items.length === 0 ? (
          <ErrorState message={posErrorMessage(list.error, t('prod.error'))} onRetry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          filtered ? (
            <View style={posStyles.stack}>
              <Text tone="muted">{t('prod.none.filtered')}</Text>
              <Button label={t('prod.clearFilters')} variant="secondary" onPress={clearFilters} />
            </View>
          ) : (
            <EmptyState
              title={t('prod.empty.title')}
              message={t('prod.empty.body')}
              actionLabel={canEdit ? t('prod.add') : canImport ? t('prod.import') : undefined}
              onAction={
                canEdit
                  ? () => router.push('/stock/product/new' as Href)
                  : canImport
                    ? () => router.push('/stock/import' as Href)
                    : undefined
              }
            />
          )
        ) : (
          items.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              trackStock={trackStock}
              selecting={selecting}
              selected={selected.has(p.id)}
              onPress={() => (selecting ? toggle(p) : router.push(`/stock/product/${p.id}` as Href))}
            />
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

      {selecting && selected.size > 0 ? (
        <BulkBar
          count={selected.size}
          archived={filters.archived}
          busy={bulk.isPending && dialog === null}
          onPrice={() => {
            setBulkError(null);
            setDialog('price');
          }}
          onCategory={() => {
            setBulkError(null);
            setDialog('category');
          }}
          onArchive={() => void archiveSelected()}
          onClear={() => setSelected(new Map())}
        />
      ) : null}

      <PosSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title={t('prod.filter.button')}
        footer={
          <View style={posStyles.buttons}>
            <Button label={t('x.applyFilters')} onPress={() => setSheet(false)} fullWidth />
            <Button
              label={t('prod.clearFilters')}
              variant="ghost"
              onPress={() => {
                clearFilters();
                setSheet(false);
              }}
              fullWidth
            />
          </View>
        }>
        <NamedChoice
          label={t('prod.filter.category')}
          first={t('x.all')}
          items={categories.data ?? []}
          value={filters.category_id}
          onChange={(category_id) => change({ category_id })}
        />
        <NamedChoice
          label={t('prod.filter.brand')}
          first={t('x.all')}
          items={brands.data ?? []}
          value={filters.brand_id}
          onChange={(brand_id) => change({ brand_id })}
        />
        {trackStock ? (
          <NamedChoice
            label={t('prod.filter.supplier')}
            first={t('x.all')}
            items={suppliers.data ?? []}
            value={filters.supplier_id}
            onChange={(supplier_id) => change({ supplier_id })}
          />
        ) : null}
        <Text variant="label">{t('prod.filter.use')}</Text>
        <ChoiceChips<ProductListFilters['use']>
          options={[
            { value: '', label: t('x.all') },
            { value: 'retail', label: t('prod.use.retail') },
            { value: 'professional', label: t('prod.use.professional') },
            { value: 'both', label: t('prod.use.both') },
          ]}
          value={filters.use}
          onChange={(use) => change({ use })}
        />
        <SwitchRow label={t('prod.filter.online')} value={filters.online} onChange={(online) => change({ online })} />
        {trackStock ? <SwitchRow label={t('prod.filter.low')} value={filters.low} onChange={(low) => change({ low })} /> : null}
        <SwitchRow
          label={t('prod.filter.archived')}
          value={filters.archived}
          onChange={(archived) => {
            change({ archived });
            setSelected(new Map());
          }}
        />
      </PosSheet>

      <BulkPriceSheet
        products={dialog === 'price' ? selectedList : null}
        trackStock={trackStock}
        busy={bulk.isPending}
        error={bulkError}
        onClose={() => setDialog(null)}
        onSubmit={(body) => void runBulk(body, t('x.bulk.priceDone'))}
      />
      <BulkCategorySheet
        count={dialog === 'category' ? selected.size : null}
        categories={categories.data ?? []}
        busy={bulk.isPending}
        error={bulkError}
        onClose={() => setDialog(null)}
        onSubmit={(categoryId) =>
          void runBulk(
            {
              op: 'category',
              product_ids: [...selected.keys()],
              category_id: categoryId,
            },
            t('x.bulk.categoryDone'),
          )
        }
      />
      <ConfirmSheet
        visible={dialog === 'archive'}
        title={t('bulk.archive.title', { count: selected.size })}
        message={bulkError ?? t('bulk.archive.body')}
        confirmLabel={t('prod.bulk.archive')}
        cancelLabel={t('common.cancel')}
        destructive={false}
        loading={bulk.isPending}
        onConfirm={() => {
          void (async () => {
            const refused = await runBulk({ op: 'archive', product_ids: [...selected.keys()] }, t('x.bulk.archiveDone'));
            if (refused) {
              setDialog(null);
              toast.error(refused);
            }
          })();
        }}
        onClose={() => setDialog(null)}
      />
    </View>
  );
}

function BulkBar({
  count,
  archived,
  busy,
  onPrice,
  onCategory,
  onArchive,
  onClear,
}: {
  count: number;
  archived: boolean;
  busy: boolean;
  onPrice: () => void;
  onCategory: () => void;
  onArchive: () => void;
  onClear: () => void;
}) {
  const t = useStockT();
  const { colors } = useTheme();
  return (
    <View
      style={[styles.bar, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
      accessibilityLabel={t('prod.bulk.selected', { count })}>
      <Text variant="label">{t('prod.bulk.selected', { count })}</Text>
      <View style={styles.actions}>
        <Button label={t('prod.bulk.price')} size="sm" variant="secondary" onPress={onPrice} />
        <Button label={t('prod.bulk.category')} size="sm" variant="secondary" onPress={onCategory} />
        <Button
          label={archived ? t('prod.unarchive') : t('prod.bulk.archive')}
          size="sm"
          variant="secondary"
          loading={busy}
          onPress={onArchive}
        />
        <Button label={t('x.clearSelection')} size="sm" variant="ghost" onPress={onClear} />
      </View>
    </View>
  );
}

function ProductRow({
  product,
  trackStock,
  selecting,
  selected,
  onPress,
}: {
  product: RetailListProduct;
  trackStock: boolean;
  selecting: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useStockT();
  const { colors } = useTheme();
  const stock = trackStock ? stockLabel(product, t) : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityState={selecting ? { checked: selected } : undefined}
      accessibilityLabel={selecting ? t('x.selectRow', { product: product.name }) : product.name}
      style={({ pressed }) => (pressed ? styles.pressed : null)}>
      <Card style={selected ? { borderColor: colors.brand, backgroundColor: colors.brandSubtle } : undefined}>
        <View style={styles.row}>
          {product.main_photo_url ? (
            <Image source={{ uri: product.main_photo_url }} style={[styles.photo, { borderColor: colors.border }]} contentFit="cover" />
          ) : (
            <View style={[styles.photo, styles.photoEmpty, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <SymbolView
                name={{ ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' }}
                tintColor={colors.textMuted}
                size={22}
              />
            </View>
          )}
          <View style={styles.flex}>
            <View style={posStyles.row}>
              <Text variant="label" style={styles.flex}>
                {product.name}
              </Text>
              <Text variant="label">{priceLabel(product, money, t)}</Text>
            </View>
            <Text variant="caption" tone="muted">
              {[
                product.brand_name,
                product.variants.length > 1 ? t('prod.row.options', { count: product.variants.length }) : null,
                product.category_name,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <View style={styles.chips}>
              {stock ? <Badge label={stock.text} tone={stock.tone === 'out' ? 'danger' : 'neutral'} /> : null}
              {product.sold_online ? <Badge label={t('prod.pill.online')} tone="accent" /> : null}
              {product.usage === 'professional' ? <Badge label={t('prod.pill.backbar')} /> : null}
              {trackStock && isLow(product) ? <Badge label={t('prod.pill.low')} tone="warning" /> : null}
              {product.archived_at ? <Badge label={t('prod.pill.archived')} /> : null}
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.9 },
  content: {
    padding: spacing.base,
    gap: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  withBar: { paddingBottom: 200 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  photo: { width: 48, height: 48, borderRadius: radius.md, borderWidth: 1 },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    padding: spacing.base,
    gap: spacing.sm,
  },
});
