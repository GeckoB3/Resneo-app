import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { GrantPairEditor } from '@/components/linked/GrantPairEditor';
import { VenuePicker, type PickedVenue } from '@/components/linked/VenuePicker';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { normaliseGrant } from '@/lib/linked/grants';
import { useMyCalendars, useSendLink } from '@/lib/queries/useLinkedVenues';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import { DEFAULT_LINK_GRANT, type LinkGrant } from '@/types/linked-venues';

const NOTE_MAX = 1000;

/**
 * Full send-link-request flow (Phase 2 Flow 1): pick a venue → optional note →
 * author both grant directions → Send. `mine` = what the chosen venue can do
 * with your data; `theirs` = what you can do with theirs. Defaults to
 * `DEFAULT_LINK_GRANT` both ways, matching the web.
 *
 * The venue search runs as an in-sheet STEP (`mode === 'picker'`) inside this
 * one Sheet — NOT a second Modal. Stacking a Modal over this sheet failed to
 * present on iOS for some users, so "Choose a venue" appeared to do nothing.
 * Switching between the form and the picker keeps everything in a single Modal.
 *
 * The Sheet is `fill` so its body height is bounded and the ScrollView scrolls
 * (a non-`fill` sheet hugs its content, leaving the ScrollView unbounded — it
 * then overflows and the pinned Send/Cancel bar is pushed off-screen).
 *
 * Accepts an optional `prefill` (from an invite deep-link) so the venue step is
 * skipped and the editor opens straight away.
 */
export function LinkRequestSheet({
  visible,
  onClose,
  prefill,
}: {
  visible: boolean;
  onClose: () => void;
  /** Pre-select this venue (from a shareable invite link). */
  prefill?: { slug: string; name: string } | null;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const calendarsQuery = useMyCalendars();
  const myCalendars = calendarsQuery.data?.calendars ?? [];
  const send = useSendLink();

  const [selected, setSelected] = useState<PickedVenue | null>(null);
  const [mode, setMode] = useState<'form' | 'picker'>('form');
  const [note, setNote] = useState('');
  const [mine, setMine] = useState<LinkGrant>(DEFAULT_LINK_GRANT);
  const [theirs, setTheirs] = useState<LinkGrant>(DEFAULT_LINK_GRANT);
  const [error, setError] = useState<string | null>(null);

  // Reset / seed from prefill on each open (bounded key-based reset on the
  // visible→true transition; cascading-render rule suppressed as in the app's
  // other editor sheets).
  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNote('');
    setMine(DEFAULT_LINK_GRANT);
    setTheirs(DEFAULT_LINK_GRANT);
    setError(null);
    setMode('form');
    if (prefill) {
      setSelected({ name: prefill.name, slug: prefill.slug, eligible: true, reason: null });
    } else {
      setSelected(null);
    }
  }, [visible, prefill]);

  const zeroWay =
    normaliseGrant(mine).calendar === 'none' && normaliseGrant(theirs).calendar === 'none';
  const canSubmit = !send.isPending && selected?.eligible === true && !zeroWay;

  const handleSend = () => {
    if (!selected) return;
    setError(null);
    send.mutate(
      {
        targetSlug: selected.slug,
        requestMessage: note.trim() || undefined,
        grants: { mine, theirs },
      },
      {
        onSuccess: () => {
          toast.success(`Link request sent to ${selected.name}.`);
          onClose();
        },
        onError: (err) => {
          const msg = err instanceof ApiError ? err.message : 'Failed to send request.';
          setError(msg);
          toast.error(msg);
        },
      },
    );
  };

  // In the picker step, a drag-down / scrim tap returns to the form rather than
  // abandoning the whole request — mirroring how the old separate picker Modal
  // dismissed back to the form.
  const handleSheetClose = () => {
    if (mode === 'picker') {
      setMode('form');
      return;
    }
    onClose();
  };

  const otherName = selected?.name ?? 'the other venue';

  return (
    <Sheet visible={visible} onClose={handleSheetClose} maxHeight="92%" fill>
      {mode === 'picker' ? (
        <VenuePicker
          onBack={() => setMode('form')}
          onPick={(venue) => {
            setSelected(venue);
            setError(null);
            setMode('form');
          }}
        />
      ) : (
        <View style={styles.body}>
          <View>
            <Text variant="subheading">Send a link request</Text>
            <Text variant="bodySmall" tone="secondary">
              Search for the venue by name, or paste its booking-page address.
            </Text>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollBody}
            keyboardShouldPersistTaps="handled">
            {selected ? (
              <View
                style={[
                  styles.selected,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}>
                <View style={styles.flex1}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {selected.name}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {`/${selected.slug}`}
                  </Text>
                  {!selected.eligible ? (
                    <Text variant="caption" tone="danger" style={styles.eligNote}>
                      {selected.reason ?? 'This venue isn’t available to link right now.'}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change venue"
                  disabled={send.isPending}
                  onPress={() => setMode('picker')}
                  hitSlop={8}>
                  <Text variant="label" tone="brand">
                    Change
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Button label="Choose a venue" variant="secondary" onPress={() => setMode('picker')} />
            )}

            <Input
              label="Personal note"
              optional
              value={note}
              onChangeText={setNote}
              maxLength={NOTE_MAX}
              multiline
              numberOfLines={2}
              placeholder="Add a short message for the other venue"
              helper={`${note.length}/${NOTE_MAX}`}
            />

            <GrantPairEditor
              otherVenueName={otherName}
              mine={mine}
              theirs={theirs}
              onChangeMine={setMine}
              onChangeTheirs={setTheirs}
              myCalendars={myCalendars}
              disabled={send.isPending}
            />

            {error ? (
              <View style={[styles.error, { backgroundColor: colors.dangerSurface }]}>
                <Text variant="caption" tone="danger">
                  {error}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="secondary"
              style={styles.flex1}
              disabled={send.isPending}
              onPress={onClose}
            />
            <Button
              label="Send request"
              style={styles.flex1}
              disabled={!canSubmit}
              loading={send.isPending}
              onPress={handleSend}
            />
          </View>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  scroll: {
    flex: 1,
  },
  scrollBody: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  selected: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.base,
  },
  eligNote: {
    marginTop: spacing.xs,
  },
  error: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
