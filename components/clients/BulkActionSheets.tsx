import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useBulkAddTag,
  useBulkMarketingMessage,
  useBulkRemoveTag,
  useMergeGuests,
} from '@/lib/queries/useContactsBulk';
import { spacing, radius } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { GuestListItem } from '@/types/guest-list';
import type { MergeGuestsInput } from '@/types/guest-merge';

type DoneHandler = () => void;

/** Apply a tag to all selected contacts. */
export function BulkTagSheet({
  guestIds,
  open,
  onClose,
  onDone,
}: {
  guestIds: string[];
  open: boolean;
  onClose: () => void;
  onDone: DoneHandler;
}) {
  const mutation = useBulkAddTag();
  const [tag, setTag] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    if (!tag.trim()) return;
    setError(null);
    try {
      await mutation.mutateAsync({ guest_ids: guestIds, tag: tag.trim() });
      hapticSuccess();
      setTag('');
      onDone();
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not tag the contacts.');
    }
  }

  return (
    <Sheet visible={open} onClose={onClose}>
      <View style={styles.body}>
        <Text variant="overline" tone="muted">
          Tag {guestIds.length} contact{guestIds.length === 1 ? '' : 's'}
        </Text>
        <Input label="Tag" value={tag} onChangeText={setTag} maxLength={60} autoCapitalize="none" />
        {error ? (
          <Text variant="bodySmall" tone="danger">
            {error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} />
          <Button
            label="Add tag"
            style={styles.flex1}
            loading={mutation.isPending}
            disabled={!tag.trim()}
            onPress={() => void handleApply()}
          />
        </View>
      </View>
    </Sheet>
  );
}

/** Remove a tag from all selected contacts. */
export function BulkRemoveTagSheet({
  guestIds,
  open,
  onClose,
  onDone,
}: {
  guestIds: string[];
  open: boolean;
  onClose: () => void;
  onDone: DoneHandler;
}) {
  const mutation = useBulkRemoveTag();
  const [tag, setTag] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleRemove() {
    if (!tag.trim()) return;
    setError(null);
    try {
      await mutation.mutateAsync({ guest_ids: guestIds, tag: tag.trim() });
      hapticSuccess();
      setTag('');
      onDone();
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not remove the tag.');
    }
  }

  return (
    <Sheet visible={open} onClose={onClose}>
      <View style={styles.body}>
        <Text variant="overline" tone="muted">
          Remove tag from {guestIds.length} contact{guestIds.length === 1 ? '' : 's'}
        </Text>
        <Input label="Tag to remove" value={tag} onChangeText={setTag} maxLength={60} autoCapitalize="none" />
        {error ? (
          <Text variant="bodySmall" tone="danger">
            {error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} />
          <Button
            label="Remove tag"
            variant="danger"
            style={styles.flex1}
            loading={mutation.isPending}
            disabled={!tag.trim()}
            onPress={() => void handleRemove()}
          />
        </View>
      </View>
    </Sheet>
  );
}

/** Send a marketing email/SMS to all selected contacts (consent respected server-side). */
export function BulkMessageSheet({
  guestIds,
  open,
  onClose,
  onDone,
}: {
  guestIds: string[];
  open: boolean;
  onClose: () => void;
  onDone: DoneHandler;
}) {
  const mutation = useBulkMarketingMessage();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState<'email' | 'sms' | 'both'>('email');
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and message are both required.');
      return;
    }
    setError(null);
    try {
      const result = await mutation.mutateAsync({
        guest_ids: guestIds,
        subject: subject.trim(),
        body: body.trim(),
        channel,
      });
      hapticSuccess();
      onDone();
      const sent = result.sent ?? guestIds.length;
      const skipped = result.skipped ?? 0;
      Alert.alert(
        'Message queued',
        `${sent} contact${sent === 1 ? '' : 's'} messaged${skipped ? ` · ${skipped} skipped (no consent/contact info)` : ''}.`,
      );
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not send the message.');
    }
  }

  return (
    <Sheet visible={open} onClose={onClose} maxHeight="88%">
      <View style={styles.body}>
        <Text variant="overline" tone="muted">
          Message {guestIds.length} contact{guestIds.length === 1 ? '' : 's'}
        </Text>
        <Segmented
          options={[
            { value: 'email', label: 'Email' },
            { value: 'sms', label: 'SMS' },
            { value: 'both', label: 'Both' },
          ]}
          value={channel}
          onChange={setChannel}
        />
        <Input label="Subject" value={subject} onChangeText={setSubject} maxLength={200} />
        <Input
          label="Message"
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={4000}
          style={styles.multiline}
        />
        <Text variant="caption" tone="muted">
          Only contacts with marketing consent and a matching channel receive it.
        </Text>
        {error ? (
          <Text variant="bodySmall" tone="danger">
            {error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} />
          <Button
            label="Send"
            style={styles.flex1}
            loading={mutation.isPending}
            onPress={() => void handleSend()}
          />
        </View>
      </View>
    </Sheet>
  );
}

/** Merge selected contacts — pick which one survives. */
export function MergeContactsSheet({
  guests,
  open,
  onClose,
  onDone,
}: {
  guests: GuestListItem[];
  open: boolean;
  onClose: () => void;
  onDone: DoneHandler;
}) {
  const { colors } = useTheme();
  const mutation = useMergeGuests();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveTarget = targetId ?? guests[0]?.id ?? null;

  async function handleMerge() {
    if (!effectiveTarget) return;
    const sources = guests.map((g) => g.id).filter((id) => id !== effectiveTarget);
    if (sources.length === 0) return;
    setError(null);
    try {
      const targetGuest = guests.find((g) => g.id === effectiveTarget);
      // Build a basic merged_profile from the target (field-level resolution
      // for a full wizard is in MergeContactDetailSheet on the detail screen).
      const mergeInput: MergeGuestsInput = {
        target_guest_id: effectiveTarget,
        source_guest_ids: sources,
        merged_profile: {
          first_name: targetGuest?.first_name,
          last_name: targetGuest?.last_name,
          email: targetGuest?.email,
          phone: targetGuest?.phone,
          tags: targetGuest?.tags,
        },
      };
      await mutation.mutateAsync(mergeInput);
      hapticSuccess();
      onDone();
      Alert.alert('Contacts merged', 'Booking history now lives on the kept contact.');
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not merge the contacts.');
    }
  }

  return (
    <Sheet visible={open} onClose={onClose}>
      <View style={styles.body}>
        <Text variant="overline" tone="muted">
          Merge {guests.length} contacts
        </Text>
        <Text variant="bodySmall" tone="secondary">
          Choose which contact to keep — the others’ bookings and history move onto it.
        </Text>
        {guests.map((guest) => {
          const name =
            [guest.first_name, guest.last_name].filter(Boolean).join(' ') || 'Unnamed guest';
          const isTarget = guest.id === effectiveTarget;
          return (
            <Pressable
              key={guest.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: isTarget }}
              onPress={() => setTargetId(guest.id)}
              style={[
                styles.mergeRow,
                {
                  borderColor: isTarget ? colors.brand : colors.border,
                  backgroundColor: isTarget ? colors.surfaceRaised : colors.surface,
                },
              ]}>
              <Avatar name={name} size={36} />
              <View style={styles.mergeText}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {name}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {guest.visit_count} visit{guest.visit_count === 1 ? '' : 's'}
                  {guest.email ? ` · ${guest.email}` : ''}
                </Text>
              </View>
              {isTarget ? (
                <Text variant="caption" tone="brand">
                  Keep
                </Text>
              ) : null}
            </Pressable>
          );
        })}
        {error ? (
          <Text variant="bodySmall" tone="danger">
            {error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} />
          <Button
            label="Merge"
            variant="danger"
            style={styles.flex1}
            loading={mutation.isPending}
            onPress={() => void handleMerge()}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
  mergeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  mergeText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
});
