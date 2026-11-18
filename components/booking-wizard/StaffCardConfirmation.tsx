/**
 * The card part of a staff booking's confirmation (web Docs/card-on-file-plan.md §6.2): what the
 * create's `card_on_file` says happened, in staff words.
 *
 * - Protected: "Protected by card on file (Visa ending 4242). No-show fee up to £10."
 * - Waiting for card: "A card request was sent to {email}." and either "The booking stays booked
 *   and shows Waiting for card until the client adds one." or, when "Cancel if no card" was
 *   ticked, the deadline. When the client has no email or phone the request was not sent, so the
 *   link is shown to open or copy.
 * - Card not needed: "No card was asked for. The booking shows Card not needed."
 * - Card not possible: "Card not possible: {business} can't take card payments yet."
 *
 * "Add card now" is offered under Waiting for card and Card not needed when the client has a
 * record (the form knows its id).
 */
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import {
  CARD_ADD_NOW_LABEL,
  CARD_STATE_NOT_NEEDED,
  CARD_STATE_PROTECTED,
  CARD_STATE_WAITING,
  staffCardConfirmationLines,
  type StaffCreateCardOnFile,
} from '@/lib/booking/card-hold';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const STATE_WORD: Record<StaffCreateCardOnFile['state'], string> = {
  protected: CARD_STATE_PROTECTED,
  waiting: CARD_STATE_WAITING,
  not_needed: CARD_STATE_NOT_NEEDED,
  not_possible: 'Card not possible',
};

export const CARD_REQUEST_NOT_SENT_LINE =
  'The client has no email or phone number, so the card request was not sent. Open the link on this device, or copy it to send. No payment is taken.';

/** The heading and lines, with the not-sent case folded in. */
export function staffCardConfirmationView(input: {
  cardOnFile: StaffCreateCardOnFile;
  feePence?: number | null;
  sentTo?: string | null;
  businessName?: string | null;
  paymentUrl?: string | null;
  linkSent?: boolean;
}): { heading: 'Booking confirmed' | 'Waiting for card'; word: string; lines: string[]; showLink: boolean } {
  const base = staffCardConfirmationLines({
    cardOnFile: input.cardOnFile,
    feePence: input.feePence ?? null,
    sentTo: input.sentTo ?? null,
    businessName: input.businessName ?? null,
  });
  const notSent = input.cardOnFile.state === 'waiting' && input.linkSent === false && Boolean(input.paymentUrl);
  const lines = notSent ? [CARD_REQUEST_NOT_SENT_LINE, ...base.lines.slice(1)] : base.lines;
  return { heading: base.heading, word: STATE_WORD[input.cardOnFile.state], lines, showLink: notSent };
}

export function StaffCardConfirmation({
  cardOnFile,
  feePence,
  sentTo,
  businessName,
  paymentUrl,
  linkSent,
  onAddCardNow,
}: {
  cardOnFile: StaffCreateCardOnFile;
  feePence?: number | null;
  sentTo?: string | null;
  businessName?: string | null;
  paymentUrl?: string | null;
  linkSent?: boolean;
  onAddCardNow?: () => void;
}) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  const view = staffCardConfirmationView({ cardOnFile, feePence, sentTo, businessName, paymentUrl, linkSent });
  const canAdd = cardOnFile.state === 'waiting' || cardOnFile.state === 'not_needed';
  return (
    <View
      style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="staff-card-confirmation">
      <Text variant="bodySmall" tone="brand">
        {view.word}
      </Text>
      {view.lines.map((line) => (
        <Text key={line} variant="caption" tone="muted">
          {line}
        </Text>
      ))}
      {view.showLink && paymentUrl ? (
        <>
          <Text variant="bodySmall" selectable>
            {paymentUrl}
          </Text>
          <Button
            label={copied ? 'Copied' : 'Copy link'}
            variant="secondary"
            onPress={() => {
              void Clipboard.setStringAsync(paymentUrl).then(() => setCopied(true));
            }}
          />
        </>
      ) : null}
      {canAdd && onAddCardNow ? (
        <Button label={CARD_ADD_NOW_LABEL} variant="secondary" size="sm" onPress={onAddCardNow} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.md,
  },
});
