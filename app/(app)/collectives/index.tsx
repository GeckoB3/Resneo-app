import { Stack, useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { Linking, RefreshControl, StyleSheet, View } from 'react-native';

import { CreateCollectiveSheet } from '@/components/linked/CreateCollectiveSheet';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { getWebUrl } from '@/lib/env';
import {
  useCollectiveMemberAction,
  useCollectives,
} from '@/lib/queries/useCollectives';
import { useLinkedVenues } from '@/lib/queries/useLinkedVenues';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useVenueContext } from '@/providers/VenueProvider';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CollectiveView } from '@/types/collectives';
import type { AccountLinkView } from '@/types/linked-venues';

/**
 * Linked venues eligible for a COMBINED page: full calendar detail AND
 * create/edit/cancel access in BOTH directions (matches the web create/invite
 * write gate `fullMutualLinks`).
 */
function fullMutualLinks(links: AccountLinkView[]): AccountLinkView[] {
  return links.filter(
    (l) =>
      l.status === 'accepted' &&
      l.iCan.calendar === 'full_details' &&
      l.theyCan.calendar === 'full_details' &&
      l.iCan.act === 'create_edit_cancel' &&
      l.theyCan.act === 'create_edit_cancel',
  );
}

export default function CollectivesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();

  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  const { name: venueName } = useVenueContext();

  const query = useCollectives();
  const linksQuery = useLinkedVenues();
  const memberAction = useCollectiveMemberAction();

  const [createOpen, setCreateOpen] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<CollectiveView | null>(null);

  const collectives = useMemo<CollectiveView[]>(
    () => query.data?.collectives ?? [],
    [query.data?.collectives],
  );
  const eligibleLinks = useMemo(
    () => fullMutualLinks(linksQuery.data?.links ?? []),
    [linksQuery.data?.links],
  );
  const hasLiveCollective = collectives.some((c) => c.status !== 'dissolved');

  const openWeb = (slug: string) => {
    const base = getWebUrl() || 'https://app.resneo.com';
    const url = `${base}/book/c/${slug}`;
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
          onRefresh={() => void query.refetch()}
          tintColor={colors.brand}
        />
      }>
      <Stack.Screen options={{ title: 'Venue collectives' }} />

      <Text variant="bodySmall" tone="secondary">
        A venue collective is a shared public booking page joining two or more fully linked venues
        under one brand.
      </Text>

      {collectives.length === 0 ? (
        <Card>
          <Text variant="bodySmall" tone="muted">
            {eligibleLinks.length === 0
              ? 'A combined page needs a link granting create/edit/cancel access in both directions. Create one first from Linked venues.'
              : 'No venue collectives yet. Create one to offer a combined booking page.'}
          </Text>
        </Card>
      ) : (
        collectives.map((c) => (
          <CollectiveCard
            key={c.id}
            collective={c}
            busy={busy}
            onManage={() => router.push(`/collectives/${c.id}` as Href)}
            onViewPage={() => openWeb(c.slug)}
            onAccept={() =>
              runMember(c.id, { action: 'accept' }, `Joined ${c.name}.`)
            }
            onDecline={() =>
              runMember(c.id, { action: 'decline' }, `Declined the invitation to ${c.name}.`)
            }
            onLeave={() => setLeaveTarget(c)}
          />
        ))
      )}

      {/* Create — hidden once already in a live collective (one per venue). */}
      {!hasLiveCollective ? (
        <View style={styles.createBlock}>
          <Button
            label="Create venue collective"
            variant="primary"
            fullWidth
            disabled={eligibleLinks.length === 0}
            onPress={() => setCreateOpen(true)}
          />
          {eligibleLinks.length === 0 ? (
            <Text variant="caption" tone="muted">
              You need at least one link granting create/edit/cancel access both ways. Set one up
              from Linked venues first.
            </Text>
          ) : null}
        </View>
      ) : null}

      <CreateCollectiveSheet
        visible={createOpen}
        venueName={venueName ?? 'your venue'}
        eligibleLinks={eligibleLinks}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void query.refetch();
        }}
      />

      <ConfirmSheet
        visible={leaveTarget !== null}
        title="Leave this collective?"
        message={
          leaveTarget
            ? `Your venue will be removed from "${leaveTarget.name}". Your own booking page is unaffected.`
            : undefined
        }
        confirmLabel="Leave collective"
        cancelLabel="Cancel"
        destructive
        loading={busy}
        onConfirm={() => {
          if (!leaveTarget) return;
          const target = leaveTarget;
          setLeaveTarget(null);
          runMember(target.id, { action: 'leave' }, `Left ${target.name}.`);
        }}
        onClose={() => setLeaveTarget(null)}
      />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function CollectiveCard({
  collective,
  busy,
  onManage,
  onViewPage,
  onAccept,
  onDecline,
  onLeave,
}: {
  collective: CollectiveView;
  busy: boolean;
  onManage: () => void;
  onViewPage: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onLeave: () => void;
}) {
  const { colors } = useTheme();
  const dissolved = collective.status === 'dissolved';
  const invited = collective.myMembershipStatus === 'invited';
  const isActiveMember = collective.myMembershipStatus === 'active';
  const accent =
    collective.bookingPageConfig?.brand_primary ?? collective.branding?.primary_colour ?? null;
  const showLink = !dissolved && collective.activeMemberCount >= 2;

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
        {`${collective.activeMemberCount} active ${collective.activeMemberCount === 1 ? 'member' : 'members'} · ${collective.members
          .map((m) => m.venueName)
          .join(', ')}`}
      </Text>

      {showLink ? (
        <PressableScale onPress={onViewPage} accessibilityLabel="View combined booking page">
          <Text variant="caption" color={colors.brand}>
            View combined booking page →
          </Text>
        </PressableScale>
      ) : null}

      {!dissolved ? (
        <View style={styles.cardActions}>
          {invited ? (
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
            <Button label="Manage combined page" variant="primary" size="sm" disabled={busy} onPress={onManage} />
          ) : (
            <Button label="View details" variant="secondary" size="sm" onPress={onManage} />
          )}
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
  createBlock: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
