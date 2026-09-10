import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { CollectiveManagerPanel } from '@/components/linked/CollectiveManagerPanel';
import { CombinedPageMemberSummary } from '@/components/linked/CombinedPageMemberSummary';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Screen } from '@/components/ui/Screen';
import { ApiError } from '@/lib/api/client';
import { fullMutualLinks } from '@/lib/linked/grants';
import { useCollectives } from '@/lib/queries/useCollectives';
import { useLinkedVenues } from '@/lib/queries/useLinkedVenues';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { spacing } from '@/theme/index';
import type { CollectiveView } from '@/types/collectives';

export default function CollectiveDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const collectiveId = typeof id === 'string' ? id : undefined;

  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  const query = useCollectives();
  const linksQuery = useLinkedVenues();

  const collective = useMemo<CollectiveView | null>(
    () => (query.data?.collectives ?? []).find((c) => c.id === collectiveId) ?? null,
    [query.data?.collectives, collectiveId],
  );
  const eligibleLinks = useMemo(
    () => fullMutualLinks(linksQuery.data?.links ?? []),
    [linksQuery.data?.links],
  );

  if (!staffQuery.isLoading && !isAdmin) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Combined page' }} />
        <EmptyState title="Admins only" message="Venue collectives are managed by venue admins." />
      </Screen>
    );
  }

  if (query.isLoading || staffQuery.isLoading) {
    return (
      <Screen scroll>
        <Stack.Screen options={{ title: 'Combined page' }} />
        <DetailSkeleton />
      </Screen>
    );
  }

  if (query.isError) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Combined page' }} />
        <ErrorState
          message={
            query.error instanceof ApiError ? query.error.message : 'Could not load this collective.'
          }
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  if (!collective) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Combined page' }} />
        <ErrorState message="This collective could not be found. It may have been dissolved." />
      </Screen>
    );
  }

  // The same panel and summary the Booking page screen shows in its combined
  // scope (web: Linked accounts' modal and the Booking Page tab share one
  // implementation).
  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: collective.name }} />
      {collective.isHost ? (
        <CollectiveManagerPanel
          collective={collective}
          eligibleLinks={eligibleLinks}
          onChanged={() => void query.refetch()}
          onDissolved={() => router.back()}
        />
      ) : (
        <CombinedPageMemberSummary
          collective={collective}
          onOpenLinkedVenues={() => router.push('/linked-venues' as never)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },
});
