import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EditPermissionsSheet } from '@/components/linked/EditPermissionsSheet';
import { GrantBullets } from '@/components/linked/GrantBullets';
import { IncomingRequestSheet } from '@/components/linked/IncomingRequestSheet';
import { LinkAuditView } from '@/components/linked/LinkAuditView';
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
import { describeGrant } from '@/lib/linked/grants';
import { terminationReasonLabel } from '@/lib/linked/linkStatus';
import { PAST_LINK_STATUSES } from '@/types/linked-venues';
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

  const link = (query.data?.links ?? []).find((l) => l.id === linkId) ?? null;

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

  const handleUnlink = () => {
    unlink.mutate(link.id, {
      onSuccess: () => {
        toast.success(`Unlinked from ${name}.`);
        setUnlinkOpen(false);
        router.back();
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : 'Could not unlink.'),
    });
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

  const handleAccept = () => {
    respond.mutate(
      { linkId: link.id, action: 'accept' },
      {
        onSuccess: () => {
          toast.success(`You’re now linked with ${name}.`);
          setReviewOpen(false);
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Could not accept the request.'),
      },
    );
  };

  const handleReject = () => {
    respond.mutate(
      { linkId: link.id, action: 'reject' },
      {
        onSuccess: () => {
          toast.success(`Declined ${name}’s request.`);
          setReviewOpen(false);
          router.back();
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Could not reject the request.'),
      },
    );
  };

  const handleAcceptChange = () => {
    respond.mutate(
      { linkId: link.id, action: 'accept_change' },
      {
        onSuccess: () => toast.success('Permission change accepted.'),
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Failed to update link.'),
      },
    );
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

  const reviewPending: 'accept' | 'reject' | null = respond.isPending
    ? respond.variables?.action === 'accept'
      ? 'accept'
      : respond.variables?.action === 'reject'
        ? 'reject'
        : null
    : null;

  const linkedDate = formatDate(link.respondedAt);
  const endedDate = formatDate(link.terminatedAt);

  return (
    <Screen scroll padded>
      <Stack.Screen options={{ title: 'Linked venue' }} />

      <View style={styles.header}>
        <Text variant="title">{name}</Text>
        <LinkStatusBadge status={link.status} />
      </View>

      {link.status === 'suspended' ? (
        <View style={[styles.banner, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
          <Text variant="bodySmall" color={colors.warning}>
            {`Suspended — ${name}’s subscription is inactive. The link resumes automatically if their subscription is restored within 30 days.`}
          </Text>
        </View>
      ) : null}

      {link.pendingChange ? (
        <View style={[styles.banner, { backgroundColor: colors.infoSurface, borderColor: colors.info }]}>
          <Text variant="label" color={colors.info}>
            {link.pendingChange.proposedByMe
              ? 'You proposed a permission change — awaiting their response.'
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
                onPress={handleAcceptChange}
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
            <Button
              label="View linked calendar"
              variant="primary"
              fullWidth
              disabled={busy}
              onPress={() => router.push('/linked-venues/calendar' as Href)}
            />
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
            onPress={() => setUnlinkOpen(true)}
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

      <IncomingRequestSheet
        link={reviewOpen ? link : null}
        visible={reviewOpen}
        pending={reviewPending}
        onClose={() => setReviewOpen(false)}
        onAccept={handleAccept}
        onReject={handleReject}
      />

      <ConfirmSheet
        visible={unlinkOpen}
        title={`Unlink from ${name}?`}
        message="Cross-venue access stops immediately for both venues. To link again later, send a new request from either venue."
        confirmLabel="Unlink"
        cancelLabel="Cancel"
        destructive
        loading={unlink.isPending}
        onConfirm={handleUnlink}
        onClose={() => setUnlinkOpen(false)}
      />

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
      />

      <ReduceAccessSheet
        link={reduceOpen ? link : null}
        visible={reduceOpen}
        myCalendars={myCalendars}
        onClose={() => setReduceOpen(false)}
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
