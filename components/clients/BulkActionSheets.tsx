import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GuestMessageChannelPicker } from '@/components/messaging/GuestMessageChannelPicker';
import { GuestMessageComposerHint } from '@/components/messaging/GuestMessageComposerHint';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { summariseBulkGuestMessage } from '@/lib/communications/bulk-guest-message';
import {
  DEFAULT_GUEST_MESSAGE_CHANNEL,
  type GuestMessageChannel,
} from '@/lib/communications/guest-message-channel';
import { messageSendErrorText } from '@/lib/communications/message-send-error';
import { formatGuestDisplayName } from '@/lib/guests/name';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useBulkAddTag,
  useBulkGuestMessage,
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

/** Enough of a directory row to name a contact in the result summary. */
export type BulkMessageContact = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  identifiability_tier?: string;
};

/**
 * Message every selected contact — the web's bulk "Message"
 * (`ContactsDashboard.tsx` `runBulkContactMessage` + `BulkGuestMessageModal`,
 * mounted at ~1980-1992).
 *
 * One message of up to 2,000 characters (no subject: the email arrives on the
 * venue's branded custom-message template, and the SMS carries the venue name),
 * fanned out as one `POST /api/venue/guests/{id}/message` per contact with
 * `respect_marketing_permission: true` — so the server sends only to contacts
 * with a recorded consent and no opt-out, and says per contact when it did not.
 * The reply is counted the way the web counts it: sent, deliberately skipped,
 * or a problem worth naming.
 */
export function BulkMessageSheet({
  guestIds,
  open,
  onClose,
  onDone,
  clientWord = 'Client',
  contacts = [],
}: {
  guestIds: string[];
  open: boolean;
  onClose: () => void;
  onDone: DoneHandler;
  /** The venue's word for a client ("Client", "Guest", "Member"…). */
  clientWord?: string;
  /** The rows on screen, so a failure can name the contact it belongs to. */
  contacts?: BulkMessageContact[];
}) {
  const mutation = useBulkGuestMessage();
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState<GuestMessageChannel>(DEFAULT_GUEST_MESSAGE_CHANNEL);
  const [summary, setSummary] = useState<string | null>(null);
  const sending = mutation.isPending;
  const clientLower = clientWord.toLowerCase();

  // The web mounts its modal only while open, so its form is always fresh. This
  // sheet stays mounted, so clear the last send as it opens.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the form when the sheet opens
      setMessage('');
      setChannel(DEFAULT_GUEST_MESSAGE_CHANNEL);
      setSummary(null);
    }
  }, [open]);

  const nameForGuest = (guestId: string): string => {
    const row = contacts.find((contact) => contact.id === guestId);
    if (!row) return '';
    if (row.identifiability_tier === 'anonymous') return 'Anonymous';
    return formatGuestDisplayName(row.first_name, row.last_name);
  };

  async function handleSend() {
    const text = message.trim();
    if (!text || sending || guestIds.length === 0) return;
    setSummary(null);
    try {
      const outcomes = await mutation.mutateAsync({
        guest_ids: guestIds,
        message: text,
        channel,
      });
      const result = summariseBulkGuestMessage({
        outcomes,
        total: guestIds.length,
        clientWord,
        nameForGuest,
      });
      if (result.ok) {
        hapticSuccess();
        toast.success(result.toast);
        onDone();
        return;
      }
      hapticWarning();
      toast.error(result.toast);
      // The selection is spent either way — sending again would message the
      // contacts that already received it — so the sheet reports what happened
      // (the web's error banner) and Done clears the selection.
      setSummary(result.error);
    } catch (e) {
      hapticWarning();
      setSummary(messageSendErrorText(e));
    }
  }

  return (
    <Sheet
      visible={open}
      onClose={() => {
        if (!sending) onClose();
      }}
      maxHeight="88%">
      <View style={styles.body}>
        <Text variant="subheading">
          {`Message ${guestIds.length} ${clientWord}${guestIds.length !== 1 ? 's' : ''}`}
        </Text>
        {summary ? (
          <>
            <Text variant="bodySmall" tone="danger">
              {summary}
            </Text>
            <Button label="Done" fullWidth onPress={onDone} />
          </>
        ) : (
          <>
            <Text variant="bodySmall" tone="secondary">
              {`The same message goes to each selected ${clientLower} who has given marketing permission. Anyone opted out, or without a recorded consent, is skipped, as are contacts without email or SMS on file for the chosen channel.`}
            </Text>
            <GuestMessageChannelPicker
              label="Channel"
              value={channel}
              onChange={setChannel}
              disabled={sending}
            />
            <Input
              testID="bulk-msg-body"
              label="Message"
              value={message}
              onChangeText={setMessage}
              placeholder="Type your message…"
              multiline
              numberOfLines={7}
              maxLength={2000}
              editable={!sending}
              style={styles.multiline}
            />
            <GuestMessageComposerHint message={message} channel={channel} />
            <View style={styles.actions}>
              <Button
                label="Cancel"
                variant="secondary"
                style={styles.flex1}
                disabled={sending}
                onPress={onClose}
              />
              <Button
                label={sending ? 'Sending…' : 'Send'}
                style={styles.flex1}
                loading={sending}
                disabled={sending || !message.trim()}
                onPress={() => void handleSend()}
              />
            </View>
          </>
        )}
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
