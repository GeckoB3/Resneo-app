import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { GrantPairEditor } from '@/components/linked/GrantPairEditor';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { classifyGrantChange, normaliseGrant } from '@/lib/linked/grants';
import { useGrantAccess, useReduceAccess, useRespondLink } from '@/lib/queries/useLinkedVenues';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AccountLinkView, LinkGrant } from '@/types/linked-venues';

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
 */
export function EditPermissionsSheet({
  link,
  visible,
  myCalendars = [],
  onClose,
  onDone,
}: {
  link: AccountLinkView | null;
  visible: boolean;
  /** §18 — your own calendars, for the scope picker. */
  myCalendars?: { id: string; name: string }[];
  onClose: () => void;
  /** Called after a successful grant/reduce/propose. */
  onDone?: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();

  const grantAccess = useGrantAccess();
  const reduceAccess = useReduceAccess();
  const respond = useRespondLink();

  const [mine, setMine] = useState<LinkGrant>(
    link?.theyCan ?? { calendar: 'none', pii: false, act: 'none' },
  );
  const [theirs, setTheirs] = useState<LinkGrant>(
    link?.iCan ?? { calendar: 'none', pii: false, act: 'none' },
  );

  // Re-seed from the link each time the sheet opens (bounded key-based reset).
  useEffect(() => {
    if (visible && link) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMine(link.theyCan);
      setTheirs(link.iCan);
    }
  }, [visible, link]);

  if (!link) return null;

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
  const disabled = busy || noChange || zeroWay || blockedByPending;

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
      reduceAccess.mutate(
        { linkId: link.id, grant: nextMine },
        {
          onSuccess: () => {
            toast.success(`Reduced ${name}’s access.`);
            onDone?.();
            onClose();
          },
          onError: (err) =>
            toast.error(err instanceof ApiError ? err.message : 'Failed to reduce access.'),
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

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="92%">
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
        </ScrollView>

        <View style={styles.actions}>
          <Button label="Cancel" variant="ghost" disabled={busy} onPress={onClose} />
          <Button
            label={submitLabel}
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
  container: {
    gap: spacing.md,
  },
  scroll: {
    flexGrow: 0,
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
