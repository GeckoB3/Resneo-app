import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { GrantBullets } from '@/components/linked/GrantBullets';
import { GrantPairEditor } from '@/components/linked/GrantPairEditor';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { normaliseGrant } from '@/lib/linked/grants';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AccountLinkView, LinkGrant } from '@/types/linked-venues';

/** Controller-to-controller data-sharing notice (verbatim from web). */
const DATA_SHARING_NOTICE =
  'Linking is a controller-to-controller data-sharing arrangement. Each venue stays the data controller for its own clients. You can reduce access or unlink at any time.';

/**
 * Review an incoming link request: shows what each venue would be able to do,
 * then Accept / Reject. "Accept with changes" swaps into an edit mode with the
 * permission editor (seeded from the request's grants) and, on save, accepts
 * the link with the adjusted grant pair.
 *
 * Grant framing (matches the web ReviewRequestModal):
 *  - `mine`   = what MY venue grants the other (= link.theyCan).
 *  - `theirs` = what I get from them            (= link.iCan).
 */
export function IncomingRequestSheet({
  link,
  visible,
  pending,
  myCalendars = [],
  onClose,
  onAccept,
  onAcceptWithChanges,
  onReject,
}: {
  link: AccountLinkView | null;
  visible: boolean;
  pending: 'accept' | 'reject' | null;
  /** §18 — your own calendars, for the scope picker in edit mode. */
  myCalendars?: { id: string; name: string }[];
  onClose: () => void;
  onAccept: () => void;
  /** When provided, enables the "Accept with changes" edit flow. */
  onAcceptWithChanges?: (grants: { mine: LinkGrant; theirs: LinkGrant }) => void;
  onReject: () => void;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [mine, setMine] = useState<LinkGrant>(link?.theyCan ?? { calendar: 'none', pii: false, act: 'none' });
  const [theirs, setTheirs] = useState<LinkGrant>(link?.iCan ?? { calendar: 'none', pii: false, act: 'none' });

  // Re-seed from the request and reset to the summary view each time it opens
  // (bounded key-based reset; cascading-render rule suppressed as in the app's
  // other editor sheets).
  useEffect(() => {
    if (visible && link) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(false);
      setMine(link.theyCan);
      setTheirs(link.iCan);
    }
  }, [visible, link]);

  if (!link) return null;
  const name = link.otherVenue.name;
  const busy = pending !== null;
  const zeroWay =
    normaliseGrant(mine).calendar === 'none' && normaliseGrant(theirs).calendar === 'none';

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight={editing ? '92%' : '85%'}>
      <View style={styles.container}>
        <View>
          <Text variant="subheading">{`${name} wants to link with you`}</Text>
          <Text variant="bodySmall" tone="secondary">
            Review what each venue would be able to do, then accept, adjust, or reject.
          </Text>
        </View>

        {link.requestMessage ? (
          <Text variant="bodySmall" tone="muted" style={styles.message}>
            {`“${link.requestMessage}”`}
          </Text>
        ) : null}

        {editing ? (
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
            <View style={[styles.notice, { backgroundColor: colors.surface }]}>
              <Text variant="caption" tone="muted">
                {DATA_SHARING_NOTICE}
              </Text>
            </View>
          </ScrollView>
        ) : (
          <>
            <GrantBullets heading={`${name} will be able to:`} grant={link.theyCan} />
            <GrantBullets heading="You will be able to:" grant={link.iCan} />
            <View style={[styles.notice, { backgroundColor: colors.surface }]}>
              <Text variant="caption" tone="muted">
                {DATA_SHARING_NOTICE}
              </Text>
            </View>
          </>
        )}

        {editing ? (
          <View style={styles.actions}>
            <Button
              label="Back"
              variant="ghost"
              disabled={busy}
              onPress={() => setEditing(false)}
            />
            <Button
              label="Reject"
              variant="secondary"
              style={styles.flex1}
              disabled={busy}
              loading={pending === 'reject'}
              onPress={onReject}
            />
            <Button
              label="Save & accept"
              variant="primary"
              style={styles.flex1}
              disabled={busy || zeroWay}
              loading={pending === 'accept'}
              onPress={() => onAcceptWithChanges?.({ mine, theirs })}
            />
          </View>
        ) : (
          <>
            <View style={styles.actions}>
              <Button
                label="Reject"
                variant="secondary"
                style={styles.flex1}
                disabled={busy}
                loading={pending === 'reject'}
                onPress={onReject}
              />
              <Button
                label="Accept"
                variant="primary"
                style={styles.flex1}
                disabled={busy}
                loading={pending === 'accept'}
                onPress={onAccept}
              />
            </View>
            {onAcceptWithChanges ? (
              <Button
                label="Accept with changes"
                variant="ghost"
                disabled={busy}
                onPress={() => setEditing(true)}
              />
            ) : null}
          </>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  message: {
    fontStyle: 'italic',
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
