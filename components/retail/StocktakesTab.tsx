import { type Href, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { money, posStyles } from '@/components/pos/parts';
import { StartStocktakeSheet } from '@/components/retail/StockSheets';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { shortWhen, stocktakeStatusId } from '@/lib/retail/stock-words';
import { useStockT } from '@/lib/retail/stock-setup-copy';
import { useStocktakePages } from '@/lib/queries/useStockSetup';
import { spacing } from '@/theme/index';
import type { StocktakeRow } from '@/types/retail';

/**
 * The Stocktakes tab (UX spec §6.11 List), as the web's `StocktakesTab.tsx`: number, name, what it
 * counts, status, who started it and when, and the difference at cost once done, fifty at a time.
 * `take.start` (needs `count_stock`) opens the start sheet and goes straight to the new count.
 */
export function StocktakesTab({ canCount, timeZone }: { canCount: boolean; timeZone: string }) {
  const t = useStockT();
  const router = useRouter();
  const list = useStocktakePages();
  const [starting, setStarting] = useState(false);
  const rows = useMemo(() => (list.data?.pages ?? []).flatMap((p) => p.stocktakes), [list.data]);
  const allowStart = canCount && list.data?.pages[0]?.can_count !== false;

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />}>
        {allowStart ? <Button label={t('take.start')} onPress={() => setStarting(true)} fullWidth /> : null}
        {list.isLoading ? (
          <ListSkeleton />
        ) : list.isError && rows.length === 0 ? (
          <ErrorState message={posErrorMessage(list.error, t('take.list.error'))} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title={t('take.empty.title')} message={t('take.empty.body')} />
        ) : (
          rows.map((r) => <StocktakeCard key={r.id} row={r} timeZone={timeZone} onPress={() => router.push(`/stock/stocktake/${r.id}` as Href)} />)
        )}
        {list.hasNextPage ? (
          <Button label={t('app.stock.more')} variant="secondary" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} fullWidth />
        ) : null}
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
  const t = useStockT();
  const tone = row.status === 'committed' ? 'success' : row.status === 'review' ? 'warning' : row.status === 'counting' ? 'accent' : 'neutral';
  const started = row.started_by_name
    ? t('take.startedBy', { name: row.started_by_name, date: shortWhen(row.started_at, timeZone) })
    : shortWhen(row.started_at, timeZone);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${row.number}. ${row.name}`}>
      <Card>
        <View style={posStyles.stack}>
          <View style={posStyles.row}>
            <Text variant="label" style={styles.flex}>
              {`${row.number}. ${row.name}`}
            </Text>
            <Badge label={t(stocktakeStatusId(row.status))} tone={tone} />
          </View>
          <Text variant="caption" tone="muted">
            {`${row.scope?.type === 'partial' ? t('take.scope.partial') : t('take.scope.full')}, ${started}`}
          </Text>
          {row.status === 'committed' && row.variance_value_pence != null ? (
            <Text variant="bodySmall">{t('take.variance', { amount: money(Math.round(row.variance_value_pence)) })}</Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  flex: { flex: 1 },
});
