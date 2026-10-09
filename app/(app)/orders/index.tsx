import { type Href, Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ChoiceChips, ErrorLine, money, posStyles, usePosT } from '@/components/pos/parts';
import { CameraScanner, cameraScanAvailable, ScanButton } from '@/components/retail/CameraScanner';
import { PackingSlipBar } from '@/components/shop/PackingSlipBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { SearchBar } from '@/components/ui/SearchBar';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { canPos } from '@/lib/pos/pos-enabled';
import { PICKUP_BARCODE_TYPES } from '@/lib/retail/scan';
import { shortWhen } from '@/lib/retail/stock-words';
import { normalisePickupCode, orderStatusLabel, orderStatusTone, relativeTime } from '@/lib/shop/order-words';
import { canPrintPackingSlip, PACKING_SLIP_LIMIT, type SlipOrder } from '@/lib/shop/packing-slips';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { lookupOrderByPickupCode, useShopOrders } from '@/lib/queries/useOrders';
import { usePosBootstrap, usePosEnabled } from '@/lib/queries/usePos';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { OrderTab, ShopOrderRow } from '@/types/shop';

/**
 * Orders in the app (POS app step 5, plan P7-16; UX spec §8.1, §13.7), from the Orders tile in More
 * and the `shop_order_new` push. For admins and staff with `manage_orders`; the routes stay open
 * with the shop switch off, so paid orders can still be fulfilled.
 *
 * Tabs with counts (to do, ready to collect, sent, done, cancelled, all), a search by order number,
 * name or email, and a pickup code typed or scanned from the customer's QR code, which opens the
 * order with the code already filled in. The list is read every minute and when the app comes back.
 *
 * "Select" in the header turns on select mode, as on the web: tap orders to tick them (cancelled
 * orders have no slip, and at most 50 at once), then "Print packing slips" in the bar at the bottom
 * shares each order's slip PDF in turn (`PackingSlipBar`). Ticks hold across tabs; "Done" ends it.
 */

const TABS: OrderTab[] = ['todo', 'ready', 'sent', 'done', 'cancelled', 'all'];

