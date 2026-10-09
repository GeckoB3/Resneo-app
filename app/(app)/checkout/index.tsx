import { format, parseISO } from 'date-fns';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { money, posStyles, usePosT } from '@/components/pos/parts';
import { saleHref, useOpenCheckout } from '@/components/pos/useOpenCheckout';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { SearchBar } from '@/components/ui/SearchBar';
import { Segmented } from '@/components/ui/Segmented';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError, apiErrorCode } from '@/lib/api/client';
import { canPos } from '@/lib/pos/pos-enabled';
import { saleStatusCopyId } from '@/lib/pos/sale-math';
import {
  myFigures,
  usePosBootstrap,
  usePosEnabled,
  usePosQueue,
  usePosReportAccess,
  usePosSaleList,
  useSalesReport,
  useTakingsReport,
} from '@/lib/queries/usePos';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { spacing } from '@/theme/index';
import type { PosQueueRow, PosSaleListRow } from '@/types/pos';

/**
 * Checkout home in the app (POS app step 1, UX spec §13.3 "Checkout home"): who is ready to check
 * out, open and parked sales, all sales with a search, a new blank sale, and the person's own
 * sales and tips. Reached from the Checkout tile in More, which exists only when the venue's
 * `pos_enabled` is on; a deep link at a venue without POS shows `till.off` and loads nothing.
 */

type Tab = 'queue' | 'open' | 'all';

function timeOf(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'HH:mm');
  } catch {
    return '';
  }
}

