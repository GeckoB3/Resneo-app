import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CollectiveBreakWarning } from '@/components/linked/CollectiveBreakWarning';
import { GrantPairEditor } from '@/components/linked/GrantPairEditor';
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
import { classifyGrantChange, normaliseGrant } from '@/lib/linked/grants';
import { useGrantAccess, useReduceAccess, useRespondLink } from '@/lib/queries/useLinkedVenues';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AccountLinkView, LinkCollectiveBreak, LinkCollectiveHold, LinkGrant } from '@/types/linked-venues';

/**
 * Edit the permissions on an active link, mirroring the web `EditPermissionsModal`.
 *
 * Both directions are editable via `GrantPairEditor`. On submit,
 * `classifyGrantChange(current, next)` decides the action AND the button label:
 *  - increase-only on MY grant   → POST .../grant   "Expand access now" (immediate)
 *  - reduction-only on MY grant  → POST .../reduce   "Reduce access now" (immediate)
 *  - their side / mixed change   → PATCH propose_change "Propose change" (negotiated)
 *
 * Grant framing (matches the web): `mine` = what the other venue can do with MY
 * data (= link.theyCan); `theirs` = what I can do with THEIR data (= link.iCan).
 *
 * A negotiated change is blocked while a pending change already exists.
 *
 * On a link that holds a collective together (CQ-01), a change below full access both ways shows who
 * would leave the collective: headed "If {venue} accepts this change:" for a proposal, and for a
 * reduction made now with the button renamed and, when the collective would end, its name to type.
 * Remove (host) or Leave (member) is offered instead, in this sheet.
 */