function useDebounced(value: string, ms = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim()), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export default function OrdersScreen() {
  const t = usePosT();
  const router = useRouter();
  const posEnabled = usePosEnabled();
  const boot = usePosBootstrap();
  const accessToken = useAccessToken();
  const [tab, setTab] = useState<OrderTab>('todo');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const canManage = canPos(boot.data, 'manage_orders');
  const list = useShopOrders({ tab, q }, { enabled: canManage });
  const [code, setCode] = useState('');
  const [finding, setFinding] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const toast = useToast();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Map<string, SlipOrder>>(() => new Map());
  const rows = useMemo(() => (list.data?.pages ?? []).flatMap((p) => p.orders), [list.data]);
  // An order cancelled since it was ticked drops out of the print.
  const selectedOrders = useMemo(() => {
    const cancelled = new Set(rows.filter((o) => !canPrintPackingSlip(o)).map((o) => o.id));
    return [...selected.values()].filter((o) => !cancelled.has(o.id));
  }, [rows, selected]);
  const showSelect = posEnabled && !boot.isLoading && canManage;
  const header = (
    <Stack.Screen
      options={{
        headerShown: true,
        title: t('ord.title'),
        headerRight: showSelect
          ? () => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={selecting ? t('ord.bulk.cancel') : t('ord.bulk.select')}
                hitSlop={8}
                onPress={() => {
                  setSelecting((on) => !on);
                  setSelected(new Map());
                }}>
                <Text variant="label" tone="brand">
                  {selecting ? t('ord.bulk.cancel') : t('ord.bulk.select')}
                </Text>
              </Pressable>
            )
          : undefined,
      }}
    />
  );

  function toggle(o: ShopOrderRow) {
    if (selected.has(o.id)) {
      const next = new Map(selected);
      next.delete(o.id);
      setSelected(next);
      return;
    }
    if (!canPrintPackingSlip(o)) {
      toast.info(t('app.ord.bulk.cancelled'));
      return;
    }
    if (selectedOrders.length >= PACKING_SLIP_LIMIT) {
      toast.info(t('app.ord.bulk.limit', { max: PACKING_SLIP_LIMIT }));
      return;
    }
    setSelected(new Map(selected).set(o.id, { id: o.id, number: o.number }));
  }
  const counts = list.data?.pages[0]?.counts ?? null;
  const timeZone = list.data?.pages[0]?.venue.timezone ?? boot.data?.venue?.timezone ?? 'Europe/London';

  async function find(raw: string) {
    const c = normalisePickupCode(raw);
    if (c.length !== 6 || !accessToken) return;
    setFinding(true);
    setLookupError(null);
    try {
      const id = await lookupOrderByPickupCode(accessToken, c);
      setCode('');
      router.push(`/orders/${id}?code=${encodeURIComponent(c)}` as Href);
    } catch (e) {
      setLookupError(posErrorMessage(e, t('ord.lookup.none')));
    } finally {
      setFinding(false);
    }
  }

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
  if (!canManage) {
    return (
      <Screen>
        {header}
        <EmptyState title={t('ord.denied.title')} message={t('ord.denied.body', { venue: boot.data?.venue?.name ?? 'your venue' })} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />}>
        <Text variant="bodySmall" tone="muted">
          {t('ord.subtitle')}
        </Text>
        <View style={posStyles.row}>
          <Input
            label={t('ord.lookup')}
            accessibilityLabel={t('ord.lookup')}
            value={code}
            onChangeText={(v) => {
              setCode(v);
              setLookupError(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            maxLength={12}
            onSubmitEditing={() => void find(code)}
            containerStyle={styles.flex}
            rightSlot={cameraScanAvailable ? <ScanButton label={t('app.scan.pickup')} onPress={() => setCamera(true)} /> : undefined}
          />
        </View>
        <Button
          label={t('ord.lookup.find')}
          size="sm"
          variant="secondary"
          loading={finding}
          disabled={normalisePickupCode(code).length !== 6 || finding}
          onPress={() => void find(code)}
        />
        <ErrorLine message={lookupError} />
        <CameraScanner
          visible={camera}
          title={t('app.scan.pickup')}
          barcodeTypes={PICKUP_BARCODE_TYPES}
          onClose={() => setCamera(false)}
          onScan={(scanned) => {
            setCode(normalisePickupCode(scanned));
            void find(scanned);
          }}
        />
        <SearchBar value={search} onChangeText={setSearch} placeholder={t('ord.search')} accessibilityLabel={t('ord.search')} onClear={() => setSearch('')} />
        <ChoiceChips
          options={TABS.map((x) => ({ value: x, label: counts ? `${t(`ord.tab.${x}`)} (${counts[x] ?? 0})` : t(`ord.tab.${x}`) }))}
          value={tab}
          onChange={setTab}
        />
        {list.isLoading ? (
          <ListSkeleton />
        ) : list.isError ? (
          <ErrorState message={posErrorMessage(list.error, t('ord.error'))} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          q ? (
            <Text tone="muted">{t('ord.empty.filtered')}</Text>
          ) : tab === 'todo' ? (
            <Text tone="muted">{t('ord.empty.todo')}</Text>
          ) : (
            <EmptyState title={t('ord.empty.title')} message={t('ord.empty.body')} />
          )
        ) : (
          rows.map((o) => (
            <OrderRowCard
              key={o.id}
              row={o}
              timeZone={timeZone}
              selection={selecting ? { checked: selected.has(o.id), eligible: canPrintPackingSlip(o) } : undefined}
              onPress={() => (selecting ? toggle(o) : router.push(`/orders/${o.id}` as Href))}
            />
          ))
        )}
        {list.hasNextPage ? (
          <Button label={t('ord.loadMore')} variant="secondary" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} fullWidth />
        ) : null}
      </ScrollView>
      {selecting ? <PackingSlipBar selected={selectedOrders} accessToken={accessToken} /> : null}
    </Screen>
  );
}

function OrderRowCard({
  row,
  timeZone,
  onPress,
  selection,
}: {
  row: ShopOrderRow;
  timeZone: string;
  onPress: () => void;
  /** Set in select mode: whether the row is ticked, and whether it can be (a cancelled order cannot). */
  selection?: { checked: boolean; eligible: boolean };
}) {
  const t = usePosT();
  const { colors } = useTheme();
  const f = row.flags;
  const label = t('ord.row.number', { orderNo: row.number });
  const body = (
    <View style={posStyles.stack}>
      <View style={posStyles.row}>
        {selection ? (
          <View
            style={[
              styles.tick,
              {
                backgroundColor: selection.checked ? colors.brand : colors.surface,
                borderColor: selection.checked ? colors.brand : colors.borderStrong,
                opacity: selection.eligible ? 1 : 0.4,
              },
            ]}>
            {selection.checked ? (
              <Text variant="caption" color={colors.onBrand} style={styles.tickMark}>
                ✓
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={styles.flex}>
          <Text variant="label">{`${t('ord.row.number', { orderNo: row.number })} · ${row.customer_name}`}</Text>
          <Text variant="caption" tone="muted">
            {[t('ord.row.items', { count: row.item_count }), t('ord.row.placed', { relative: relativeTime(row.created_at) })].join(' · ')}
          </Text>
        </View>
        <Text variant="label">{money(row.total_pence)}</Text>
      </View>
      <View style={styles.chips}>
        <Badge label={orderStatusLabel(row.fulfilment_status, t)} tone={orderStatusTone(row.fulfilment_status)} />
        <Badge label={row.fulfilment_type === 'delivery' ? t('ord.type.delivery') : t('ord.type.collection')} />
        {f.past_hold_since ? <Badge label={t('ord.flag.pastHold', { shortDate: shortWhen(f.past_hold_since, timeZone) })} tone="warning" /> : null}
        {f.return_recorded ? <Badge label={t('ord.flag.return')} tone="warning" /> : null}
        {f.refund_due_by ? <Badge label={t('ord.flag.refundDue', { shortDate: shortWhen(f.refund_due_by, timeZone) })} tone="danger" /> : null}
        {f.refund_status === 'full' ? <Badge label={t('ord.flag.refunded')} /> : null}
        {f.refund_status === 'partial' ? <Badge label={t('ord.flag.partRefunded')} /> : null}
      </View>
    </View>
  );
  if (selection) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selection.checked, disabled: !selection.eligible }}
        accessibilityLabel={label}>
        <Card
          style={[
            selection.checked ? { borderColor: colors.brand, backgroundColor: colors.brandSubtle } : null,
            !selection.eligible ? styles.dimmed : null,
          ]}>
          {body}
        </Card>
      </Pressable>
    );
  }
  return (
    <Card onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {body}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tickMark: { lineHeight: 14 },
  dimmed: { opacity: 0.6 },
});
