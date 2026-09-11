import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GuestMessageChannelPicker } from '@/components/messaging/GuestMessageChannelPicker';
import { GuestMessageComposerHint } from '@/components/messaging/GuestMessageComposerHint';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import {
  DEFAULT_GUEST_MESSAGE_CHANNEL,
  type GuestMessageChannel,
} from '@/lib/communications/guest-message-channel';
import { messageSendErrorText } from '@/lib/communications/message-send-error';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

export type MessageChannel = GuestMessageChannel;

export type GuestMessageTarget = {
  /** Booking id or guest id — opaque to this sheet (used to reseed on change). */
  id: string;
  guestName: string;
  email?: string | null;
  phone?: string | null;
};

type GuestMessageSheetProps = {
  target: GuestMessageTarget | null;
  /** Caller wires its own mutation (booking message vs guest message). */
  onSend: (input: { message: string; channel: MessageChannel }) => Promise<{ errors?: string[] }>;
  sending?: boolean;
  onClose: () => void;
};

/** Send a custom email/SMS to a guest — shared by booking detail and contacts. */
export function GuestMessageSheet({ target, onSend, sending = false, onClose }: GuestMessageSheetProps) {
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState<MessageChannel>(DEFAULT_GUEST_MESSAGE_CHANNEL);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  // Reset form whenever the target changes (new guest or sheet closed).
  // useEffect avoids the setState-during-render anti-pattern that drops
  // TextInput focus on Android/Fabric.
  useEffect(() => {
    if (target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when target changes
      setMessage('');
      setError(null);
      // Web parity (`GuestMessageChannelSelect`): every composer opens on
      // "Email & SMS (if available)", whatever the contact has on file.
      setChannel(DEFAULT_GUEST_MESSAGE_CHANNEL);
    }
  }, [target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSend() {
    if (!message.trim()) return;
    setError(null);
    try {
      const result = await onSend({ message: message.trim(), channel });
      hapticSuccess();
      onClose();
      // Alert.alert is a no-op on web; surface partial failures via the toast host.
      if (result.errors?.length) {
        toast.info(`Message sent, with warnings: ${result.errors.join('; ')}`);
      } else {
        toast.success('Message sent.');
      }
    } catch (e) {
      hapticWarning();
      // A 502 says why in `errors[]` and carries no `error` key — read both.
      setError(messageSendErrorText(e));
    }
  }

  return (
    <Sheet visible={!!target} onClose={onClose}>
      {target ? (
        <View style={styles.body}>
          <View style={styles.headerBlock}>
            <Text variant="overline" tone="muted">
              Message guest
            </Text>
            <Text variant="title">{target.guestName}</Text>
          </View>

          <GuestMessageChannelPicker
            label="Send via"
            value={channel}
            onChange={setChannel}
            disabled={sending}
          />

          <Input
            label="Message"
            value={message}
            onChangeText={setMessage}
            placeholder="Write a short message to the guest…"
            multiline
            numberOfLines={5}
            maxLength={2000}
            style={styles.messageInput}
          />
          <GuestMessageComposerHint message={message} channel={channel} />

          {error ? (
            <Text variant="bodySmall" tone="danger">
              {error}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.actionButton} />
            <Button
              label="Send"
              onPress={() => void handleSend()}
              loading={sending}
              disabled={!message.trim()}
              style={styles.actionButton}
            />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
  },
  headerBlock: {
    gap: spacing.xs,
  },
  messageInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
});
