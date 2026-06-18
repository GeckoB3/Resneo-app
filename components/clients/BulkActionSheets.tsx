import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

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
} from '@/lib/queries/useContactsBulk';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

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

/**
 * Send a marketing email/SMS to all selected contacts (consent respected server-side).
 *
 * INTENTIONAL DIVERGENCE FROM WEB (Domain 05, R7 audit — confirmed, documented):
 * the web directory's bulk "Message" fans out a per-guest transactional message
 * (`POST /api/venue/guests/[id]/message`) over `Promise.all`, reaching anyone with
 * an email/phone on file regardless of marketing consent. The app instead sends a
 * single consent-gated marketing broadcast (`POST /api/venue/contacts/bulk`
 * {action:'marketing_message'}). We keep the broadcast semantics on mobile because:
 *   1. it is consent-safe by construction (only subscribed contacts on a matching
 *      channel receive it) — a per-guest fan-out would silently message
 *      non-consented contacts, a marketing-compliance regression;
 *   2. it is one request, not N (no partial-failure fan-out to reconcile on a
 *      flaky mobile connection); and
 *   3. per-contact transactional messaging already lives on the contact detail
 *      screen via `GuestMessageSheet` for staff who need to reach one person.
 * The consent semantics are surfaced to the user via the in-sheet note below.
 */
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
  const toast = useToast();
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
      const sent = result.sent ?? guestIds.length;
      const skipped = result.skipped ?? 0;
      // Result toast fires directly off the resolved mutation, then we close the
      // selection — Alert.alert is a no-op on web so it gave zero feedback there.
      toast.success(
        `${sent} contact${sent === 1 ? '' : 's'} messaged${skipped ? ` · ${skipped} skipped (no consent/contact info)` : ''}.`,
      );
      onDone();
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
        <Input
          testID="bulk-msg-subject"
          label="Subject"
          value={subject}
          onChangeText={setSubject}
          maxLength={200}
        />
        <Input
          testID="bulk-msg-body"
          label="Message"
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={4000}
          style={styles.multiline}
        />
        <Text variant="caption" tone="muted">
          This sends a marketing broadcast: only contacts who have given marketing
          consent and have a matching {channel === 'both' ? 'email or phone' : channel}{' '}
          on file will receive it. To message one person directly, open their profile.
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
});
