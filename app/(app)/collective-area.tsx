/**
 * The Collective area: where a venue in a live shared-services collective runs it, as the web's
 * `/dashboard/collective` (2026-09-17).
 *
 *   Services  every venue's health, what needs you, and the services across the venues (a host
 *             chooses which calendars offer what, in bulk); a member sees what is on the page for
 *             it and what is parked, and suggests its own services to the host many at once
 *             (2026-10-27). A host also answers the members' suggestions, and switches between
 *             what is on the page and every venue's own services, to put any of them on the page
 *             or take them off with nobody asked (2026-10-27)
 *   Venues    the host's members, inviting any venue (2026-10-28), moving the hosting and ending
 *             the collective
 *   History   every change, filtered and downloadable
 *
 * Above the tabs, "Venues joining" tells this venue (host or member) when its link with a venue
 * invited to the collective has less than full access, which holds that venue up, and a member can
 * leave from the foot of its Services tab (2026-10-28).
 *
 * Admins only, as on the web.
 *
 * Route params (a bell about curating the page, web `/dashboard/collective?view=venues&venue=&filter=`):
 *   view=venues        open the host's Services tab on every venue's services
 *   venue=<id>         on that venue
 *   filter=suggested   on the suggestions waiting
 *   tab=venues         open the host's Venues tab (Manage combined page's pointer, CQ-10.4)
 *
 * A host whose collective has nothing on the page yet reads it from the collectives list, and opens
 * on Venues while it has no other venue, to invite one or end it (CQ-10.3).
 */
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import {
  HostingRequestBanner,
  LeaveCollectiveCard,
  PausedHostingBanner,
  TodoStrip,
  VenueHealthCards,
} from '@/components/collective-area/AreaPieces';
import { HistoryPanel, MemberServicesList, VenuesPanel, type VenueRow } from '@/components/collective-area/AreaTabs';
import { LinkTodosCard } from '@/components/collective-area/LinkTodosCard';
import { ListingsPanel } from '@/components/collective-area/ListingsPanel';
import { MemberCalendarsSheet } from '@/components/collective-area/MemberCalendarsSheet';
import { MemberSuggestPanel } from '@/components/collective-area/MemberSuggestPanel';
import { ServicesGridBar, ServicesGridList, useServicesGrid } from '@/components/collective-area/ServicesGrid';
import { SuggestionsReviewCard } from '@/components/collective-area/SuggestionsReviewCard';
import {
  useVenueServicesPanel,
  VenueServicesBar,
  VenueServicesList,
} from '@/components/collective-area/VenueServicesPanel';
import { AdoptionRequestsCard } from '@/components/linked/setup/AdoptionSheets';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { areaCopy } from '@/lib/collective-area/copy';
import { areaCollectiveWithFallback, type AreaCollectiveWithFallback } from '@/lib/collective-area/fallback';
import {
  buildCollectiveTodos,
  retryOutcome,
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
/** The host's two views of its services: what is on the page, and every venue's own (2026-10-27). */
type ServicesView = 'page' | 'venues';

/** One route param as a string, or null (expo-router hands a repeated param over as an array). */
function oneParam(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

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
  const collective = useMemo(
    () => areaCollectiveWithFallback(services, collectivesQuery.data?.collectives),
    [services, collectivesQuery.data],
  );
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
  if (!collective && collectivesQuery.isLoading) {
    // The collectives list may still name one with nothing on the page yet: wait for it, so
    // "No collective" never flashes for a host (CQ-10.3).
    return (
      <Screen padded={false}>
        {header}
        <ListSkeleton rows={5} />
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
  collective: AreaCollectiveWithFallback;
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
  const params = useLocalSearchParams<{ view?: string; venue?: string; filter?: string; tab?: string }>();
  // A host opens on Venues when asked, or while its collective has no other venue and nothing on the
  // page, as the web does (CQ-10.3).
  const [tab, setTab] = useState<AreaTab>(() =>
    collective.isHost &&
    (oneParam(params.tab) === 'venues' || (collective.noServices && (collective.activeMemberCount ?? 0) < 2))
      ? 'venues'
      : 'services',
  );
  const [historyVenueId, setHistoryVenueId] = useState<string | null>(null);
  /** A member's page service opened from its list, to choose its calendars here (2026-10-29). */
  const [calendarsServiceId, setCalendarsServiceId] = useState<string | null>(null);
  const [servicesView, setServicesView] = useState<ServicesView>(
    oneParam(params.view) === 'venues' ? 'venues' : 'page',
  );
  const retry = useCollectiveRetry(collective.id);
  // Every venue's own services. Read for the host only; on a server from before 2026-10-27 the
  // route is missing (`panel.unsupported`), and the tab stays as it was: the grid alone.
  const panel = useVenueServicesPanel({
    collectiveId: collective.id,
    collectiveName: collective.name,
    enabled: collective.isHost,
    initialVenueId: oneParam(params.venue),
    initialFilter: oneParam(params.filter) === 'suggested' ? 'suggested' : null,
  });
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

  // Update now says what it did either way (web `retryVenue`, CQ-11): up to date, still updating,
  // or why that venue could not be updated.
  const onRetry = (venueId: string) => {
    const venueName = groups.find((g) => g.venue_id === venueId)?.venue_name ?? 'That venue';
    retry.mutate(venueId, {
      onSuccess: (data) => {
        const outcome = retryOutcome(data?.collective_sync, venueName);
        if (outcome.state === 'done') toast.success(outcome.text);
        else if (outcome.state === 'pending') toast.info(outcome.text);
        else toast.error(outcome.text);
      },
      onError: (err) => toast.error(err instanceof ApiError ? err.message : areaCopy('ov.venue.retryError')),
    });
  };

  const tabs: { value: AreaTab; label: string }[] = [
    { value: 'services', label: areaCopy('ov.tab.overview') },
    // Classes, events and resources listed on the combined page (web 2026-09-21, plan §4.3).
    // 'Classes, events & resources' on the web; shorter so the tab stays readable on a phone.
    { value: 'listings', label: 'Classes & more' },
    ...(collective.isHost ? [{ value: 'venues' as const, label: areaCopy('ov.tab.venues') }] : []),
    { value: 'history', label: areaCopy('ov.tab.history') },
  ];

  const pendingHost = entry?.pendingHost ?? null;
  const showVenueServices = collective.isHost && servicesView === 'venues' && !panel.unsupported;

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
            {/* The combined page's look, address, embed code and QR code live on the Booking
                page screen, which opens on the combined page while the collective is live
                (web 4a05756e). */}
            <Button
              label={areaCopy('ov.bookingPageSettings')}
              variant="secondary"
              size="sm"
              style={styles.bookingPageLink}
              onPress={() => router.push('/manage/booking-page' as Href)}
            />
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
          {/* A venue invited to the collective held up by a link this one set to less than full
              access (web CollectiveLinkTodos, 2026-10-28). Nothing shows otherwise. */}
          <LinkTodosCard />

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
              <VenueHealthCards
                groups={groups}
                onRetry={onRetry}
                retryingVenueId={retry.isPending ? (retry.variables ?? null) : null}
                canRetry={collective.isHost}
              />
              {/* What needs you opens what it is about on the page's grid, never behind Every venue's
                  services, and a venue's row goes straight to its calendars (CQ-10.7). */}
              <TodoStrip
                todos={todos}
                onRetry={onRetry}
                onOpenService={(id) => {
                  if (!collective.isHost) {
                    setCalendarsServiceId(id);
                    return;
                  }
                  setServicesView('page');
                  grid.setOpenServiceId(id);
                }}
                onOpenVenue={(id) => {
                  setServicesView('page');
                  grid.focusVenue(id);
                }}
                onSwitchOn={collective.isHost ? (id) => void grid.switchOn(id) : undefined}
              />
              {collective.isHost && panel.supported ? (
                <SuggestionsReviewCard
                  collectiveId={collective.id}
                  collectiveName={collective.name}
                  currencySymbol={currencySymbol}
                  onReview={() => {
                    panel.reviewSuggestions();
                    setServicesView('venues');
                  }}
                />
              ) : null}
              {/* Hidden only once the server is known not to have every venue's services. */}
              {collective.isHost && !panel.unsupported ? (
                <Segmented<ServicesView>
                  options={[
                    { value: 'page', label: areaCopy('vs.view.page') },
                    { value: 'venues', label: areaCopy('vs.view.venues') },
                  ]}
                  value={servicesView}
                  onChange={setServicesView}
                />
              ) : null}
              {!collective.isHost ? (
                <>
                  <MemberSuggestPanel
                    collectiveId={collective.id}
                    collectiveName={collective.name}
                    hostName={collective.hostVenueName}
                    currencySymbol={currencySymbol}
                  />
                  <MemberServicesList
                    services={services}
                    hostName={collective.hostVenueName}
                    collectiveName={collective.name}
                    onChooseCalendars={setCalendarsServiceId}
                  />
                  {calendarsServiceId ? (
                    <MemberCalendarsSheet
                      serviceId={calendarsServiceId}
                      currencySymbol={currencySymbol}
                      onClose={() => setCalendarsServiceId(null)}
                    />
                  ) : null}
                  <LeaveCollectiveCard
                    collectiveId={collective.id}
                    collectiveName={collective.name}
                    hostName={collective.hostVenueName}
                    // The sheet says "You left {collective}."; Venue collectives shows the review.
                    onLeft={() => router.replace('/collectives' as Href)}
                  />
                </>
              ) : showVenueServices ? (
                <VenueServicesList panel={panel} currencySymbol={currencySymbol} />
              ) : (
                <ServicesGridList grid={grid} currencySymbol={currencySymbol} />
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
        {tab === 'services' && collective.isHost ? (
          showVenueServices ? <VenueServicesBar panel={panel} /> : <ServicesGridBar grid={grid} />
        ) : null}
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
  bookingPageLink: { alignSelf: 'flex-start', marginTop: spacing.sm },
});
