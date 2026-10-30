import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, RefreshControl, StyleSheet, View } from 'react-native';

import { CreateCollectiveSheet } from '@/components/linked/CreateCollectiveSheet';
import { LeaveCollectiveSheet } from '@/components/linked/LeaveCollectiveSheet';
import { CollectiveSetupSheet } from '@/components/linked/setup/CollectiveSetupSheet';
import { JoinCollectiveSheet } from '@/components/linked/setup/JoinCollectiveSheet';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ReleaseReviewCard } from '@/components/services/collective/ReleaseReviewCard';
import { ApiError } from '@/lib/api/client';
import { areaCopy } from '@/lib/collective-area/copy';
import { getWebUrl } from '@/lib/env';
import { collectivePublicPath } from '@/lib/linked/collective-page';
import { useCollectiveCandidates } from '@/lib/queries/useCollectiveLinks';
import {
  useCollectiveMemberAction,
  useCollectives,
} from '@/lib/queries/useCollectives';
import { formatVenueList, setupCopy } from '@/lib/linked/setup-copy';
import { useIncomingLinks, useLinkedVenues } from '@/lib/queries/useLinkedVenues';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useWebDashboardLink } from '@/lib/sites/useWebDashboardLink';
import { useVenueContext } from '@/providers/VenueProvider';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CollectiveView } from '@/types/collectives';
import {
  collectiveMembersLine,
  isConsentRequired,
  isSharedServices,
} from '@/lib/linked/collective-membership-copy';

