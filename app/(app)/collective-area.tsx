/**
 * The Collective area: where a venue in a live shared-services collective runs it, as the web's
 * `/dashboard/collective` (2026-09-17).
 *
 *   Services  every venue's health, what needs you, and the services across the venues (a host
 *             chooses which calendars offer what, in bulk); a member sees what is on the page for
 *             it and what is parked
 *   Venues    the host's members, invitations, moving the hosting and ending the collective
 *   History   every change, filtered and downloadable
 *
 * Admins only, as on the web.
 */
import { Stack, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import {
  HostingRequestBanner,
  PausedHostingBanner,
  TodoStrip,
  VenueHealthCards,
} from '@/components/collective-area/AreaPieces';
import { HistoryPanel, MemberServicesList, VenuesPanel, type VenueRow } from '@/components/collective-area/AreaTabs';
import { ListingsPanel } from '@/components/collective-area/ListingsPanel';
import { ServicesGridBar, ServicesGridList, useServicesGrid } from '@/components/collective-area/ServicesGrid';
import { AdoptionRequestsCard } from '@/components/linked/setup/AdoptionSheets';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { areaCopy } from '@/lib/collective-area/copy';
import {
  areaCollective,
  buildCollectiveTodos,
  type AreaCollective,
  type AreaService,
  type CollectiveCalendarGroup,
} from '@/lib/collective-area/model';
import { useCollectiveRetry } from '@/lib/queries/useCollectiveArea';
import { useCollectives } from '@/lib/queries/useCollectives';
import { useManagedServices } from '@/lib/queries/useServicesManage';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useVenueContext } from '@/providers/VenueProvider';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CollectiveView } from '@/types/collectives';

type AreaTab = 'services' | 'listings' | 'venues' | 'history';

const CURRENCY_SYMBOL: Record<string, string> = { GBP: '£', EUR: '€', USD: '$' };

export default function CollectiveAreaScreen() {
  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  const servicesQuery = useManagedServices();
  const collectivesQuery = useCollectives({ enabled: isAdmin });

  const services = useMemo<AreaService[]>(() => servicesQuery.data?.services ?? [], [servicesQuery.data]);
  const groups = useMemo<CollectiveCalendarGroup[]>(
    () => servicesQuery.data?.collective_calendars ?? [],
    [servicesQuery.data],
  );
  const collective = useMemo(() => areaCollective(services), [services]);
  const entry = useMemo<CollectiveView | null>(
    () => (collectivesQuery.data?.collectives ?? []).find((c) => c.id === collective?.id) ?? null,
    [collectivesQuery.data, collective],
  );

  const title = 'Manage Collective';
  const header = <Stack.Screen options={{ headerShown: true, title }} />;

  if (!staffQuery.isLoading && !isAdmin) {
    return (
      <Screen>
        {header}
        <EmptyState title="Admins only" message="Only venue admins can manage a collective." />
      </Screen>
    );
  }
  if (servicesQuery.isLoading || staffQuery.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <ListSkeleton rows={5} />
      </Screen>
    );
  }
  if (servicesQuery.isError) {
    return (
      <Screen>
        {header}
        <ErrorState
          message="Could not load the collective. Please check your connection."
          onRetry={() => void servicesQuery.refetch()}
        />
      </Screen>
    );
  }
  if (!collective) {
    return (
      <Screen>
        {header}
        <EmptyState
          title="No collective"
          message="Your venue is not part of a collective yet. When it is, this is where you will run it."
        />
      </Screen>
    );
  }

  return (
    <AreaBody
      header={header}
      collective={collective}
      entry={entry}
      services={services}
      groups={groups}
      refreshing={servicesQuery.isRefetching || collectivesQuery.isRefetching}
      onRefresh={() => {
        void servicesQuery.refetch();
        void collectivesQuery.refetch();
      }}
    />
  );
}

