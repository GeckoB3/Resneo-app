import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GuestMessageChannelPicker } from '@/components/messaging/GuestMessageChannelPicker';
import { GuestMessageComposerHint } from '@/components/messaging/GuestMessageComposerHint';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { formatTimelineEventTime } from '@/lib/booking/booking-timeline';
import { formatCommunicationLogLabel } from '@/lib/communications/display-labels';
import { DEFAULT_GUEST_MESSAGE_CHANNEL } from '@/lib/communications/guest-message-channel';
import { messageSendErrorText } from '@/lib/communications/message-send-error';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useSendBookingMessage,
  type GuestMessageChannel,
} from '@/lib/queries/useBookingMutations';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingDetail } from '@/types/booking-detail';

/** Web parity: green when delivered, red on failures, amber while pending. */
function commStatusTone(status: string): BadgeTone {
  const s = status.toLowerCase();
  if (s === 'sent' || s === 'delivered') return 'success';
  if (s === 'failed' || s === 'bounced' || s === 'error') return 'danger';
  return 'warning';
}

/** Web parity: email pills read blue/brand, SMS pills read emerald/success. */
function commChannelTone(channel: string): BadgeTone {
  const c = channel.toLowerCase();
  if (c === 'email') return 'brand';
  if (c === 'sms') return 'success';
  return 'neutral';
}

function successCaption(channel: GuestMessageChannel): string {
  switch (channel) {
    case 'email':
      return 'Email sent to the guest.';
    case 'sms':
      return 'SMS sent to the guest.';
    case 'both':
      return 'Message sent by email and/or SMS (where contact details exist).';
    default:
      return 'Message sent.';
  }
}

/**
 * Inline SMS/email composer — mirrors the web's guest-communications composer:
 * the channel select (all three options, "Email & SMS (if available)" first), a
 * message box, and Send with inline feedback that auto-dismisses after 8s.
 */
function MessageGuestCompose({ bookingId }: { bookingId: string }) {
  const sendMessage = useSendBookingMessage(bookingId);
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState<GuestMessageChannel>(DEFAULT_GUEST_MESSAGE_CHANNEL);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null,
  );
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = (tone: 'success' | 'danger', text: string) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback({ tone, text });
    // Web parity: success/error notices auto-dismiss after 8s.
    feedbackTimer.current = setTimeout(() => setFeedback(null), 8000);
  };

  // Clear the auto-dismiss timer on unmount so it can't fire after teardown.
  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
  }, []);

  const handleSend = () => {
    const text = message.trim();
    if (!text) return;
    sendMessage.mutate(
      { message: text, channel },
      {
        onSuccess: (data) => {
          setMessage('');
          // The server returns 200 with a populated `errors` array when SOME but
          // not all requested channels went out — surface that as a partial send.
          if (data?.errors && data.errors.length > 0) {
            hapticWarning();
            showFeedback('danger', `Partially sent — ${data.errors.join('; ')}`);
          } else {
            hapticSuccess();
            showFeedback('success', successCaption(channel));
          }
        },
        onError: (error) => {
          hapticWarning();
          showFeedback('danger', messageSendErrorText(error));
        },
      },
    );
  };

  return (
    <View style={styles.composeBlock}>
      <GuestMessageChannelPicker
        label="Send message via"
        value={channel}
        onChange={setChannel}
        disabled={sendMessage.isPending}
      />
      <Input
        placeholder="Write a message to the guest…"
        value={message}
        onChangeText={setMessage}
        multiline
        numberOfLines={4}
        maxLength={2000}
        textAlignVertical="top"
      />
      <GuestMessageComposerHint message={message} channel={channel} />
      {feedback ? (
        <Text variant="bodySmall" tone={feedback.tone}>
          {feedback.text}
        </Text>
      ) : null}
      <Button
        label={sendMessage.isPending ? 'Sending…' : 'Send message'}
        variant="secondary"
        size="sm"
        fullWidth
        loading={sendMessage.isPending}
        disabled={!message.trim() || sendMessage.isPending}
        onPress={handleSend}
      />
    </View>
  );
}