export default function CollectivesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();

  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  const { name: venueName } = useVenueContext();
  const siteLink = useWebDashboardLink();

  const query = useCollectives();
  const linksQuery = useLinkedVenues();
  const memberAction = useCollectiveMemberAction();

  const [createOpen, setCreateOpen] = useState(false);
  /** Leaving: the sheet reads what leaving changes first (CQ-10.1). */
  const [leaveTarget, setLeaveTarget] = useState<CollectiveView | null>(null);
  /** Joining on shared services, natively (web `JoinCollectiveDialog`); the sheet reads the preview itself. */
  const [joinTarget, setJoinTarget] = useState<CollectiveView | null>(null);
  /** The host's finish-setup wizard (web plan L8), opened from a row or from the banner's `?setup=`. */
  const [setupTarget, setSetupTarget] = useState<string | null>(null);
  const params = useLocalSearchParams<{ setup?: string; join?: string }>();
  const setupParam = typeof params.setup === 'string' ? params.setup : null;
  const setupHandledRef = useRef(false);
  /**
   * The banner's `?join=` (web `?join=` on Linked Accounts, 2026-10-28): an invitation from a host
   * this venue is already linked with, which no link request carries. It opens that collective's
   * join sheet once, when the invitation is in the list.
   */
  const joinParam = typeof params.join === 'string' ? params.join : null;
  const joinHandledRef = useRef<string | null>(null);

  const collectives = useMemo<CollectiveView[]>(
    () => query.data?.collectives ?? [],
    [query.data?.collectives],
  );
  const hasLiveCollective = collectives.some((c) => c.status !== 'dissolved');
  // Every venue this one is linked with: Create lists them all, and says which cannot join and why
  // (R2-12 option A), so a link that gives less than full access no longer greys the button out.
  const candidatesQuery = useCollectiveCandidates({ enabled: isAdmin && !hasLiveCollective });
  const hasCandidates = (candidatesQuery.data?.length ?? 0) > 0;
  // Only once the server has said so: a list still loading, or one that failed, is not "no links".
  const noLinkedVenues = candidatesQuery.isSuccess && !hasCandidates;

  // What each venue is waiting for (web plan §4): the hosts still setting a page up, and the
  // members whose host is. The same feed drives the banner above the tabs.
  const feed = useIncomingLinks({ enabled: isAdmin });
  const setupNeeded = useMemo(() => new Set((feed.data?.collectiveSetup ?? []).map((c) => c.collectiveId)), [feed.data]);
  const memberWaiting = useMemo(() => new Set((feed.data?.memberWaiting ?? []).map((c) => c.collectiveId)), [feed.data]);
  // An invitation that rides on a link request from the host (web plan L11): it is answered
  // with the link, on the Linked venues screen.
  const pendingLinkByHost = useMemo(() => {
    const out = new Map<string, string>();
    for (const l of linksQuery.data?.links ?? []) {
      if (l.status === 'pending' && !l.initiatedByMe) out.set(l.otherVenue.id, l.id);
    }
    return out;
  }, [linksQuery.data?.links]);

  useEffect(() => {
    if (!setupParam || setupHandledRef.current) return;
    if (!collectives.some((c) => c.id === setupParam && c.isHost)) return;
    setupHandledRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSetupTarget(setupParam);
  }, [setupParam, collectives]);

  useEffect(() => {
    if (!joinParam || joinHandledRef.current === joinParam) return;
    const target = collectives.find((c) => c.id === joinParam && c.myMembershipStatus === 'invited');
    if (!target) return;
    joinHandledRef.current = joinParam;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJoinTarget(target);
  }, [joinParam, collectives]);

  // The address customers actually use: a member venue's own page when the
  // collective adopted it, else the dedicated combined address (web 2026-09-05).
  // A dashboard path names this venue (`?site=`, web roles plan §6.2b); a public booking page is
  // left as it is.
  const openWeb = (publicPath: string) => {
    const base = getWebUrl() || 'https://app.resneo.com';
    const url = `${base}${siteLink(publicPath)}`;
    void WebBrowser.openBrowserAsync(url).catch(() =>
      Linking.openURL(url).catch(() => toast.error('Could not open the browser.')),
    );
  };

  const runMember = (
    collectiveId: string,
    payload: Parameters<typeof memberAction.mutate>[0]['payload'],
    successMsg: string,
  ) => {
    memberAction.mutate(
      { collectiveId, payload },
      {
        onSuccess: () => toast.success(successMsg),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Action failed.'),
      },
    );
  };

  // --- gates -----------------------------------------------------------------

  if (!staffQuery.isLoading && !isAdmin) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Venue collectives' }} />
        <EmptyState
          title="Admins only"
          message="Venue collectives are managed by venue admins. Ask an admin at your venue to set one up."
        />
      </Screen>
    );
  }

  if (query.isLoading || staffQuery.isLoading) {
    return (
      <Screen padded={false}>
        <Stack.Screen options={{ title: 'Venue collectives' }} />
        <ListSkeleton rows={4} />
      </Screen>
    );
  }

  if (query.isError) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Venue collectives' }} />
        <ErrorState
          message={
            query.error instanceof ApiError ? query.error.message : 'Could not load collectives.'
          }
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  const busy = memberAction.isPending;

  return (
    <Screen
      scroll
      padded={false}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => {
            void query.refetch();
            if (isAdmin && !hasLiveCollective) void candidatesQuery.refetch();
          }}
          tintColor={colors.brand}
        />
      }>
      <Stack.Screen options={{ title: 'Venue collectives' }} />

      {/* After leaving, being removed or the end of a collective: the services to look over (web
          shows it on the Venue collectives panel; CQ-10.1). Nothing shows otherwise. */}
      <ReleaseReviewCard enabled={isAdmin} />

      <Text variant="bodySmall" tone="secondary">
        A venue collective is a shared public booking page joining two or more fully linked venues
        under one brand.
      </Text>

      {/* Create: hidden once already in a live collective (one per venue); disabled only while this
          venue has no linked venues at all. */}
      {!hasLiveCollective ? (
        <Button
          label="Create venue collective"
          variant="primary"
          fullWidth
          disabled={!hasCandidates}
          onPress={() => setCreateOpen(true)}
        />
      ) : null}

      {/* Why the create button is disabled, on the screen rather than in a tooltip. */}
      {!hasLiveCollective && noLinkedVenues ? (
        <View style={[styles.amberNote, { backgroundColor: colors.warningSurface }]}>
          <Text variant="caption" color={colors.warning}>
            {setupCopy('create.venues.empty.body')}
          </Text>
        </View>
      ) : null}
      {!hasLiveCollective && candidatesQuery.isError ? (
        <Text variant="caption" tone="danger">
          {areaCopy('ov.venues.invite.loadFailed')}
        </Text>
      ) : null}

      {collectives.length === 0 ? (
        // The amber note above already explains having no linked venues.
        noLinkedVenues ? null : (
          <Text variant="bodySmall" tone="muted">
            No venue collectives yet. Create one to offer a combined booking page.
          </Text>
        )
      ) : (
        collectives.map((c) => (
          <CollectiveCard
            key={c.id}
            collective={c}
            busy={busy}
            onManage={() => router.push(`/collectives/${c.id}` as Href)}
            onViewPage={() => openWeb(collectivePublicPath(c))}
            onOpenArea={() => router.push('/collective-area' as Href)}
            setupNeeded={setupNeeded.has(c.id)}
            memberWaiting={memberWaiting.has(c.id)}
            pendingLinkId={pendingLinkByHost.get(c.hostVenueId) ?? null}
            onContinueSetup={() => setSetupTarget(c.id)}
            onReviewLink={(linkId) => router.push(`/linked-venues?review=${encodeURIComponent(linkId)}` as Href)}
            onAccept={() => {
              // Shared services: the join needs the venue's answers (web contract 6), asked here.
              if (isSharedServices(c)) {
                setJoinTarget(c);
                return;
              }
              memberAction.mutate(
                { collectiveId: c.id, payload: { action: 'accept' } },
                {
                  onSuccess: () => toast.success(`Joined ${c.name}.`),
                  onError: (err) => {
                    if (isConsentRequired(err)) {
                      setJoinTarget(c);
                      return;
                    }
                    toast.error(err instanceof ApiError ? err.message : 'Action failed.');
                  },
                },
              );
            }}
            onDecline={() =>
              runMember(c.id, { action: 'decline' }, `Declined the invitation to ${c.name}.`)
            }
            onLeave={() => setLeaveTarget(c)}
          />
        ))
      )}

      <CreateCollectiveSheet
        visible={createOpen}
        venueName={venueName ?? 'your venue'}
        venueSlug={linksQuery.data?.venue?.slug ?? null}
        onClose={() => setCreateOpen(false)}
        // The sheet stays open on its receipt; the list behind it now holds the new collective.
        onCreated={() => void query.refetch()}
        onOpen={(href) => {
          setCreateOpen(false);
          router.push(href as Href);
        }}
      />

      <LeaveCollectiveSheet
        collective={leaveTarget}
        visible={leaveTarget !== null}
        onClose={() => setLeaveTarget(null)}
        // Already on Venue collectives: the review card above shows once the list is read again.
        onLeft={() => void query.refetch()}
      />

      <JoinCollectiveSheet
        visible={joinTarget !== null}
        collectiveId={joinTarget?.id ?? null}
        collectiveName={joinTarget?.name ?? 'the collective'}
        venueName={venueName ?? 'your venue'}
        onClose={() => setJoinTarget(null)}
        onJoined={() => void query.refetch()}
        onOpenLinked={() => {
          setJoinTarget(null);
          router.push('/linked-venues' as Href);
        }}
      />

      <CollectiveSetupSheet
        visible={setupTarget !== null}
        collectiveId={setupTarget}
        venueName={venueName ?? 'your venue'}
        onClose={() => setSetupTarget(null)}
        onChanged={() => {
          void query.refetch();
          void feed.refetch();
        }}
      />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function formatEndedDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function CollectiveCard({
  collective,
  busy,
  setupNeeded = false,
  memberWaiting = false,
  pendingLinkId = null,
  onManage,
  onViewPage,
  onOpenArea,
  onContinueSetup,
  onReviewLink,
  onAccept,
  onDecline,
  onLeave,
}: {
  collective: CollectiveView;
  busy: boolean;
  /** Host: two venues in and nothing bookable on the page yet (web plan L8). */
  setupNeeded?: boolean;
  /** Member: the host is still setting the page up. */
  memberWaiting?: boolean;
  /** Invited: the invitation rides on this pending link request from the host (web plan L11). */
  pendingLinkId?: string | null;
  onManage: () => void;
  onViewPage: () => void;
  /** Shared services: Manage Collective, where the services across the venues are chosen. */
  onOpenArea: () => void;
  onContinueSetup?: () => void;
  onReviewLink?: (linkId: string) => void;
  onAccept: () => void;
  onDecline: () => void;
  onLeave: () => void;
}) {
  const { colors } = useTheme();
  const dissolved = collective.status === 'dissolved';
  const invited = collective.myMembershipStatus === 'invited';
  const isActiveMember = collective.myMembershipStatus === 'active';
  // A host whose other venues have not accepted yet (web `la.row.host.waiting`; plan L12: one venue is not live).
  const invitedNames = collective.members.filter((m) => m.status === 'invited' && m.venueId !== collective.hostVenueId).map((m) => m.venueName);
  const hostWaiting = !dissolved && collective.isHost && collective.activeMemberCount < 2 && invitedNames.length > 0;
  const accent =
    collective.bookingPageConfig?.brand_primary ?? collective.branding?.primary_colour ?? null;
  const showLink = !dissolved && collective.activeMemberCount >= 2;
  // When it ended (CQ-10.11): read only when the server sends it.
  const endedDate = formatEndedDate(collective.dissolvedAt ?? null);

  return (
    <Card style={styles.cardBody}>
      <View style={styles.cardHeader}>
        {accent ? <View style={[styles.dot, { backgroundColor: accent }]} /> : null}
        <Text variant="bodyMedium" numberOfLines={1} style={styles.flex1}>
          {collective.name}
        </Text>
        <View style={styles.pills}>
          {collective.isHost ? <Badge label="Host" tone="brand" /> : <Badge label="Member" />}
          {dissolved ? (
            <Badge label="Dissolved" />
          ) : invited ? (
            <Badge label="Invitation pending" tone="warning" />
          ) : (
            <Badge label="Active" tone="success" />
          )}
        </View>
      </View>

      <Text variant="caption" tone="muted">
        {collectiveMembersLine(collective)}
      </Text>
      {dissolved && endedDate ? (
        <Text variant="caption" tone="muted">
          {`Ended ${endedDate}`}
        </Text>
      ) : null}
      {hostWaiting ? (
        <Text variant="caption" color={colors.warning}>
          {setupCopy('la.row.host.waiting', { venueList: formatVenueList(invitedNames, 2) })}
        </Text>
      ) : null}
      {!dissolved && collective.isHost && setupNeeded ? (
        <Text variant="caption" color={colors.warning}>
          {setupCopy('finish.row.notLive')}
        </Text>
      ) : null}
      {!dissolved && !collective.isHost && isActiveMember && memberWaiting ? (
        <Text variant="caption" tone="secondary">
          {setupCopy('la.row.member.waiting', { host: collective.members.find((m) => m.venueId === collective.hostVenueId)?.venueName ?? 'The host' })}
        </Text>
      ) : null}
      {invited && pendingLinkId ? (
        <Text variant="caption" tone="secondary">
          {setupCopy('la.row.invitation.pendingLink', { host: collective.members.find((m) => m.venueId === collective.hostVenueId)?.venueName ?? 'The host' })}
        </Text>
      ) : null}

      {showLink ? (
        <PressableScale onPress={onViewPage} accessibilityLabel="View combined booking page">
          <Text variant="caption" color={colors.brand}>
            View combined booking page →
          </Text>
        </PressableScale>
      ) : null}

      {!dissolved ? (
        <View style={styles.cardActions}>
          {invited && pendingLinkId ? (
            <Button
              label="Review the link request"
              variant="primary"
              size="sm"
              disabled={busy}
              onPress={() => onReviewLink?.(pendingLinkId)}
            />
          ) : invited ? (
            <>
              <Button
                label="Accept invitation"
                variant="primary"
                size="sm"
                disabled={busy}
                onPress={onAccept}
              />
              <Button label="Decline" variant="secondary" size="sm" disabled={busy} onPress={onDecline} />
            </>
          ) : collective.isHost ? (
            <>
              {setupNeeded ? (
                <Button label={setupCopy('finish.row.cta')} variant="primary" size="sm" disabled={busy} onPress={onContinueSetup} />
              ) : null}
              {isSharedServices(collective) ? (
                <Button
                  label="Manage Collective"
                  variant={setupNeeded ? 'secondary' : 'primary'}
                  size="sm"
                  disabled={busy}
                  onPress={onOpenArea}
                />
              ) : null}
              <Button
                label="Manage combined page"
                variant={isSharedServices(collective) ? 'secondary' : 'primary'}
                size="sm"
                disabled={busy}
                onPress={onManage}
              />
            </>
          ) : null}
          {isActiveMember && !collective.isHost ? (
            <Button label="Leave" variant="ghost" size="sm" disabled={busy} onPress={onLeave} />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },
  cardBody: {
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
  },
  pills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  amberNote: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
