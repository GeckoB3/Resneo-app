import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CollectiveCatalogueBuilder } from '@/components/linked/CollectiveCatalogueBuilder';
import { CollectiveMembersPanel } from '@/components/linked/CollectiveMembersPanel';
import { CombinedPageConfigEditor } from '@/components/linked/CombinedPageConfigEditor';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { fullMutualLinks } from '@/lib/linked/grants';
import { useCollectives } from '@/lib/queries/useCollectives';
import { useLinkedVenues } from '@/lib/queries/useLinkedVenues';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { spacing } from '@/theme/index';
import type { CollectiveView } from '@/types/collectives';

type TabKey = 'page' | 'services' | 'members';

export default function CollectiveDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const collectiveId = typeof id === 'string' ? id : undefined;

  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  const query = useCollectives();
  const linksQuery = useLinkedVenues();

  const [tab, setTab] = useState<TabKey>('page');

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

  const isHost = collective.isHost;

  // Member (non-host) view — read-only explainer (web parity).
  if (!isHost) {
    return (
      <Screen scroll contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: collective.name }} />
        <Card>
          <Text variant="bodySmall" tone="secondary">
            Your services appear on this combined booking page using their own price, duration and
            availability from your Services settings. The host venue chooses which of your calendars
            are offered. To stop taking part, leave the collective from the Venue collectives list.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: collective.name }} />

      <Segmented<TabKey>
        options={[
          { value: 'page', label: 'Page' },
          { value: 'services', label: 'Services' },
          { value: 'members', label: 'Members' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <View style={styles.tabBody}>
        {tab === 'page' ? (
          <CombinedPageConfigEditor
            collective={collective}
            onChanged={() => void query.refetch()}
          />
        ) : null}

        {tab === 'services' ? <CollectiveCatalogueBuilder collectiveId={collective.id} /> : null}

        {tab === 'members' ? (
          <CollectiveMembersPanel
            collective={collective}
            eligibleLinks={eligibleLinks}
            onDissolved={() => router.back()}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },
  tabBody: {
    gap: spacing.md,
  },
});
