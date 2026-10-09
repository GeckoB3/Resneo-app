import { type Href, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ChoiceChips, money, posStyles } from '@/components/pos/parts';
import { NewOrderSheet } from '@/components/retail/PurchasingSheets';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { poStatusId, poStatusTone } from '@/lib/retail/purchasing';
import { shortYmd } from '@/lib/retail/report-dates';
import { useStockT } from '@/lib/retail/stock-setup-copy';
import { usePurchaseOrders } from '@/lib/queries/usePurchasing';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

/**
 * The Purchase orders tab (UX spec §6.13 List), as the web's `PurchaseOrdersTab.tsx`: number,
 * supplier, status, expected date and total at cost, filtered by All, Open, Received or Cancelled,
 * newest first. `po.new` (needs `manage_purchase_orders`) opens the new order sheet; Low stock's
 * "Suggest an order" opens it with that supplier chosen (`suggestSupplierId`). Without the
 * capability, `po.readOnly`: staff can still receive deliveries.
 */

type OrderFilter = 'all' | 'open' | 'received' | 'cancelled';

export function OrdersTab({
  canManage,
  suggestSupplierId,
  onSuggestDone,
}: {
  canManage: boolean;
  suggestSupplierId?: string | null;
  onSuggestDone?: () => void;
}) {
  const t = useStockT();
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [creating, setCreating] = useState(false);
  const list = usePurchaseOrders(filter);
  const items = useMemo(() => (list.data?.pages ?? []).flatMap((p) => p.items), [list.data]);
  const allowNew = canManage && list.data?.pages[0]?.can_manage !== false;
  const sheetOpen = canManage && (creating || Boolean(suggestSupplierId));

  const close = () => {
    setCreating(false);
    if (suggestSupplierId) onSuggestDone?.();
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />}>
        {allowNew ? <Button label={t('po.new')} onPress={() => setCreating(true)} fullWidth /> : null}
        {!canManage ? (
          <Text variant="bodySmall" tone="muted">
            {t('po.readOnly')}
          </Text>
        ) : null}
        <ChoiceChips<OrderFilter>
          options={[
            { value: 'all', label: t('po.filter.all') },
            { value: 'open', label: t('po.filter.open') },
            { value: 'received', label: t('po.filter.received') },
            { value: 'cancelled', label: t('po.filter.cancelled') },
          ]}
          value={filter}
          onChange={setFilter}
        />
        {list.isLoading ? (
          <ListSkeleton />
        ) : list.isError && items.length === 0 ? (
          <ErrorState message={posErrorMessage(list.error, t('po.list.error'))} onRetry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          filter === 'all' ? (
            <EmptyState title={t('po.empty.title')} message={t('po.empty.body')} />
          ) : (
            <Text tone="muted">{t('stock.none.filtered')}</Text>
          )
        ) : (
          items.map((o) => (
            <Pressable
              key={o.id}
              onPress={() => router.push(`/stock/purchase-order/${o.id}` as Href)}
              accessibilityRole="button"
              accessibilityLabel={t('po.title', { poNumber: o.number })}>
              <Card>
                <View style={posStyles.stack}>
                  <View style={posStyles.row}>
                    <View style={styles.flex}>
                      <Text variant="label">{t('po.title', { poNumber: o.number })}</Text>
                      <Text variant="caption" tone="muted">
                        {o.supplier_name}
                      </Text>
                    </View>
                    <Badge label={t(poStatusId(o.status))} tone={poStatusTone(o.status)} />
                  </View>
                  <View style={posStyles.row}>
                    <Text variant="bodySmall" tone="muted" style={styles.flex}>
                      {[
                        o.expected_on ? `${t('app.po.expected', { date: shortYmd(o.expected_on) })}` : null,
                        t('app.po.units', { received: o.received_units, ordered: o.ordered_units }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    <Text variant="label">{money(Math.round(Number(o.total_cost_pence)))}</Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          ))
        )}
        {list.hasNextPage ? (
          <Button label={t('app.stock.more')} variant="secondary" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} fullWidth />
        ) : null}
      </ScrollView>
      <NewOrderSheet
        visible={sheetOpen}
        initialSupplierId={suggestSupplierId ?? null}
        onClose={close}
        onCreated={(id, message) => {
          close();
          if (message) toast.info(message);
          router.push(`/stock/purchase-order/${id}` as Href);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  flex: { flex: 1 },
});