/**
 * "SMS / Email guest" section of the booking detail — web parity. Composer (when
 * the guest has any contact detail) plus the per-booking communications log.
 *
 * Unlike the previous version this stays VISIBLE even when the guest has no email
 * or phone (matching the web drawer, which always shows the section) — it just
 * swaps the composer for a "no contact on file" note. It only hides entirely when
 * there is no guest and nothing has ever been sent.
 */
export function MessageGuestSection({
  booking,
  readOnly = false,
}: {
  booking: BookingDetail;
  /**
   * Show the sent log without the composer: a linked venue's booking seen
   * through a view-only link (web: the composer is disabled for `linkedAct
   * === 'none'`, the log stays).
   */
  readOnly?: boolean;
}) {
  const { colors } = useTheme();
  const communications = booking.communications ?? [];
  // A booking taken without a guest profile still has the address it was made
  // with, and the web sends to it (`send-custom-booking-message.ts` ~159-162),
  // so it counts as reachable here too.
  const guestEmail = booking.guest?.email?.trim() || booking.guest_email?.trim() || null;
  const guestPhone = booking.guest?.phone?.trim() || null;
  const guestId = booking.guest?.id ?? booking.guest_id ?? null;
  const canMessage = (!!guestEmail || !!guestPhone) && !readOnly;

  if (!guestId && !guestEmail && communications.length === 0) return null;

  // Closed-accordion summary mirrors the web: sent count once anything's gone
  // out, otherwise which channels are reachable.
  const summary =
    communications.length > 0
      ? `${communications.length} sent`
      : guestEmail && guestPhone
        ? 'SMS + email'
        : guestEmail
          ? 'Email'
          : guestPhone
            ? 'SMS'
            : 'No contact';

  return (
    <CollapsibleCard title="SMS / Email guest" summary={summary}>
      {canMessage ? (
        <MessageGuestCompose bookingId={booking.id} />
      ) : readOnly ? (
        <Text variant="bodySmall" tone="muted" style={styles.noContact}>
          This link is view only, so the guest cannot be messaged from here.
        </Text>
      ) : (
        <Text variant="bodySmall" tone="muted" style={styles.noContact}>
          No email or phone on file — add contact details to message this guest.
        </Text>
      )}

      <View style={styles.log}>
        {communications.length === 0 ? (
          <Text variant="bodySmall" tone="muted">
            No emails or SMS have been sent to the guest for this booking yet.
          </Text>
        ) : null}
        {communications.map((row) => {
          // Coerce to strings — these are merged from `communication_logs` + a
          // legacy table and arrive via an unvalidated `as T` cast, so a stray
          // non-string would otherwise crash the whole map (and the detail).
          const channel = String(row.channel ?? '');
          const status = String(row.status ?? '');
          const messageType = String(row.message_type ?? '');
          return (
            <View key={row.id} style={[styles.row, { borderBottomColor: colors.border }]}>
              <View style={styles.rowHeader}>
                <Badge label={channel.toUpperCase()} tone={commChannelTone(channel)} />
                <Badge label={status} tone={commStatusTone(status)} />
              </View>
              <Text variant="bodySmall">{formatCommunicationLogLabel(messageType)}</Text>
              {row.recipient ? (
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  To {row.recipient}
                </Text>
              ) : null}
              <Text variant="caption" tone="muted">
                {formatTimelineEventTime(row.created_at)}
              </Text>
              {row.error_message && status.toLowerCase() === 'failed' ? (
                <Text variant="caption" tone="danger">
                  {row.error_message}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </CollapsibleCard>
  );
}

const styles = StyleSheet.create({
  composeBlock: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  composeChannels: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  noContact: {
    marginBottom: spacing.sm,
  },
  log: {
    marginTop: spacing.sm,
  },
  row: {
    gap: 2,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: 2,
  },
});
