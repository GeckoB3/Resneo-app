import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { SaleRowCard } from '@/components/pos/CheckoutHome';
import { Notice, usePosT } from '@/components/pos/parts';
import { saleHref } from '@/components/pos/useOpenCheckout';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { SearchBar } from '@/components/ui/SearchBar';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { posFinishingOpen } from '@/lib/pos/pos-enabled';
import { usePosEnabled, usePosSaleList } from '@/lib/queries/usePos';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';

/**
 * All sales, with a search on the sale number, the name or the amount (UX spec §13.3). Checkout home
 * lists the queue and open sales on one page (Part 2 mock-up 5), so every sale is one tap away here
 * rather than behind a second row of tabs.
 *
 * Sales history (POS Part 5, design section 7.2; the web's `hist.*`): with Checkout off at a venue
 * that has had it, admins keep this list, read only, from More; each sale opens read only with
 * refunds, as on the web. The list's route stays open with Checkout off.
 */
export default function AllSalesScreen() {
  const t = usePosT();
  const router = useRouter();
  const posEnabled = usePosEnabled();
  const { venue } = useVenueContext();
  const staff = useStaffMe();
  const isAdmin = (staff.data?.staff?.role ?? venue?.current_user_role) === 'admin';
  const history = !posEnabled && isAdmin && posFinishingOpen(venue);
  const [search, setSearch] = useState('');
  const sales = usePosSaleList({ q: search.trim().length >= 1 ? search : null }, { finishing: history });
  const rows = sales.data?.sales ?? [];

  const header = <Stack.Screen options={{ headerShown: true, title: history ? t('hist.link') : t('till.tab.all') }} />;

  if (!posEnabled && !history) {
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
        {history ? <Notice tone="warning">{t('hist.banner', { venue: venue?.name?.trim() || 'your venue' })}</Notice> : null}
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