function AreaBody({
  header,
  collective,
  entry,
  services,
  groups,
  refreshing,
  onRefresh,
}: {
  header: React.ReactNode;
  collective: AreaCollective;
  entry: CollectiveView | null;
  services: AreaService[];
  groups: CollectiveCalendarGroup[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const [tab, setTab] = useState<AreaTab>('services');
  const [historyVenueId, setHistoryVenueId] = useState<string | null>(null);
  const retry = useCollectiveRetry(collective.id);
  const grid = useServicesGrid({
    collectiveId: collective.id,
    collectiveName: collective.name,
    services,
    groups,
  });
  const currencySymbol = CURRENCY_SYMBOL[(venue?.currency ?? 'GBP').toUpperCase()] ?? '£';

  const todos = useMemo(
    () => buildCollectiveTodos({ isHost: collective.isHost, services, calendarGroups: groups }),
    [collective.isHost, services, groups],
  );

  const venueRows = useMemo<VenueRow[]>(
    () =>
      (entry?.members ?? [])
        .filter((m) => m.status === 'active' || m.status === 'invited')
        .map((m) => ({
          venue_id: m.venueId,
          venue_name: m.venueName,
          status: m.status as 'active' | 'invited',
          is_host: m.venueId === entry?.hostVenueId,
          also_runs: m.alsoRuns ?? null,
        })),
    [entry],
  );

  const onRetry = (venueId: string) =>
    retry.mutate(venueId, {
      onError: () => toast.error('That did not go through. Please try again.'),
    });

  const tabs: { value: AreaTab; label: string }[] = [
    { value: 'services', label: areaCopy('ov.tab.overview') },
    // Classes, events and resources listed on the combined page (web 2026-09-21, plan §4.3).
    { value: 'listings', label: 'Classes, events & resources' },
    ...(collective.isHost ? [{ value: 'venues' as const, label: areaCopy('ov.tab.venues') }] : []),
    { value: 'history', label: areaCopy('ov.tab.history') },
  ];

  const pendingHost = entry?.pendingHost ?? null;

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <View style={styles.flex1}>
        <ScrollView
          style={styles.flex1}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          <View style={styles.intro}>
            <Text variant="heading">{collective.name}</Text>
            <Text variant="bodySmall" tone="secondary">
              {areaCopy('ov.subtitle')}
            </Text>
          </View>

          {pendingHost && entry && pendingHost.venueId === entry.myVenueId && !pendingHost.transferAt ? (
            <HostingRequestBanner
              collectiveId={collective.id}
              collectiveName={collective.name}
              hostName={collective.hostVenueName}
            />
          ) : null}
          {entry?.pausedAt ? (
            <PausedHostingBanner
              collectiveId={collective.id}
              collectiveName={collective.name}
              formerHostName={collective.hostVenueName}
            />
          ) : null}
          {/* The host asked whether to use this venue's same-named service (web plan L13). */}
          {!collective.isHost ? <AdoptionRequestsCard collectiveId={collective.id} /> : null}

          <Segmented<AreaTab>
            options={tabs}
            value={tab}
            onChange={(next) => {
              if (next !== 'history') setHistoryVenueId(null);
              setTab(next);
            }}
          />

          {tab === 'services' ? (
            <>
              <VenueHealthCards groups={groups} onRetry={onRetry} retrying={retry.isPending} />
              <TodoStrip todos={todos} onRetry={onRetry} onOpenService={(id) => grid.setOpenServiceId(id)} />
              {collective.isHost ? (
                <ServicesGridList grid={grid} currencySymbol={currencySymbol} />
              ) : (
                <MemberServicesList
                  services={services}
                  hostName={collective.hostVenueName}
                  collectiveName={collective.name}
                />
              )}
            </>
          ) : null}

          {tab === 'venues' && collective.isHost ? (
            <VenuesPanel
              collectiveId={collective.id}
              collectiveName={collective.name}
              venues={venueRows}
              groups={groups}
              serviceModel={entry?.serviceModel}
              pendingHost={pendingHost}
              onShowHistory={(venueId) => {
                setHistoryVenueId(venueId);
                setTab('history');
              }}
              onEnded={() => router.replace('/collectives' as Href)}
            />
          ) : null}

          {tab === 'listings' ? (
            <ListingsPanel collectiveId={collective.id} collectiveName={collective.name} />
          ) : null}

          {tab === 'history' ? (
            <HistoryPanel
              key={historyVenueId ?? 'all'}
              collectiveId={collective.id}
              collectiveName={collective.name}
              venues={collective.isHost ? venueRows.map((v) => ({ venue_id: v.venue_id, venue_name: v.venue_name })) : []}
              initialVenueId={historyVenueId}
            />
          ) : null}
        </ScrollView>
        {tab === 'services' && collective.isHost ? <ServicesGridBar grid={grid} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },
  intro: { gap: spacing.xxs },
});