export default function CheckoutHomeScreen() {
  const t = usePosT();
  const router = useRouter();
  const posEnabled = usePosEnabled();
  const boot = usePosBootstrap();
  const [tab, setTab] = useState<Tab>('queue');
  const [search, setSearch] = useState('');
  const { open, openingKey } = useOpenCheckout();

  const queue = usePosQueue(null, { enabled: tab === 'queue' });
  const openSales = usePosSaleList({ status: 'open' }, { enabled: tab === 'open' });
  const allSales = usePosSaleList({ q: search.trim().length >= 1 ? search : null }, { enabled: tab === 'all' });

  const header = <Stack.Screen options={{ headerShown: true, title: t('till.title') }} />;

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
            title={t('till.error.title')}
            message={boot.error instanceof ApiError ? boot.error.message : t('till.error.body')}
            onRetry={() => void boot.refetch()}
          />
        )}
      </Screen>
    );
  }

  const canStart = canPos(boot.data, 'create_sale');
  const active = tab === 'queue' ? queue : tab === 'open' ? openSales : allSales;

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={active.isRefetching} onRefresh={() => void active.refetch()} />}
        keyboardShouldPersistTaps="handled">
        {canStart ? (
          <Button
            label={t('till.newSale')}
            fullWidth
            loading={openingKey === 'blank'}
            onPress={() => void open('blank')}
          />
        ) : null}

        <MySalesCard />

        <Segmented
          options={[
            { value: 'queue', label: t('till.tab.queue') },
            { value: 'open', label: t('till.tab.open') },
            { value: 'all', label: t('till.tab.all') },
          ]}
          value={tab}
          onChange={setTab}
          wrapLabels
        />

        {tab === 'all' ? (
          <SearchBar value={search} onChangeText={setSearch} placeholder={t('sales.search')} onClear={() => setSearch('')} />
        ) : null}

        {tab === 'queue' ? (
          queue.isLoading ? (
            <ListSkeleton />
          ) : queue.isError ? (
            <ErrorState message={t('queue.error')} onRetry={() => void queue.refetch()} />
          ) : (queue.data?.bookings ?? []).length === 0 ? (
            <EmptyState title={t('queue.empty.title')} message={t('queue.empty.body')} />
          ) : (
            (queue.data?.bookings ?? []).map((row) => (
              <QueueCard
                key={row.booking_id}
                row={row}
                canStart={canStart}
                opening={openingKey === row.booking_id}
                onCheckout={() =>
                  row.open_sale_id ? router.push(saleHref(row.open_sale_id)) : void open({ bookingId: row.booking_id })
                }
              />
            ))
          )
        ) : active.isLoading ? (
          <ListSkeleton />
        ) : active.isError ? (
          <ErrorState
            message={active.error instanceof ApiError ? active.error.message : t('common.networkError')}
            onRetry={() => void active.refetch()}
          />
        ) : ((tab === 'open' ? openSales.data?.sales : allSales.data?.sales) ?? []).length === 0 ? (
          tab === 'open' ? (
            <EmptyState title={t('sales.empty.title')} message={t('sales.empty.body')} />
          ) : (
            <Text tone="muted">{t('sales.none.filtered')}</Text>
          )
        ) : (
          ((tab === 'open' ? openSales.data?.sales : allSales.data?.sales) ?? []).map((row) => (
            <SaleRowCard key={row.id} row={row} onPress={() => router.push(saleHref(row.id))} />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function QueueCard({
  row,
  canStart,
  opening,
  onCheckout,
}: {
  row: PosQueueRow;
  canStart: boolean;
  opening: boolean;
  onCheckout: () => void;
}) {
  const t = usePosT();
  const status =
    row.status === 'started' ? t('queue.status.started') : row.status === 'completed' ? t('queue.status.completed') : t('queue.status.arrived');
  const services = row.services
    .map((s) => (s.calendar_name ? `${s.name} with ${s.calendar_name}` : s.name))
    .join(', ');
  return (
    <Card>
      <View style={posStyles.stack}>
        <View style={styles.rowTop}>
          <View style={styles.flex}>
            <Text variant="label">{row.client_name ?? t('sales.walkIn')}</Text>
            <Text variant="caption" tone="muted">
              {[row.start_time?.slice(0, 5), services].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Badge label={status} tone="accent" />
        </View>
        <View style={styles.chips}>
          {row.price_unknown ? <Badge label={t('queue.chip.noPrice')} /> : null}
          {row.deposit_paid_pence > 0 ? (
            <Badge label={t('queue.chip.deposit', { amount: money(row.deposit_paid_pence) })} />
          ) : null}
          {row.open_sale_number_label ? (
            <Badge label={t('queue.chip.openSale', { saleNo: row.open_sale_number_label })} tone="warning" />
          ) : null}
        </View>
        <View style={styles.rowTop}>
          <Text variant="bodyMedium" style={styles.flex}>
            {row.price_unknown ? '' : t('queue.due', { amount: money(row.balance_due_pence) })}
          </Text>
          {canStart || row.open_sale_id ? (
            <Button label={t('queue.checkout')} size="sm" loading={opening} onPress={onCheckout} />
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function SaleRowCard({ row, onPress }: { row: PosSaleListRow; onPress: () => void }) {
  const t = usePosT();
  const status = t(saleStatusCopyId({ status: row.status, parked: row.parked ? { at: row.parked.at, by_staff_id: null, note: row.parked.note, device: row.parked.device } : null }));
  const owing = row.status === 'open' || row.status === 'part_paid';
  return (
    <Card onPress={onPress} accessibilityRole="button" accessibilityLabel={t('sale.title', { saleNo: row.number_label })}>
      <View style={posStyles.stack}>
        <View style={styles.rowTop}>
          <View style={styles.flex}>
            <Text variant="label">
              {t('sale.title', { saleNo: row.number_label })} · {row.client_name ?? t('sales.walkIn')}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {row.summary || t('sales.items', { count: row.line_count })}
            </Text>
          </View>
          <Text variant="label">{money(owing ? row.balance_due_pence : row.total_pence)}</Text>
        </View>
        <View style={styles.chips}>
          <Badge label={status} tone={row.status === 'completed' ? 'success' : row.status === 'part_paid' ? 'warning' : undefined} />
          {row.card_waiting ? <Badge label={t('sales.pill.cardPending')} tone="accent" /> : null}
          {row.refund_status === 'partial' ? <Badge label={t('sale.refund.partial')} /> : null}
          {row.refund_status === 'full' ? <Badge label={t('sale.refund.full')} /> : null}
        </View>
        {row.parked ? (
          <Text variant="caption" tone="muted">
            {t('sales.parkedBy', {
              staffName: row.operator_name ?? row.created_by_name ?? 'your team',
              device: row.parked.device ?? 'a device',
              time: timeOf(row.parked.at),
            })}
            {row.parked.note ? `. ${row.parked.note}` : ''}
          </Text>
        ) : row.created_by_name ? (
          <Text variant="caption" tone="muted">
            {t('sales.startedBy', { staffName: row.created_by_name, time: timeOf(row.created_at) })}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/** "Your sales and tips" (`app.mine.*`), from the reports, for logins that may read them. */
function MySalesCard() {
  const t = usePosT();
  const access = usePosReportAccess();
  const me = useStaffMe();
  const [period, setPeriod] = useState<'today' | 'this-week'>('today');
  const canView = access.data?.can_view === true;
  const sales = useSalesReport(period, { enabled: canView });
  const takings = useTakingsReport(period, { enabled: canView });
  const figures = useMemo(
    () =>
      myFigures(
        { sales: sales.data, takings: takings.data },
        { staffId: me.data?.staff?.id ?? null, calendarIds: me.data?.staff?.linked_calendar_ids ?? [] },
      ),
    [sales.data, takings.data, me.data],
  );
  if (!canView) return null;
  return (
    <Card>
      <View style={posStyles.stack}>
        <Text variant="label">{t('app.mine.title')}</Text>
        <Segmented
          options={[
            { value: 'today', label: t('app.mine.today') },
            { value: 'this-week', label: t('app.mine.week') },
          ]}
          value={period}
          onChange={setPeriod}
        />
        {figures && (figures.salesPence !== 0 || figures.tipsPence !== 0) ? (
          <>
            <Text variant="bodyMedium">{t('app.mine.sales', { amount: money(figures.salesPence) })}</Text>
            <Text variant="bodyMedium">{t('app.mine.tips', { amount: money(figures.tipsPence) })}</Text>
          </>
        ) : sales.isLoading || takings.isLoading ? null : (
          <Text variant="bodySmall" tone="muted">
            {t('app.mine.none')}
          </Text>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
