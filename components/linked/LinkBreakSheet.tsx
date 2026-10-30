/**
 * Unlink, or accept a proposed change, on a link that holds a collective together (CQ-01; web
 * `LinkBreakDialog.tsx`, 2026-10-29). The plain unlink confirm says nothing about the collective; this
 * one says who leaves and what happens to the collective before anything is confirmed, asks for the
 * collective's name when it would end, and offers the narrower path instead:
 *   - the host takes the other venue off the page and keeps the link ("Remove instead", the Remove
 *     confirm from Manage Collective, shown in place);
 *   - a member leaves the collective and keeps its links ("Leave instead", the leave sheet's content,
 *     shown in place).
 * Both are shown inside this one sheet rather than a second sheet on top, which iOS can refuse to
 * present. The parent sends the request with the acknowledgement this sheet hands back.
 *
 * `RemoveFromCollectivePanel` is also shown in place by Reduce access and Edit permissions.
 */
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CollectiveBreakWarning } from '@/components/linked/CollectiveBreakWarning';
import { LeaveCollectivePanel } from '@/components/linked/LeaveCollectiveSheet';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  acknowledgementFor,
  linkBreakConfirmLabel,
  linkBreakNeedsName,
  removalEnds,
  typedNameMatches,
} from '@/lib/linked/collective-hold';
import { setupCopy } from '@/lib/linked/setup-copy';
import { useCollectiveMemberAction } from '@/lib/queries/useCollectives';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CollectiveBreakAcknowledgement, LinkCollectiveBreak } from '@/types/linked-venues';

export type LinkBreakMode = 'unlink' | 'accept';
export type LinkBreakView = 'change' | 'remove' | 'leave';

/**
 * The host takes the other venue off the collective's page and keeps the link (web `remove.*`):
 * PATCH /api/venue/collectives/[id]/members `{ action: 'remove', venueId }`.
 */
export function RemoveFromCollectivePanel({
  info,
  otherVenueId,
  otherVenueName,
  backLabel,
  onBack,
  onRemoved,
}: {
  info: LinkCollectiveBreak;
  otherVenueId: string;
  otherVenueName: string;
  backLabel: string;
  onBack: () => void;
  onRemoved: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const memberAction = useCollectiveMemberAction();
  const [error, setError] = useState<string | null>(null);
  const collective = info.collectiveName;
  const busy = memberAction.isPending;

  return (
    <View style={styles.body} testID="remove-from-collective">
      <Text variant="subheading">{setupCopy('remove.title', { venue: otherVenueName, collective })}</Text>
      <Text variant="bodySmall" tone="secondary">
        {setupCopy('remove.message', { venue: otherVenueName, collective })}
      </Text>
      {removalEnds(info, otherVenueId) ? (
        <Text variant="bodySmall" color={colors.warning}>
          {setupCopy('remove.lastMember', { venue: otherVenueName, collective })}
        </Text>
      ) : null}
      {error ? (
        <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button label={backLabel} variant="secondary" style={styles.flex1} disabled={busy} onPress={onBack} />
        <Button
          label={setupCopy('remove.confirm', { venue: otherVenueName })}
          variant="danger"
          style={styles.flex1}
          disabled={busy}
          loading={busy}
          onPress={() => {
            setError(null);
            memberAction.mutate(
              { collectiveId: info.collectiveId, payload: { action: 'remove', venueId: otherVenueId } },
              {
                onSuccess: () => {
                  toast.success(`${otherVenueName} is no longer part of ${collective}. Your link is unchanged.`);
                  onRemoved();
                },
                onError: (err) =>
                  setError(err instanceof ApiError ? err.message : 'Could not remove the venue. Please try again.'),
              },
            );
          }}
        />
      </View>
    </View>
  );
}

export function LinkBreakSheet({
  visible,
  mode,
  otherVenueId,
  otherVenueName,
  myVenueId,
  info,
  busy,
  error,
  initialView = 'change',
  onClose,
  onConfirm,
  onRemoved,
}: {
  visible: boolean;
  mode: LinkBreakMode;
  otherVenueId: string;
  otherVenueName: string;
  myVenueId: string;
  info: LinkCollectiveBreak;
  busy: boolean;
  error?: string | null;
  /** Open straight on Remove or Leave ("instead" from Reduce access or Edit permissions). */
  initialView?: LinkBreakView;
  onClose: () => void;
  onConfirm: (ack: CollectiveBreakAcknowledgement) => void;
  /** After the host removed the other venue: the link stays, so the parent refreshes it. */
  onRemoved?: () => void;
}) {
  const router = useRouter();
  const [view, setView] = useState<LinkBreakView>(initialView);
  const [typed, setTyped] = useState('');
  const collective = info.collectiveName;
  const back = () => (initialView === 'change' ? setView('change') : onClose());
  const backLabel = initialView === 'change' ? 'Back' : 'Cancel';

  if (view === 'remove') {
    return (
      <Sheet visible={visible} onClose={onClose}>
        <RemoveFromCollectivePanel
          info={info}
          otherVenueId={otherVenueId}
          otherVenueName={otherVenueName}
          backLabel={backLabel}
          onBack={back}
          onRemoved={() => {
            onClose();
            onRemoved?.();
          }}
        />
      </Sheet>
    );
  }

  if (view === 'leave') {
    return (
      <Sheet visible={visible} onClose={onClose}>
        <LeaveCollectivePanel
          collective={{ id: info.collectiveId, name: collective, serviceModel: 'replicas' }}
          active={visible}
          onCancel={back}
          onLeft={() => {
            onClose();
            // Venue collectives shows the review of the services that are now the venue's own.
            router.replace('/collectives' as Href);
          }}
        />
      </Sheet>
    );
  }

  const nameNeeded = linkBreakNeedsName(info);
  return (
    <Sheet visible={visible} onClose={busy ? () => undefined : onClose} maxHeight="92%" fill>
      <View style={styles.container}>
        <ScrollView style={styles.flex1} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text variant="subheading">
            {mode === 'unlink' ? `Unlink from ${otherVenueName}?` : `Accept ${otherVenueName}’s change?`}
          </Text>
          <Text variant="bodySmall" tone="secondary">
            {mode === 'unlink'
              ? 'Cross-venue access stops immediately for both venues. To link again later, send a new request from either venue.'
              : 'The permissions they proposed apply as soon as you accept.'}
          </Text>
          <CollectiveBreakWarning
            info={info}
            myVenueId={myVenueId}
            otherVenueName={otherVenueName}
            onRemoveInstead={() => setView('remove')}
            onLeaveInstead={() => setView('leave')}
            typed={typed}
            onTypedChange={setTyped}
            disabled={busy}
          />
          {error ? (
            <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </ScrollView>
        <View style={styles.actions}>
          <Button label="Cancel" variant="secondary" disabled={busy} onPress={onClose} />
          <Button
            label={linkBreakConfirmLabel(mode, info, myVenueId)}
            variant="danger"
            style={styles.flex1}
            disabled={busy || (nameNeeded && !typedNameMatches(typed, collective))}
            loading={busy}
            onPress={() => onConfirm(acknowledgementFor(info.collectiveId, info.plan))}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // `fill` sheets supply no horizontal padding, so the container carries the standard inset.
  container: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  body: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
