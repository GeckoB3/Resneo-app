import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { STAFF_CARD_HOLD_LINK_SENT_LINE } from '@/lib/booking/card-hold';

/**
 * What the staff confirmation says about the card or deposit link (web QA 2026-11-08 BKG-A-F9,
 * BKG-A-F5). It said "A card request link was sent to the guest" and "the booking will be
 * auto-cancelled" after 24 hours for every booking, walk-ins too. The web now answers
 * `payment_link_sent: false` when the client has no email or phone, and a walk-in is booked straight
 * away and never cancelled for a missing card, so the lines follow both.
 */
export function staffPaymentLinkLines(input: {
  cardHold: boolean;
  paymentUrl: string | null | undefined;
  /** From the create response; absent from older servers, which read as sent. */
  linkSent: boolean | undefined;
  walkIn: boolean;
}): { sent: string; cancel: string | null; showLink: boolean } {
  const notSent = input.linkSent === false && Boolean(input.paymentUrl);
  const sent = notSent
    ? input.cardHold
      ? 'The client has no email or phone number, so the card request was not sent. Open the link on this device, or copy it to send. No payment is taken.'
      : 'The client has no email or phone number, so the deposit link was not sent. Open the link on this device, or copy it to send.'
    : input.cardHold
      ? `${STAFF_CARD_HOLD_LINK_SENT_LINE} No payment is taken.`
      : 'A deposit payment link has been sent to the guest.';
  const cancel =
    input.paymentUrl && !input.walkIn
      ? input.cardHold
        ? 'If card details are not added within 24 hours, the booking will be auto-cancelled.'
        : 'If deposit is not paid within 24 hours, the booking will be auto-cancelled.'
      : null;
  return { sent, cancel, showLink: notSent };
}

/** The lines above, with the link to copy when it was not sent. */
export function StaffPaymentLinkLines(props: {
  cardHold: boolean;
  paymentUrl: string | null | undefined;
  linkSent: boolean | undefined;
  walkIn: boolean;
}) {
  const lines = staffPaymentLinkLines(props);
  const [copied, setCopied] = useState(false);
  return (
    <>
      <Text variant="caption" tone="muted" testID="staff-payment-link-sent-line">
        {lines.sent}
      </Text>
      {lines.showLink && props.paymentUrl ? (
        <>
          <Text variant="bodySmall" selectable testID="staff-payment-link-url">
            {props.paymentUrl}
          </Text>
          <Button
            label={copied ? 'Copied' : 'Copy link'}
            variant="secondary"
            onPress={() => {
              void Clipboard.setStringAsync(props.paymentUrl ?? '').then(() => setCopied(true));
            }}
          />
        </>
      ) : null}
      {lines.cancel ? (
        <Text variant="caption" tone="muted">
          {lines.cancel}
        </Text>
      ) : null}
    </>
  );
}
