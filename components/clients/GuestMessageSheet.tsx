import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useSendGuestMessage } from '@/lib/queries/useGuestMutations';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type Channel = 'email' | 'sms' | 'both';

export type GuestMessageTarget = {
  id: string;
  guestName: string;
  email?: string | null;
  phone?: string | null;
};

type GuestMessageSheetProps = {
  target: GuestMessageTarget | null;
  onClose: () => void;
};

function channelOptions(email?: string | null, phone?: string | null): { value: Channel; label: string }[] {
  const options: { value: Channel; label: string }[] = [];
  if (email?.trim()) options.push({ value: 'email', label: 'Email' });
  if (phone?.trim()) options.push({ value: 'sms', label: 'SMS' });
  if (email?.trim() && phone?.trim()) options.push({ value: 'both', label: 'Both' });
  return options;
}

/** Bottom-sheet to send a custom email/SMS to a guest from their profile. */
export function GuestMessageSheet({ target, onClose }: GuestMessageSheetProps) {
  const { colors } = useTheme();
  const mutation = useSendGuestMessage(target?.id ?? '');

  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState<Channel>('both');
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
      const result = await mutation.mutateAsync({ message: message.trim(), channel });
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
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.surfaceRaised }]}>
          {target && seededId === target.id ? (
            <View style={styles.content}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
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
                  loading={mutation.isPending}
                  disabled={!message.trim()}
                  style={styles.actionButton}
                />
              </View>
            </View>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  sheet: { borderTopLeftRadius: radius.surface, borderTopRightRadius: radius.surface },
  content: { padding: spacing.lg, gap: spacing.lg },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.full },
  headerBlock: { gap: spacing.xs },
  messageInput: { minHeight: 96, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: spacing.md },
  actionButton: { flex: 1 },
});
