import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CollectiveBreakWarning } from '@/components/linked/CollectiveBreakWarning';
import { GrantEditor } from '@/components/linked/GrantEditor';
import { LeaveCollectivePanel } from '@/components/linked/LeaveCollectiveSheet';
import { RemoveFromCollectivePanel } from '@/components/linked/LinkBreakSheet';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  acknowledgementFor,
  breakFromHold,
  grantsHoldCollective,
  linkBreakConfirmLabel,
  linkBreakFromError,
  linkBreakNeedsName,
  typedNameMatches,
} from '@/lib/linked/collective-hold';
import { grantsEqual, isReductionOnly, normaliseGrant } from '@/lib/linked/grants';
import { useReduceAccess } from '@/lib/queries/useLinkedVenues';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AccountLinkView, LinkCollectiveBreak, LinkCollectiveHold, LinkGrant } from '@/types/linked-venues';

/**
 * Reduce the access your venue grants the other venue, mirroring the web
 * `ReduceAccessModal` (Flow 5). A single `GrantEditor` over `link.theyCan`
 * (= what the other venue can do with YOUR data), locked to reductions: the
 * submit is gated by `isReductionOnly`, and a guidance banner appears if the
 * edit would increase access. POST .../reduce — immediate, no consent.
 *
 * On a link that holds a collective together (CQ-01), a reduction below full access says who leaves
 * the collective before it is confirmed, renames the button, asks for the collective's name when it
 * would end, and offers Remove (host) or Leave (member) instead, in this sheet. The request carries
 * the plan shown; a 409 `LINK_HOLDS_COLLECTIVE` (the plan moved, or the hold was not known) shows
 * the server's plan to confirm again.
 */
