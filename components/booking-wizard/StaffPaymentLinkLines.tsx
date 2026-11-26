import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { staffDepositCancelOnLine, type StaffDepositOutcome } from '@/lib/booking/staff-deposit-deadline';

/**
 * What the staff confirmation says about the card or deposit link (web QA 2026-11-08 BKG-A-F9,
 * BKG-A-F5). It said "A card request link was sent to the guest" and "the booking will be
 * auto-cancelled" after 24 hours for every booking, walk-ins too. The web now answers
 * `payment_link_sent: false` when the client has no email or phone, and a walk-in is booked straight
 * away and never cancelled for a missing card, so the lines follow both.
 *
 * Card on file (web card-on-file-plan §4.9, D26): a staff booking waiting for a card stays booked.
 * Only a booking with "Cancel if no card is added within 24 hours" ticked is cancelled, so the
 * cancellation line is said for that tick alone.
 *
 * Deposits (web deposit-handling plan DH1, DH2, 26 Nov 2026): a deposit booking is cancelled only
 * when staff left "Cancel if not paid" on, at the earlier of 24 hours or 2 hours before the start.
 * The line says that deadline, or that a kept booking stays booked; it said "within 24 hours"
 * for every deposit.
 */
export function staffPaymentLinkLines(input: {
  cardHold: boolean;
  paymentUrl: string | null | undefined;
  /** From the create response; absent from older servers, which read as sent. */
  linkSent: boolean | undefined;
  walkIn: boolean;
  /** The card request's "Cancel if no card is added within 24 hours" was ticked. */
  cancelIfNoCard?: boolean;
  /**
   * A deposit link: whether the booking was kept and, if it waits, until when. Omitted where the
   * screen says it elsewhere, and then no cancellation line is said here.
   */
  deposit?: StaffDepositOutcome | null;
  /** "payment" for a service paid in full, when `deposit` is not given. */
  depositWord?: 'deposit' | 'payment';
}): { sent: string; cancel: string | null; showLink: boolean } {
  const word = input.deposit?.word ?? input.depositWord ?? 'deposit';
  const notSent = input.linkSent === false && Boolean(input.paymentUrl);
  const sent = notSent
    ? input.cardHold
      ? 'The client has no email or phone number, so the card request was not sent. Open the link on this device, or copy it to send. No payment is taken.'
      : `The client has no email or phone number, so the ${word} link was not sent. Open the link on this device, or copy it to send.`
    : input.cardHold
      ? 'A card request was sent to the client. No payment is taken.'
      : word === 'payment'
        ? 'A payment link has been sent to the client.'
        : 'A deposit payment link has been sent to the client.';
  const cancel =
    input.paymentUrl && !input.walkIn
      ? input.cardHold
        ? input.cancelIfNoCard
          ? 'If no card is added within 24 hours, the booking is cancelled.'
          : null
        : depositCancelLine(input.deposit ?? null)
      : null;
  return { sent, cancel, showLink: notSent };
}

function depositCancelLine(deposit: StaffDepositOutcome | null): string | null {
  if (!deposit) return null;
  if (deposit.kept) return `The booking stays booked if the ${deposit.word} is not paid.`;
  return deposit.cancelOn ? staffDepositCancelOnLine(deposit.cancelOn) : null;
}

/** The lines above, with the link to copy when it was not sent. */
export function StaffPaymentLinkLines(props: {
  cardHold: boolean;
  paymentUrl: string | null | undefined;
  linkSent: boolean | undefined;
  walkIn: boolean;
  cancelIfNoCard?: boolean;
  deposit?: StaffDepositOutcome | null;
  depositWord?: 'deposit' | 'payment';
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