export function EditPermissionsSheet({
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
  /** Called after a successful grant/reduce/propose. */
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

  const grantAccess = useGrantAccess();
  const reduceAccess = useReduceAccess();
  const respond = useRespondLink();

  const [mine, setMineRaw] = useState<LinkGrant>(
    link?.theyCan ?? { calendar: 'none', pii: false, act: 'none' },
  );
  const [theirs, setTheirsRaw] = useState<LinkGrant>(
    link?.iCan ?? { calendar: 'none', pii: false, act: 'none' },
  );
  /** The plan the server sent back with a 409; cleared when the venue changes what it staged. */
  const [serverBreak, setServerBreak] = useState<LinkCollectiveBreak | null>(null);
  const [typed, setTyped] = useState('');
  const [view, setView] = useState<'edit' | 'remove' | 'leave'>('edit');
  const [error, setError] = useState<string | null>(null);

  // Re-seed from the link each time the sheet opens (bounded key-based reset).
  useEffect(() => {
    if (visible && link) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMineRaw(link.theyCan);
      setTheirsRaw(link.iCan);
      setServerBreak(null);
      setTyped('');
      setView('edit');
      setError(null);
    }
  }, [visible, link]);

  if (!link) return null;

  const setMine = (g: LinkGrant) => {
    setServerBreak(null);
    setError(null);
    setMineRaw(g);
  };
  const setTheirs = (g: LinkGrant) => {
    setServerBreak(null);
    setError(null);
    setTheirsRaw(g);
  };

  const name = link.otherVenue.name;
  const busy = grantAccess.isPending || reduceAccess.isPending || respond.isPending;

  const classification = classifyGrantChange(
    { iCan: link.iCan, theyCan: link.theyCan },
    { iCan: theirs, theyCan: mine },
  );
  const { action, submitLabel, mineChanged, theirsChanged, canApplyMineReduction, needsNegotiation } =
    classification;

  const nextMine = normaliseGrant(mine);
  const nextTheirs = normaliseGrant(theirs);
  const zeroWay = nextMine.calendar === 'none' && nextTheirs.calendar === 'none';
  const noChange = !mineChanged && !theirsChanged;
  const blockedByPending = needsNegotiation && !!link.pendingChange;
  // Below full access both ways, a link that holds a collective takes a venue out of it (CQ-01).
  const breaks = !noChange && !grantsHoldCollective(nextTheirs, nextMine);
  const info = serverBreak ?? (hold && breaks ? breakFromHold(hold, 'ifIChange') : null);
  const breakInfo = action === 'grant' ? null : info;
  // A proposal changes nothing until they accept, so only a reduction made now needs the name typed.
  const nameMissing =
    canApplyMineReduction && linkBreakNeedsName(breakInfo) && !typedNameMatches(typed, breakInfo?.collectiveName ?? '');
  const disabled = busy || noChange || zeroWay || blockedByPending || nameMissing;
  const confirmLabel =
    action === 'reduce' && breakInfo ? linkBreakConfirmLabel('reduce', breakInfo, myVenueId) : submitLabel;

  const description = needsNegotiation
    ? 'Changes that affect what you can do on their data, or both directions at once, are proposed to the other venue and take effect once they accept. Expanding or reducing only what you grant takes effect immediately.'
    : action === 'grant'
      ? 'You are expanding access your venue grants. This takes effect immediately.'
      : action === 'reduce'
        ? 'You are reducing access your venue grants. This takes effect immediately.'
        : 'Adjust what each venue can do, then save your changes.';

  const handleSubmit = () => {
    if (action === 'grant') {
      grantAccess.mutate(
        { linkId: link.id, grant: nextMine },
        {
          onSuccess: () => {
            toast.success(`Expanded ${name}’s access.`);
            onDone?.();
            onClose();
          },
          onError: (err) =>
            toast.error(err instanceof ApiError ? err.message : 'Failed to expand access.'),
        },
      );
    } else if (action === 'reduce') {
      setError(null);
      reduceAccess.mutate(
        {
          linkId: link.id,
          grant: nextMine,
          acknowledge: breakInfo ? acknowledgementFor(breakInfo.collectiveId, breakInfo.plan) : null,
        },
        {
          onSuccess: () => {
            toast.success(`Reduced ${name}’s access.`);
            onDone?.();
            onClose();
          },
          onError: (err) => {
            // The change takes a venue out of a collective: show who, and ask again (CQ-01).
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
    } else if (action === 'propose') {
      respond.mutate(
        { linkId: link.id, action: 'propose_change', grants: { mine, theirs } },
        {
          onSuccess: () => {
            toast.success(`Change proposed to ${name}.`);
            onDone?.();
            onClose();
          },
          onError: (err) =>
            toast.error(err instanceof ApiError ? err.message : 'Failed to propose change.'),
        },
      );
    }
  };

  if (view !== 'edit' && breakInfo) {
    return (
      <Sheet visible={visible} onClose={onClose} maxHeight="92%" fill>
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
    <Sheet visible={visible} onClose={onClose} maxHeight="92%" fill>
      <View style={styles.container}>
        <View>
          <Text variant="subheading">{`Edit permissions with ${name}`}</Text>
          <Text variant="bodySmall" tone="secondary">
            {description}
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollBody}
          keyboardShouldPersistTaps="handled">
          <GrantPairEditor
            otherVenueName={name}
            mine={mine}
            theirs={theirs}
            onChangeMine={setMine}
            onChangeTheirs={setTheirs}
            myCalendars={myCalendars}
            disabled={busy}
          />

          {blockedByPending ? (
            <View style={[styles.notice, { backgroundColor: colors.warningSurface }]}>
              <Text variant="caption" color={colors.warning}>
                {link.pendingChange?.proposedByMe
                  ? 'Withdraw your pending change first, or use the controls above to expand or reduce only what you grant.'
                  : 'Accept or decline the pending change above before proposing a new one.'}
              </Text>
            </View>
          ) : null}

          {breakInfo ? (
            <CollectiveBreakWarning
              info={breakInfo}
              myVenueId={myVenueId}
              otherVenueName={name}
              proposal={needsNegotiation}
              onRemoveInstead={() => setView('remove')}
              onLeaveInstead={() => setView('leave')}
              typed={typed}
              onTypedChange={canApplyMineReduction ? setTyped : undefined}
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
            label={confirmLabel}
            variant={canApplyMineReduction ? 'danger' : 'primary'}
            style={styles.flex1}
            disabled={disabled}
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
