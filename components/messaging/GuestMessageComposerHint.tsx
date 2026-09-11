/**
 * Small footer under a custom-message box (web `GuestMessageComposerHint`,
 * 2026-09-10): how to make paragraphs, the character count, and (when SMS is
 * a chosen channel) how many texts it will take and whether it will be cut
 * short. Mirrors the web renderer: a custom SMS may run to three concatenated
 * GSM segments, the venue name prefix included.
 */
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export type ComposerChannel = 'email' | 'sms' | 'both';

/** Mirrors web `renderer.ts`: three concatenated GSM segments, venue name prefix included. */
export const CUSTOM_SMS_CHAR_BUDGET = 459;
const SMS_SEGMENT_CHARS = 153;

export function smsSegments(text: string): number {
  return Math.max(1, Math.ceil(text.length / SMS_SEGMENT_CHARS));
}

/** The counter's words, exported so the three composers read identically. */
export function composerCountLabel(message: string, channel: ComposerChannel): { text: string; warn: boolean } {
  const trimmed = message.trim();
  const includesSms = channel === 'sms' || channel === 'both';
  const overSms = includesSms && trimmed.length > CUSTOM_SMS_CHAR_BUDGET - 40;
  const segments = smsSegments(trimmed);
  const tail =
    includesSms && trimmed.length > 0
      ? ` · about ${segments} text${segments === 1 ? '' : 's'}${overSms ? ' (SMS will be cut short)' : ''}`
      : '';
  return { text: `${trimmed.length} characters${tail}`, warn: overSms };
}

export function GuestMessageComposerHint({
  message,
  channel,
}: {
  message: string;
  channel: ComposerChannel;
}) {
  const { colors } = useTheme();
  const count = composerCountLabel(message, channel);
  return (
    <View style={styles.row}>
      <Text variant="caption" tone="muted" style={styles.hint}>
        Press return for a new line. Leave a blank line to start a new paragraph.
      </Text>
      <Text
        variant="caption"
        tone={count.warn ? undefined : 'muted'}
        color={count.warn ? colors.warning : undefined}
        style={styles.count}>
        {count.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    columnGap: spacing.sm,
    rowGap: 2,
  },
  hint: {
    flexShrink: 1,
  },
  count: {
    fontVariant: ['tabular-nums'],
  },
});
