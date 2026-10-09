import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notice } from '@/components/pos/parts';
import { LevelsTab } from '@/components/retail/LevelsTab';
import { MovementsTab } from '@/components/retail/MovementsTab';
import { OrdersTab } from '@/components/retail/OrdersTab';
import { ProductsTab } from '@/components/retail/ProductsTab';
import { ProfessionalUseTab } from '@/components/retail/ProfessionalUseTab';
import { StockReportsTab } from '@/components/retail/StockReportsTab';
import { StocktakesTab } from '@/components/retail/StocktakesTab';
import { SuppliersTab } from '@/components/retail/SuppliersTab';
import { TabChips } from '@/components/retail/setup-parts';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { ApiError, apiErrorCode } from '@/lib/api/client';
import { posErrorMessage } from '@/lib/pos/api';
import { canPos, isTrackStockOn } from '@/lib/pos/pos-enabled';
import { canRetail } from '@/lib/retail/stock-access';
import { useStockT } from '@/lib/retail/stock-setup-copy';
import { usePosBootstrap, usePosEnabled } from '@/lib/queries/usePos';
import { spacing } from '@/theme/index';
import type { StockFilter } from '@/types/retail';

/**
 * Products and stock in the app (POS app step 4, 2026-10-09 parity with the web's Products and
 * Stock pages), reached from the "Products and stock" tile in More, which exists only at venues
 * with `pos_enabled`.
 *
 * Products (every login; read only without `manage_products`): search, filters, bulk changes,
 * import and export. With Track stock on, the web's Stock tabs follow: Stock levels, Movements,
 * Stocktakes, Purchase orders, Suppliers, Professional use (`record_professional_use`) and Reports
 * (`view_reports`).
 *
 * Deep links: `/stock?tab=<products|levels|movements|stocktakes|orders|suppliers|use|reports>`,
 * with `filter=low` for low stock, `variant_id=` or `product_id=` for one history, and
 * `suggest_supplier=` to start a suggested order.
 */

export type StockTab = 'products' | 'levels' | 'movements' | 'stocktakes' | 'orders' | 'suppliers' | 'use' | 'reports';

const TABS: StockTab[] = ['products', 'levels', 'movements', 'stocktakes', 'orders', 'suppliers', 'use', 'reports'];

function one(v: string | string[] | undefined): string | null {
  return typeof v === 'string' && v ? v : Array.isArray(v) && v[0] ? v[0] : null;
}

function isStockFilter(v: string | null): v is StockFilter {
  return v === 'all' || v === 'low' || v === 'out' || v === 'negative';
}

export default function ProductsAndStockScreen() {
  const t = useStockT();
  const params = useLocalSearchParams<{ tab?: string; filter?: string; variant_id?: string; product_id?: string; suggest_supplier?: string }>();
  const posEnabled = usePosEnabled();
  const boot = usePosBootstrap();
  const wanted = one(params.tab);
  const [tab, setTab] = useState<StockTab>(TABS.includes(wanted as StockTab) ? (wanted as StockTab) : 'products');
  const [suggestSupplier, setSuggestSupplier] = useState<string | null>(one(params.suggest_supplier));
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

  const b = boot.data;
  const trackStock = isTrackStockOn(b);
  const timeZone = b.venue?.timezone ?? 'Europe/London';
  const canUse = canPos(b, 'record_professional_use');
  const canReports = canPos(b, 'view_reports');
  const canExport = canPos(b, 'export');
  const tabs: { value: StockTab; label: string }[] = trackStock
    ? [
        { value: 'products', label: t('prod.title') },
        { value: 'levels', label: t('stock.tab.levels') },
        { value: 'movements', label: t('stock.tab.movements') },
        { value: 'stocktakes', label: t('stock.tab.stocktakes') },
        { value: 'orders', label: t('stock.tab.orders') },
        { value: 'suppliers', label: t('stock.tab.suppliers') },
        ...(canUse ? [{ value: 'use' as const, label: t('stock.tab.use') }] : []),
        ...(canReports ? [{ value: 'reports' as const, label: t('stock.tab.reports') }] : []),
      ]
    : [];
  const shown: StockTab = tabs.some((x) => x.value === tab) ? tab : 'products';
  const variantId = one(params.variant_id);
  const productId = one(params.product_id);
  const filterParam = one(params.filter);

  return (
    <Screen scroll={false} padded={false}>
      {header}
      {tabs.length > 0 ? (
        <View style={styles.tabs}>
          <TabChips tabs={tabs} value={shown} onChange={setTab} />
        </View>
      ) : wanted && wanted !== 'products' && TABS.includes(wanted as StockTab) ? (
        // A link to a Stock tab while Track stock is off: the web's "Stock tracking is off".
        <View style={styles.tabs}>
          <Notice tone="warning">{`${t('feat.stock.off.title')}. ${t('feat.stock.off.body')}`}</Notice>
        </View>
      ) : null}
      {shown === 'products' ? (
        <ProductsTab
          canEdit={canPos(b, 'manage_products')}
          canImport={canRetail(b, 'import_products')}
          canExport={canExport}
          trackStock={trackStock}
        />
      ) : shown === 'levels' ? (
        <LevelsTab
          canAdjust={canPos(b, 'adjust_stock')}
          canOrder={canPos(b, 'manage_purchase_orders')}
          timeZone={timeZone}
          initialFilter={isStockFilter(filterParam) ? filterParam : 'all'}
          onSuggestOrder={(supplierId) => {
            setSuggestSupplier(supplierId);
            setTab('orders');
          }}
        />
      ) : shown === 'movements' ? (
        <MovementsTab canExport={canExport} timeZone={timeZone} initialScope={variantId || productId ? { variantId, productId } : null} />
      ) : shown === 'stocktakes' ? (
        <StocktakesTab canCount={canPos(b, 'count_stock')} timeZone={timeZone} />
      ) : shown === 'orders' ? (
        <OrdersTab
          canManage={canPos(b, 'manage_purchase_orders')}
          suggestSupplierId={suggestSupplier}
          onSuggestDone={() => setSuggestSupplier(null)}
        />
      ) : shown === 'suppliers' ? (
        <SuppliersTab canManage={canPos(b, 'manage_suppliers')} />
      ) : shown === 'use' ? (
        <ProfessionalUseTab canUse={canUse} timeZone={timeZone} />
      ) : (
        <StockReportsTab canExport={canExport} timeZone={timeZone} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { paddingHorizontal: spacing.base, paddingTop: spacing.base },
});
