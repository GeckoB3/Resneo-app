/**
 * Web QA 2026-11-08 BKG-A-F9: the staff confirmation said the card link was sent, and that the
 * booking auto-cancels after 24 hours, for every booking, walk-ins too.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

import { StaffPaymentLinkLines, staffPaymentLinkLines } from '@/components/booking-wizard/StaffPaymentLinkLines';
import { staffCancelIfNoCardAllowed, staffSendCardRequestLine } from '@/lib/booking/card-hold';

describe('staffPaymentLinkLines', () => {
  it('a phone booking whose request went: sent, and no cancellation unless ticked (card on file §4.9)', () => {
    expect(staffPaymentLinkLines({ cardHold: true, paymentUrl: 'https://x/l', linkSent: true, walkIn: false })).toEqual({
      sent: 'A card request was sent to the client. No payment is taken.',
      cancel: null,
      showLink: false,
    });
    expect(
      staffPaymentLinkLines({ cardHold: true, paymentUrl: 'https://x/l', linkSent: true, walkIn: false, cancelIfNoCard: true })
        .cancel,
    ).toBe('If no card is added within 24 hours, the booking is cancelled.');
  });

  it('a deposit link still says the 24-hour cancellation', () => {
    expect(staffPaymentLinkLines({ cardHold: false, paymentUrl: 'https://x/l', linkSent: true, walkIn: false }).cancel).toBe(
      'If deposit is not paid within 24 hours, the booking will be auto-cancelled.',
    );
  });

  it('a walk-in is never cancelled for a missing card', () => {
    expect(staffPaymentLinkLines({ cardHold: true, paymentUrl: 'https://x/l', linkSent: true, walkIn: true }).cancel).toBeNull();
  });

  it('a link that could not go is shown to open or copy, not claimed as sent', () => {
    const lines = staffPaymentLinkLines({ cardHold: true, paymentUrl: 'https://x/l', linkSent: false, walkIn: true });
    expect(lines.sent).toBe(
      'The client has no email or phone number, so the card request was not sent. Open the link on this device, or copy it to send. No payment is taken.',
    );
    expect(lines.showLink).toBe(true);
  });

  it('an older server that does not say reads as sent, as before', () => {
    expect(staffPaymentLinkLines({ cardHold: false, paymentUrl: 'https://x/l', linkSent: undefined, walkIn: false }).sent).toBe(
      'A deposit payment link has been sent to the guest.',
    );
  });

  it('renders the link with Copy when it was not sent', async () => {
    await render(<StaffPaymentLinkLines cardHold paymentUrl="https://x/l" linkSent={false} walkIn />);
    expect(screen.getByText('https://x/l')).toBeTruthy();
    fireEvent.press(screen.getByText('Copy link'));
    expect(screen.queryByText(/auto-cancelled/)).toBeNull();
  });
});

describe('the card request switch for a walk-in', () => {
  it('never offers or promises a cancellation for a walk-in', () => {
    expect(staffSendCardRequestLine(true, true, true)).toBe(
      "The booking is confirmed now. If the client doesn't add a card, it stays booked and shows Waiting for card.",
    );
    expect(staffCancelIfNoCardAllowed({ walkIn: true, email: 'a@b.c' })).toBe(false);
  });
});