export function ReduceAccessSheet({
  link,
  visible,
  myCalendars = [],
  onClose,
  onDone,
  myVenueId = '',
  hold = null,
  onRemoved,
}: {
  link: AccountLinkView | null;
  visible: boolean;
  /** §18 — your own calendars, for the scope picker. */
  myCalendars?: { id: string; name: string }[];
  onClose: () => void;
  /** Called after a successful reduce. */
  onDone?: () => void;
  /** This venue's id, to word the collective warning (CQ-01). */
  myVenueId?: string;
  /** The collective this link holds together, if any (CQ-01). */
  hold?: LinkCollectiveHold | null;
  /** After "Remove instead" took the other venue off the page. */
  onRemoved?: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const reduceAccess = useReduceAccess();

  const [grant, setGrantRaw] = useState<LinkGrant>(
    link?.theyCan ?? { calendar: 'none', pii: false, act: 'none' },
  );
  /** The plan the server sent back with a 409; cleared when the venue changes what it staged. */
  const [serverBreak, setServerBreak] = useState<LinkCollectiveBreak | null>(null);
  const [typed, setTyped] = useState('');
  const [view, setView] = useState<'edit' | 'remove' | 'leave'>('edit');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && link) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGrantRaw(link.theyCan);
      setServerBreak(null);
      setTyped('');
      setView('edit');
      setError(null);
    }
  }, [visible, link]);

  if (!link) return null;

  const setGrant = (g: LinkGrant) => {
    setServerBreak(null);
    setError(null);
    setGrantRaw(g);
  };

  const name = link.otherVenue.name;
  const busy = reduceAccess.isPending;
  const current = normaliseGrant(link.theyCan);
  const next = normaliseGrant(grant);
  const isReduction = isReductionOnly(current, next);
  const hasChanged = !grantsEqual(current, next);
  const zeroWay = next.calendar === 'none' && normaliseGrant(link.iCan).calendar === 'none';
  // Below full access, a link that holds a collective takes a venue out of it (CQ-01).
  const breaks = hasChanged && !grantsHoldCollective(link.iCan, next);
  const info = serverBreak ?? (hold && breaks ? breakFromHold(hold, 'ifIChange') : null);
  const breakInfo = isReduction ? info : null;
  const nameMissing = linkBreakNeedsName(breakInfo) && !typedNameMatches(typed, breakInfo?.collectiveName ?? '');

  const handleSubmit = () => {
    setError(null);
    reduceAccess.mutate(
      { linkId: link.id, grant, acknowledge: breakInfo ? acknowledgementFor(breakInfo.collectiveId, breakInfo.plan) : null },
      {
        onSuccess: () => {
          toast.success(`Reduced ${name}’s access.`);
          onDone?.();
          onClose();
        },
        onError: (err) => {
          // The change takes a venue out of a collective: show who, and ask again (CQ-01). The first
          // refusal is expected when the warning was not shown; a second means the plan moved.
          const refused = linkBreakFromError(err);
          if (refused) {
            setServerBreak(refused.info);
            setError(breakInfo ? refused.message : null);
            return;
          }
          toast.error(err instanceof ApiError ? err.message : 'Failed to reduce access.');
        },
      },
    );
  };

  if (view !== 'edit' && breakInfo) {
    return (
      <Sheet visible={visible} onClose={onClose} maxHeight="90%" fill>
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollBody, styles.inset]}>
          {view === 'remove' ? (
            <RemoveFromCollectivePanel
              info={breakInfo}
              otherVenueId={link.otherVenue.id}
              otherVenueName={name}
              backLabel="Back"
              onBack={() => setView('edit')}
              onRemoved={() => {
                onClose();
                onRemoved?.();
              }}
            />
          ) : (
            <LeaveCollectivePanel
              collective={{ id: breakInfo.collectiveId, name: breakInfo.collectiveName, serviceModel: 'replicas' }}
              active={visible}
              onCancel={() => setView('edit')}
              onLeft={() => {
                onClose();
                router.replace('/collectives' as Href);
              }}
            />
          )}
        </ScrollView>
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="90%" fill>
      <View style={styles.container}>
        <View>
          <Text variant="subheading">{`Reduce ${name}’s access`}</Text>
          <Text variant="bodySmall" tone="secondary">
            Lower the access your venue grants. This takes effect immediately and does not need the
            other venue’s consent.
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollBody}
          keyboardShouldPersistTaps="handled">
          <GrantEditor
            label={`What ${name} can do with your data`}
            revenueNote={`${name} also sees your booking reports.`}
            value={grant}
            onChange={setGrant}
            disabled={busy}
            reductionOnly
            calendars={myCalendars}
          />

          {!isReduction ? (
            <View style={[styles.notice, { backgroundColor: colors.dangerSurface }]}>
              <Text variant="caption" tone="danger">
                This control can only reduce access. To grant more, use “Edit permissions”.
              </Text>
            </View>
          ) : null}

          {breakInfo ? (
            <CollectiveBreakWarning
              info={breakInfo}
              myVenueId={myVenueId}
              otherVenueName={name}
              onRemoveInstead={() => setView('remove')}
              onLeaveInstead={() => setView('leave')}
              typed={typed}
              onTypedChange={setTyped}
              disabled={busy}
            />
          ) : null}

          {error ? (
            <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <Button label="Cancel" variant="ghost" disabled={busy} onPress={onClose} />
          <Button
            label={breakInfo ? linkBreakConfirmLabel('reduce', breakInfo, myVenueId) : 'Reduce access'}
            variant="danger"
            style={styles.flex1}
            disabled={busy || !isReduction || !hasChanged || zeroWay || (!!breakInfo && nameMissing)}
            loading={busy}
            onPress={handleSubmit}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // `fill` + a flexing ScrollView: the body outgrows the sheet, and a
  // content-sized one can't scroll AND pushes the pinned actions off the
  // bottom. `fill` Sheets supply no horizontal padding, so the container
  // carries the standard inset itself.
  container: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  scroll: {
    flex: 1,
  },
  inset: {
    paddingHorizontal: spacing.lg,
  },
  scrollBody: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  notice: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  flex1: {
    flex: 1,
  },
});
