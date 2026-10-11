import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { SaleRowCard } from '@/components/pos/CheckoutHome';
import { usePosT } from '@/components/pos/parts';
import { saleHref } from '@/components/pos/useOpenCheckout';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { SearchBar } from '@/components/ui/SearchBar';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { usePosEnabled, usePosSaleList } from '@/lib/queries/usePos';
import { spacing } from '@/theme/index';

/**
 * All sales, with a search on the sale number, the name or the amount (UX spec §13.3). Checkout home
 * lists the queue and open sales on one page (Part 2 mock-up 5), so every sale is one tap away here
 * rather than behind a second row of tabs.
 */
export default function AllSalesScreen() {
  const t = usePosT();
  const router = useRouter();
  const posEnabled = usePosEnabled();
  const [search, setSearch] = useState('');
  const sales = usePosSaleList({ q: search.trim().length >= 1 ? search : null });
  const rows = sales.data?.sales ?? [];

  const header = <Stack.Screen options={{ headerShown: true, title: t('till.tab.all') }} />;

  if (!posEnabled) {
    return (
      <Screen>
        {header}
        <EmptyState title={t('till.off.title')} message={t('till.off.body', { venue: 'your venue' })} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={sales.isRefetching} onRefresh={() => void sales.refetch()} />}
        keyboardShouldPersistTaps="handled">
        <SearchBar value={search} onChangeText={setSearch} placeholder={t('sales.search')} onClear={() => setSearch('')} />
        {sales.isLoading ? (
          <ListSkeleton />
        ) : sales.isError ? (
          <ErrorState
            message={sales.error instanceof ApiError ? sales.error.message : t('common.networkError')}
            onRetry={() => void sales.refetch()}
          />
        ) : rows.length === 0 ? (
          <Text tone="muted">{t('sales.none.filtered')}</Text>
        ) : (
          rows.map((row) => <SaleRowCard key={row.id} row={row} onPress={() => router.push(saleHref(row.id))} />)
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
});
