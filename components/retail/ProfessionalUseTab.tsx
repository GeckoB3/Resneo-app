import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { money, posStyles } from '@/components/pos/parts';
import { UseStockSheet } from '@/components/retail/PurchasingSheets';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { productLabel, shortWhen, timeOfDay } from '@/lib/retail/stock-words';
import { useStockT } from '@/lib/retail/stock-setup-copy';
import { useMovementList } from '@/lib/queries/useStockSetup';
import { spacing } from '@/theme/index';

/**
 * The Professional use tab (UX spec §6.14), as the web's `ProfessionalUseTab.tsx`: `use.open`
 * (needs `record_professional_use`) opens "Record products used"; below it, what was used lately,
 * newest first, from the movement history, twenty-five at a time.
 */
export function ProfessionalUseTab({ canUse, timeZone }: { canUse: boolean; timeZone: string }) {
  const t = useStockT();
  const [open, setOpen] = useState(false);
  const list = useMovementList({ reason: 'professional_use' }, { pageSize: 25 });
  const rows = useMemo(() => (list.data?.pages ?? []).flatMap((p) => p.items), [list.data]);

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />}>
        <Text variant="bodySmall" tone="muted">
          {t('use.help')}
        </Text>
        {canUse ? <Button label={t('use.open')} onPress={() => setOpen(true)} fullWidth /> : null}
        <Text variant="subheading">{t('use.recent')}</Text>
        {list.isLoading ? (
          <ListSkeleton />
        ) : list.isError && rows.length === 0 ? (
          <ErrorState message={posErrorMessage(list.error, t('use.recent.error'))} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <Text tone="muted">{t('use.recent.empty')}</Text>
        ) : (
          rows.map((m) => (
            <Card key={m.id}>
              <View style={posStyles.row}>
                <View style={styles.flex}>
                  <Text variant="label">{productLabel(m.product_name, m.option_name)}</Text>
                  <Text variant="caption" tone="muted">
                    {[`${shortWhen(m.occurred_at, timeZone)} ${timeOfDay(m.occurred_at, timeZone)}`, m.staff_name].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={styles.right}>
                  <Text variant="label">{String(-m.delta)}</Text>
                  {m.value_pence == null ? null : (
                    <Text variant="caption" tone="muted">
                      {money(Math.abs(Math.round(m.value_pence)))}
                    </Text>
                  )}
                </View>
              </View>
            </Card>
          ))
        )}
        {list.hasNextPage ? (
          <Button label={t('app.stock.more')} variant="secondary" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} fullWidth />
        ) : null}
      </ScrollView>
      <UseStockSheet
        visible={open}
        timeZone={timeZone}
        onClose={() => {
          setOpen(false);
          void list.refetch();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  flex: { flex: 1 },
  right: { alignItems: 'flex-end' },
});
