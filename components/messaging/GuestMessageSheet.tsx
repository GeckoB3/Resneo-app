import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { spacing } from '@/theme/index';

export type MessageChannel = 'email' | 'sms' | 'both';

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

function channelOptions(
  email?: string | null,
  phone?: string | null,
): { value: MessageChannel; label: string }[] {
  const options: { value: MessageChannel; label: string }[] = [];
  if (email?.trim()) options.push({ value: 'email', label: 'Email' });
  if (phone?.trim()) options.push({ value: 'sms', label: 'SMS' });
  if (email?.trim() && phone?.trim()) options.push({ value: 'both', label: 'Both' });
  return options;
}

/** Send a custom email/SMS to a guest — shared by booking detail and contacts. */
export function GuestMessageSheet({ target, onSend, sending = false, onClose }: GuestMessageSheetProps) {
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState<MessageChannel>('both');
  const [error, setError] = useState<string | null>(null);
  const [seededId, setSeededId] = useState<string | null>(null);

  const options = channelOptions(target?.email, target?.phone);

  if (target && target.id !== seededId) {
    setSeededId(target.id);
    setMessage('');
    setError(null);
    setChannel(options.some((o) => o.value === 'both') ? 'both' : options[0]?.value ?? 'email');
  } else if (!target && seededId !== null) {
    setSeededId(null);
  }

  async function handleSend() {
    if (!message.trim()) return;
    setError(null);
    try {
      const result = await onSend({ message: message.trim(), channel });
      hapticSuccess();
      onClose();
      if (result.errors?.length) {
        Alert.alert('Message sent (with warnings)', result.errors.join('\n'));
      }
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not send the message.');
    }
  }

  return (
    <Sheet visible={!!target} onClose={onClose}>
      {target && seededId === target.id ? (
        <View style={styles.body}>
          <View style={styles.headerBlock}>
            <Text variant="overline" tone="muted">
              Message guest
            </Text>
            <Text variant="title">{target.guestName}</Text>
          </View>

          {options.length > 1 ? (
            <Segmented options={options} value={channel} onChange={setChannel} />
          ) : null}

          <Input
            label="Message"
            value={message}
            onChangeText={setMessage}
            placeholder="Write a short message to the guest…"
            multiline
            numberOfLines={4}
            maxLength={2000}
            style={styles.messageInput}
          />

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
