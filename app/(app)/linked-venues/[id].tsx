import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EditPermissionsSheet } from '@/components/linked/EditPermissionsSheet';
import { GrantBullets } from '@/components/linked/GrantBullets';
import { ReviewLinkRequestSheet } from '@/components/linked/setup/ReviewLinkRequestSheet';
import { LinkAuditView } from '@/components/linked/LinkAuditView';
import { LinkBreakSheet, type LinkBreakMode, type LinkBreakView } from '@/components/linked/LinkBreakSheet';
import { LinkStatusBadge } from '@/components/linked/LinkStatusBadge';
import { ReduceAccessSheet } from '@/components/linked/ReduceAccessSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  breakFromHold,
  collectiveHoldLine,
  grantsHoldCollective,
  linkBreakFromError,
} from '@/lib/linked/collective-hold';
import { describeGrant } from '@/lib/linked/grants';
import { terminationReasonLabel } from '@/lib/linked/linkStatus';
import {
  PAST_LINK_STATUSES,
  type CollectiveBreakAcknowledgement,
  type LinkCollectiveBreak,
} from '@/types/linked-venues';
import {
  useLinkedVenues,
  useMyCalendars,
  useRespondLink,
  useUnlinkVenue,
} from '@/lib/queries/useLinkedVenues';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function LinkedVenueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();

  const linkId = typeof id === 'string' ? id : undefined;
  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  const query = useLinkedVenues();
  const respond = useRespondLink();
  const unlink = useUnlinkVenue();
  const myCalendarsQuery = useMyCalendars();
  const myCalendars = myCalendarsQuery.data?.calendars ?? [];

  const [reviewOpen, setReviewOpen] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reduceOpen, setReduceOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [declineChangeOpen, setDeclineChangeOpen] = useState(false);
  /**
   * Unlink or Accept change on a link that holds a collective together (CQ-01): who leaves, before
   * anything is confirmed. Opened from the link's hold, or from the server's 409 when it knew of a
   * hold the list did not; `error` is the server's sentence when the plan moved after it was shown.
   */
  const [breakSheet, setBreakSheet] = useState<{
    mode: LinkBreakMode;
    info: LinkCollectiveBreak;
    error: string | null;
    initialView?: LinkBreakView;
  } | null>(null);

  const link = (query.data?.links ?? []).find((l) => l.id === linkId) ?? null;
  const myVenueId = query.data?.venue.id ?? '';
  const hold = link ? (query.data?.collectiveHolds?.[link.id] ?? null) : null;

  if (!staffQuery.isLoading && !isAdmin) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Linked venue' }} />
        <EmptyState title="Admins only" message="Linked venues are managed by venue admins." />
      </Screen>
    );
  }

  if (query.isLoading || staffQuery.isLoading) {
    return (
      <Screen scroll>
        <Stack.Screen options={{ title: 'Linked venue' }} />
        <DetailSkeleton />
      </Screen>
    );
  }

  if (query.isError) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Linked venue' }} />
        <ErrorState
          message={query.error instanceof ApiError ? query.error.message : 'Could not load this link.'}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  if (!link) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Linked venue' }} />
        <ErrorState message="This link could not be found. It may have been removed." />
      </Screen>
    );
  }

  const name = link.otherVenue.name;
  const isActive = link.status === 'accepted' || link.status === 'suspended';
  const isPendingReceived = link.status === 'pending' && !link.initiatedByMe;
  const isPendingSent = link.status === 'pending' && link.initiatedByMe;
  const isPast = PAST_LINK_STATUSES.includes(link.status);

  const busy = respond.isPending || unlink.isPending;

  /** A refused link change that takes a venue out of a collective: show who, and ask again (CQ-01). */
  const showBreak = (mode: LinkBreakMode, err: unknown, acknowledged: boolean): boolean => {
    const refused = linkBreakFromError(err);
    if (!refused) return false;
    // The first refusal is expected when the warning was not shown; a second means the plan moved.
    const next = { mode, info: refused.info, error: acknowledged ? refused.message : null };
    if (unlinkOpen) {
      // The plain confirm was open (the list did not know of the hold): let it close before the
      // warning opens, since iOS can refuse to present a sheet while another is going away.
      setUnlinkOpen(false);
      setTimeout(() => setBreakSheet(next), 400);
    } else {
      setBreakSheet(next);
    }
    return true;
  };

  const handleUnlink = (acknowledge: CollectiveBreakAcknowledgement | null = null) => {
    unlink.mutate(
      { linkId: link.id, acknowledge },
      {
        onSuccess: () => {
          toast.success(`Unlinked from ${name}.`);
          setUnlinkOpen(false);
          setBreakSheet(null);
          router.back();
        },
        onError: (err) => {
          if (showBreak('unlink', err, acknowledge !== null)) return;
          toast.error(err instanceof ApiError ? err.message : 'Could not unlink.');
        },
      },
    );
  };

  const openUnlink = () => {
    // A link that holds a collective together says what unlinking does to it (CQ-01).
    if (hold) setBreakSheet({ mode: 'unlink', info: breakFromHold(hold, 'ifIChange'), error: null });
    else setUnlinkOpen(true);
  };

  const handleCancel = () => {
    respond.mutate(
      { linkId: link.id, action: 'cancel' },
      {
        onSuccess: () => {
          toast.success('Request cancelled.');
          setCancelOpen(false);
          router.back();
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Could not cancel the request.'),
      },
    );
  };

  const handleAcceptChange = (acknowledge: CollectiveBreakAcknowledgement | null = null) => {
    respond.mutate(
      { linkId: link.id, action: 'accept_change', acknowledge },
      {
        onSuccess: () => {
          toast.success('Permission change accepted.');
          setBreakSheet(null);
        },
        onError: (err) => {
          if (showBreak('accept', err, acknowledge !== null)) return;
          toast.error(err instanceof ApiError ? err.message : 'Failed to update link.');
        },
      },
    );
  };

  const openAcceptChange = () => {
    // Accepting a change that takes the link below full access asks first; anything else stays one tap.
    const pc = link.pendingChange;
    if (hold && pc && !grantsHoldCollective(pc.iCan, pc.theyCan)) {
      setBreakSheet({ mode: 'accept', info: breakFromHold(hold, 'ifTheyChange'), error: null });
    } else {
      handleAcceptChange();
    }
  };

  const handleDeclineChange = () => {
    respond.mutate(
      { linkId: link.id, action: 'reject_change' },
      {
        onSuccess: () => {
          toast.success('Permission change declined.');
          setDeclineChangeOpen(false);
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Failed to decline change.'),
      },
    );
  };

  const handleWithdrawChange = () => {
    respond.mutate(
      { linkId: link.id, action: 'cancel_change' },
      {
        onSuccess: () => toast.success('Pending change withdrawn.'),
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Failed to withdraw change.'),
      },
    );
  };

  const linkedDate = formatDate(link.respondedAt);
  const endedDate = formatDate(link.terminatedAt);

  return (
    <Screen scroll padded>
      <Stack.Screen options={{ title: 'Linked venue' }} />

      <View style={styles.header}>
        <Text variant="title">{name}</Text>
        <LinkStatusBadge status={link.status} />
      </View>

      {hold && isActive ? (
        <View
          testID="collective-hold-line"
          style={[styles.banner, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
          <Text variant="bodySmall">{collectiveHoldLine(hold, myVenueId)}</Text>
        </View>
      ) : null}

      {link.status === 'suspended' ? (
        <View style={[styles.banner, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
          <Text variant="bodySmall" color={colors.warning}>
            {`Suspended: ${name}’s subscription is inactive. The link resumes automatically if their subscription is restored within 30 days.`}
          </Text>
        </View>
      ) : null}

      {link.pendingChange ? (
        <View style={[styles.banner, { backgroundColor: colors.infoSurface, borderColor: colors.info }]}>
          <Text variant="label" color={colors.info}>
            {link.pendingChange.proposedByMe
              ? 'You proposed a permission change. Waiting for their response.'
              : `${name} proposed a permission change.`}
          </Text>
          <View style={styles.pendingGrants}>
            <Text variant="caption" tone="secondary">
              {`You would: ${describeGrant(link.pendingChange.iCan).join(', ')}`}
            </Text>
            <Text variant="caption" tone="secondary">
              {`${name} would: ${describeGrant(link.pendingChange.theyCan).join(', ')}`}
            </Text>
          </View>
          {link.pendingChange.proposedByMe ? (
            <Button
              label="Withdraw change"
              variant="secondary"
              disabled={busy}
              loading={respond.isPending && respond.variables?.action === 'cancel_change'}
              onPress={handleWithdrawChange}
            />
          ) : (
            <View style={styles.pendingActions}>
              <Button
                label="Accept change"
                variant="primary"
                style={styles.flex1}
                disabled={busy}
                loading={respond.isPending && respond.variables?.action === 'accept_change'}
                onPress={openAcceptChange}
              />
              <Button
                label="Decline change"
                variant="secondary"
                style={styles.flex1}
                disabled={busy}
                onPress={() => setDeclineChangeOpen(true)}
              />
            </View>
          )}
        </View>
      ) : null}

      {isActive ? (
        <Card>
          <View style={styles.grants}>
            <GrantBullets heading="You can:" grant={link.iCan} />
            <GrantBullets heading={`${name} can:`} grant={link.theyCan} />
          </View>
        </Card>
      ) : null}

      {(isPendingReceived || isPendingSent) ? (
        <Card>
          <View style={styles.grants}>
            <GrantBullets heading={`${name} would be able to:`} grant={link.theyCan} />
            <GrantBullets heading="You would be able to:" grant={link.iCan} />
          </View>
        </Card>
      ) : null}

      {isPast ? (
        <Card>
          <Text variant="bodySmall" tone="secondary">
            {terminationReasonLabel(link.terminationReason) ?? 'This link is no longer active.'}
          </Text>
        </Card>
      ) : null}

      {/* Primary action by state */}
      {isActive ? (
        <View style={styles.actions}>
          {link.iCan.calendar !== 'none' ? (
            <Text variant="caption" tone="muted">
              {`${link.otherVenue.name}'s calendars appear on your Calendar tab as their own columns.`}
            </Text>
          ) : null}

          <Button
            label="View audit log"
            variant="secondary"
            fullWidth
            disabled={busy}
            onPress={() => setAuditOpen(true)}
          />

          {link.status !== 'suspended' && !link.pendingChange ? (
            <Button
              label="Edit permissions"
              variant="secondary"
              fullWidth
              disabled={busy}
              onPress={() => setEditOpen(true)}
            />
          ) : null}

          {link.status !== 'suspended' && link.pendingChange ? (
            <Text variant="caption" tone="muted">
              {link.pendingChange.proposedByMe
                ? 'Withdraw your pending permission change above before proposing a new one.'
                : 'Respond to the pending permission change above before proposing a new one.'}
            </Text>
          ) : null}

          <Button
            label="Reduce access now"
            variant="secondary"
            fullWidth
            disabled={busy}
            onPress={() => setReduceOpen(true)}
          />

          <Button
            label="Unlink"
            variant="danger"
            fullWidth
            disabled={busy}
            loading={unlink.isPending}
            onPress={openUnlink}
          />
        </View>
      ) : null}

      {isPendingReceived ? (
        <Button label="Review request" variant="primary" fullWidth onPress={() => setReviewOpen(true)} />
      ) : null}

      {isPendingSent ? (
        <Button
          label="Cancel request"
          variant="secondary"
          fullWidth
          disabled={busy}
          loading={respond.isPending}
          onPress={() => setCancelOpen(true)}
        />
      ) : null}

      <View style={styles.footer}>
        {linkedDate && isActive ? (
          <Text variant="caption" tone="muted">{`Linked ${linkedDate}`}</Text>
        ) : null}
        {endedDate && isPast ? (
          <Text variant="caption" tone="muted">{`Ended ${endedDate}`}</Text>
        ) : null}
      </View>

      <ReviewLinkRequestSheet
        link={reviewOpen ? link : null}
        visible={reviewOpen}
        venueName={query.data?.venue.name ?? 'Your venue'}
        myCalendars={myCalendars}
        collective={query.data?.proposedCollectives?.[link.id] ?? null}
        onClose={() => setReviewOpen(false)}
        onDone={(outcome) => {
          if (outcome.declined) router.back();
        }}
        onOpenLinked={() => {
          setReviewOpen(false);
          router.push('/linked-venues');
        }}
      />

      <ConfirmSheet
        visible={unlinkOpen}
        title={`Unlink from ${name}?`}
        message="Cross-venue access stops immediately for both venues. To link again later, send a new request from either venue."
        confirmLabel="Unlink"
        cancelLabel="Cancel"
        destructive
        loading={unlink.isPending}
        onConfirm={() => handleUnlink()}
        onClose={() => setUnlinkOpen(false)}
      />

      {breakSheet ? (
        <LinkBreakSheet
          key={`${breakSheet.mode}-${breakSheet.initialView ?? 'change'}`}
          visible
          mode={breakSheet.mode}
          otherVenueId={link.otherVenue.id}
          otherVenueName={name}
          myVenueId={myVenueId}
          info={breakSheet.info}
          busy={breakSheet.mode === 'unlink' ? unlink.isPending : respond.isPending}
          error={breakSheet.error}
          initialView={breakSheet.initialView}
          onClose={() => setBreakSheet(null)}
          onConfirm={(ack) => (breakSheet.mode === 'unlink' ? handleUnlink(ack) : handleAcceptChange(ack))}
          onRemoved={() => void query.refetch()}
        />
      ) : null}

      <ConfirmSheet
        visible={cancelOpen}
        title={`Cancel request to ${name}?`}
        message="The pending link request will be withdrawn. You can send a new one later."
        confirmLabel="Cancel request"
        cancelLabel="Keep request"
        destructive
        loading={respond.isPending}
        onConfirm={handleCancel}
        onClose={() => setCancelOpen(false)}
      />

      <EditPermissionsSheet
        link={editOpen ? link : null}
        visible={editOpen}
        myCalendars={myCalendars}
        onClose={() => setEditOpen(false)}
        myVenueId={myVenueId}
        hold={hold}
        onRemoved={() => void query.refetch()}
      />

      <ReduceAccessSheet
        link={reduceOpen ? link : null}
        visible={reduceOpen}
        myCalendars={myCalendars}
        onClose={() => setReduceOpen(false)}
        myVenueId={myVenueId}
        hold={hold}
        onRemoved={() => void query.refetch()}
      />

      <ConfirmSheet
        visible={declineChangeOpen}
        title={`Decline ${name}’s change?`}
        message="The proposed permissions won’t be applied and your current access stays as it is. The other venue can propose a new change later."
        confirmLabel="Decline change"
        cancelLabel="Keep reviewing"
        destructive
        loading={respond.isPending && respond.variables?.action === 'reject_change'}
        onConfirm={handleDeclineChange}
        onClose={() => setDeclineChangeOpen(false)}
      />

      <Sheet visible={auditOpen} onClose={() => setAuditOpen(false)} fill maxHeight="92%">
        <View style={styles.auditHeader}>
          <Text variant="subheading">Cross-venue audit log</Text>
        </View>
        {auditOpen ? <LinkAuditView linkId={link.id} otherVenueName={name} /> : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  banner: {
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.base,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  pendingGrants: {
    gap: spacing.xs,
  },
  pendingActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  grants: {
    gap: spacing.lg,
  },
  actions: {
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
  footer: {
    marginTop: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  auditHeader: {
    paddingHorizontal: spacing.lg,
  },
});
