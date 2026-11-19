import {
  CARD_EXPIRES_BEFORE_LINE,
  CARD_HOLD_LATE_CANCELLED_LINE,
  CARD_NOT_NEEDED_LINE,
  CARD_NOT_YOU_LINE,
  cardExpiresBefore,
  cardExpiry,
  cardLabel,
  cardStateFromRow,
  cardStatePill,
  confirmWithoutCardQuestion,
  parseStaffCreateCardOnFile,
  staffCancelIfNoCardAllowed,
  staffCardConfirmationLines,
  staffCardFoundLine,
  staffCardNotPossibleLine,
  staffCardStateLabel,
  staffGroupCardFoundLine,
  staffSendCardRequestLine,
  waitingForCardHomeLine,
  CARD_HOLD_REQUEST_CANCELLED_LINE,
  CARD_HOLD_WAIVED_LINE,
  CARD_HOLD_WINDOW_EXPIRED_LINE,
  cardHoldChargeFailureLine,
  formatCardHoldFeePence,
  isRosterChargeLinkCandidate,
  resolveCardHoldUiState,
  resolveStaffEntityCardHold,
  staffCardHoldFeeLine,
  type CardHoldSummary,
} from '@/lib/booking/card-hold';

/**
 * Card-hold staff UI state machine + form helpers, ported from the web
 * (card-hold-ui-state.test.ts). Every §9.1 display kind, the §9.2a charge-gate
 * mirror, and the staff-toggle entity resolution.
 */

const NOW = new Date('2026-07-10T12:00:00Z');

function hold(overrides: Partial<CardHoldSummary> = {}): CardHoldSummary {
  return {
    fee_pence: 2500,
    saved: false,
    charged_pence: null,
    charged_at: null,
    released_at: null,
    charge_failure_code: null,
    charge_window_ends_at: '2026-07-20T12:00:00Z',
    late_cancellation_at: null,
    ...overrides,
  };
}

describe('resolveCardHoldUiState', () => {
  it('returns null when there is no hold row and no hold-only enum value', () => {
    expect(
      resolveCardHoldUiState({ status: 'Booked', deposit_status: 'Pending' }, null, {
        isAdmin: true,
      }),
    ).toBeNull();
    expect(
      resolveCardHoldUiState({ status: 'Booked', deposit_status: 'Paid' }, null, {
        isAdmin: true,
      }),
    ).toBeNull();
  });

  it('Pending + open unsaved hold (older server) = Waiting for card with send + confirm without', () => {
    const state = resolveCardHoldUiState(
      { status: 'Pending', deposit_status: 'Pending' },
      hold(),
      { isAdmin: true, now: NOW },
    );
    expect(state?.kind).toBe('awaiting_card');
    expect(state?.pill?.label).toBe('Waiting for card');
    expect(state?.pill?.variant).toBe('warning');
    expect(state?.lines).toContain('No-show fee up to £25.00.');
    expect(state?.showSendCardRequest).toBe(true);
    expect(state?.showConfirmWithoutCard).toBe(true);
    expect(state?.showAddCardNow).toBe(true);
    expect(state?.showResendLink).toBe(true);
    expect(state?.showWaive).toBe(true);
    expect(state?.showChargeAction).toBe(false);
  });

  it('Pending + released hold = request_cancelled (informational only)', () => {
    const state = resolveCardHoldUiState(
      { status: 'Cancelled', deposit_status: 'Pending' },
      hold({ released_at: '2026-07-09T10:00:00Z' }),
      { isAdmin: true, now: NOW },
    );
    expect(state?.kind).toBe('request_cancelled');
    expect(state?.pill).toBeNull();
    expect(state?.lines).toEqual([CARD_HOLD_REQUEST_CANCELLED_LINE]);
    expect(state?.showResendLink).toBe(false);
  });

  it('Pending + saved hold reads as held (confirm race)', () => {
    const state = resolveCardHoldUiState(
      { status: 'Booked', deposit_status: 'Pending' },
      hold({ saved: true }),
      { isAdmin: true, now: NOW },
    );
    expect(state?.kind).toBe('held');
    expect(state?.showResendLink).toBe(false);
    expect(state?.showWaive).toBe(false);
  });

  it('Card Held open = Protected pill (info) with fee line, no charge before No-Show', () => {
    const state = resolveCardHoldUiState(
      { status: 'Booked', deposit_status: 'Card Held' },
      hold({ saved: true }),
      { isAdmin: true, now: NOW },
    );
    expect(state?.kind).toBe('held');
    expect(state?.pill?.label).toBe('Protected');
    expect(state?.pill?.variant).toBe('info');
    expect(state?.lines[0]).toBe('Protected by a card saved for this booking. No-show fee up to £25.00.');
    expect(state?.showChargeAction).toBe(false);
  });

  it('No-Show + Card Held + saved + in window = admin charge action', () => {
    const booking = { status: 'No-Show', deposit_status: 'Card Held' };
    const admin = resolveCardHoldUiState(booking, hold({ saved: true }), {
      isAdmin: true,
      now: NOW,
    });
    expect(admin?.showChargeAction).toBe(true);
    const staff = resolveCardHoldUiState(booking, hold({ saved: true }), {
      isAdmin: false,
      now: NOW,
    });
    expect(staff?.showChargeAction).toBe(false);
  });

  it('charge gate blocks on unsaved card, released hold, and expired window', () => {
    const booking = { status: 'No-Show', deposit_status: 'Card Held' };
    expect(
      resolveCardHoldUiState(booking, hold({ saved: false }), { isAdmin: true, now: NOW })
        ?.showChargeAction,
    ).toBe(false);
    expect(
      resolveCardHoldUiState(
        booking,
        hold({ saved: true, released_at: '2026-07-09T10:00:00Z' }),
        { isAdmin: true, now: NOW },
      )?.showChargeAction,
    ).toBe(false);
    const expired = resolveCardHoldUiState(
      booking,
      hold({ saved: true, charge_window_ends_at: '2026-07-01T12:00:00Z' }),
      { isAdmin: true, now: NOW },
    );
    expect(expired?.showChargeAction).toBe(false);
    expect(expired?.lines).toContain(CARD_HOLD_WINDOW_EXPIRED_LINE);
  });

  it('kept late cancellation stays chargeable and offers release', () => {
    const state = resolveCardHoldUiState(
      { status: 'Cancelled', deposit_status: 'Card Held' },
      hold({ saved: true, late_cancellation_at: '2026-07-09T18:00:00Z' }),
      { isAdmin: true, now: NOW },
    );
    expect(state?.kind).toBe('held');
    expect(state?.lines).toContain(CARD_HOLD_LATE_CANCELLED_LINE);
    expect(state?.showChargeAction).toBe(true);
    expect(state?.showReleaseAction).toBe(true);
  });

  it('Card Held + released = ended (neutral pill, release date line)', () => {
    const state = resolveCardHoldUiState(
      { status: 'Cancelled', deposit_status: 'Card Held' },
      hold({ saved: true, released_at: '2026-07-08T09:00:00Z' }),
      { isAdmin: true, now: NOW },
    );
    expect(state?.kind).toBe('ended');
    expect(state?.pill?.label).toBe('Protection ended');
    expect(state?.lines[0]).toContain('8 Jul 2026');
    expect(state?.showReleaseAction).toBe(false);
  });

  it('Charged = Fee charged pill + amount line + admin refund action', () => {
    const state = resolveCardHoldUiState(
      { status: 'No-Show', deposit_status: 'Charged' },
      hold({ saved: true, charged_pence: 2500, charged_at: '2026-07-10T09:00:00Z' }),
      { isAdmin: true, now: NOW },
    );
    expect(state?.kind).toBe('charged');
    expect(state?.pill?.label).toBe('Fee charged');
    expect(state?.lines[0]).toBe('£25.00 charged on 10 Jul 2026.');
    expect(state?.showRefundAction).toBe(true);
    expect(state?.showChargeAction).toBe(false);
  });

  it('Refunded (was Charged) = Fee refunded pill + refunded line, no actions', () => {
    const state = resolveCardHoldUiState(
      { status: 'No-Show', deposit_status: 'Refunded' },
      hold({ saved: true, charged_pence: 2500, released_at: '2026-07-11T09:00:00Z' }),
      { isAdmin: true, now: NOW },
    );
    expect(state?.kind).toBe('refunded');
    expect(state?.pill?.label).toBe('Fee refunded');
    expect(state?.lines[0]).toBe('£25.00 refunded.');
    expect(state?.showRefundAction).toBe(false);
  });

  it('Waived open hold (older server) = Card not needed, send card request but no confirm without', () => {
    const state = resolveCardHoldUiState(
      { status: 'Booked', deposit_status: 'Waived' },
      hold(),
      { isAdmin: true, now: NOW },
    );
    expect(state?.kind).toBe('not_needed');
    expect(state?.pill?.label).toBe('Card not needed');
    expect(state?.lines).toEqual([CARD_HOLD_WAIVED_LINE]);
    expect(state?.showSendCardRequest).toBe(true);
    expect(state?.showConfirmWithoutCard).toBe(false);
  });

  it('appends the plain-words failure line when the last charge failed', () => {
    const state = resolveCardHoldUiState(
      { status: 'No-Show', deposit_status: 'Card Held' },
      hold({ saved: true, charge_failure_code: 'card_declined' }),
      { isAdmin: true, now: NOW },
    );
    expect(state?.lines).toContain(cardHoldChargeFailureLine('card_declined'));
    expect(cardHoldChargeFailureLine('card_declined')).toBe(
      'Last charge attempt failed: the card was declined.',
    );
  });

  it('enum-only fallback (no hold row) shows the pill but never the charge action', () => {
    const state = resolveCardHoldUiState(
      { status: 'No-Show', deposit_status: 'Card Held' },
      null,
      { isAdmin: true, now: NOW },
    );
    expect(state?.kind).toBe('held');
    expect(state?.feePence).toBeNull();
    expect(state?.lines[0]).toBe('Protected by a card saved for this booking.');
    expect(state?.showChargeAction).toBe(false);
    expect(state?.hideLegacyDepositActions).toBe(true);
  });
});

describe('isRosterChargeLinkCandidate', () => {
  it('flags only canonical No-Show rows with a Card Held deposit status', () => {
    expect(isRosterChargeLinkCandidate({ status: 'No-Show', deposit_status: 'Card Held' })).toBe(true);
    expect(isRosterChargeLinkCandidate({ status: 'No-Show', deposit_status: 'Paid' })).toBe(false);
    expect(isRosterChargeLinkCandidate({ status: 'Booked', deposit_status: 'Card Held' })).toBe(false);
    expect(isRosterChargeLinkCandidate({ status: 'No Show', deposit_status: 'Card Held' })).toBe(false);
  });
});

describe('resolveStaffEntityCardHold', () => {
  it('resolves the fee with units for card_hold entities', () => {
    expect(
      resolveStaffEntityCardHold({
        paymentRequirement: 'card_hold',
        feePerUnitPence: 500,
        units: 3,
      }),
    ).toEqual({ feePence: 1500 });
    expect(
      resolveStaffEntityCardHold({
        paymentRequirement: 'card_hold',
        feePerUnitPence: 2500,
      }),
    ).toEqual({ feePence: 2500 });
  });

  it('returns null when the requirement differs or the fee is not positive', () => {
    expect(
      resolveStaffEntityCardHold({
        paymentRequirement: 'deposit',
        feePerUnitPence: 500,
      }),
    ).toBeNull();
    expect(
      resolveStaffEntityCardHold({
        paymentRequirement: 'card_hold',
        feePerUnitPence: 0,
      }),
    ).toBeNull();
  });

  it('floors fractional units and treats sub-1 units as a single unit', () => {
    expect(
      resolveStaffEntityCardHold({
        paymentRequirement: 'card_hold',
        feePerUnitPence: 500,
        units: 2.9,
      }),
    ).toEqual({ feePence: 1000 });
    expect(
      resolveStaffEntityCardHold({
        paymentRequirement: 'card_hold',
        feePerUnitPence: 500,
        units: 0,
      }),
    ).toEqual({ feePence: 500 });
  });
});

describe('copy helpers', () => {
  it('formats fees as £X.XX', () => {
    expect(formatCardHoldFeePence(2500)).toBe('£25.00');
    expect(formatCardHoldFeePence(150)).toBe('£1.50');
  });

  it('builds the staff toggle fee line', () => {
    expect(staffCardHoldFeeLine(2500)).toBe('No-show fee up to £25.00');
  });
});

describe('staffCardHoldToggleSublabel (web #187)', () => {
  const { staffCardHoldToggleSublabel, CARD_HOLD_LINK_TIMEOUT_HOURS } = require('@/lib/booking/card-hold');
  it('says what each position does, with the 24-hour cancel on the ON side', () => {
    expect(CARD_HOLD_LINK_TIMEOUT_HOURS).toBe(24);
    expect(staffCardHoldToggleSublabel(true)).toBe(
      'On: the guest gets a link to add their card, charged only if they do not show. The booking is cancelled if no card is added within 24 hours.',
    );
    expect(staffCardHoldToggleSublabel(false)).toBe(
      'Off: no card is taken, so a no-show cannot be charged.',
    );
  });
});

describe('card on file states (card-on-file-plan §6.3)', () => {
  const visa = {
    kind: 'card_on_file' as const,
    brand: 'visa',
    last4: '4242',
    exp_month: 8,
    exp_year: 2028,
    cardholder_name: 'A Smith',
    scope: 'collective',
    status: 'active',
  };

  it('a card on file reads Protected with the card and how it was found', () => {
    const state = resolveCardHoldUiState(
      { status: 'Booked', deposit_status: 'Card Held', booking_date: '2026-07-20' },
      hold({
        saved: true,
        state: 'held',
        source: 'card_on_file',
        card: visa,
        found_by: 'same_details',
        found_by_label: 'Matched by email and phone online',
      }),
      { isAdmin: true, now: NOW },
    );
    expect(state?.pill?.label).toBe('Protected');
    expect(state?.lines).toEqual([
      'Protected by card on file. Visa ending 4242. No-show fee up to £25.00.',
      'Matched by email and phone online.',
    ]);
  });

  it('says when the card expires before the booking (C7)', () => {
    const state = resolveCardHoldUiState(
      { status: 'Booked', deposit_status: 'Card Held', booking_date: '2028-09-01' },
      hold({ saved: true, state: 'held', source: 'card_on_file', card: visa }),
      { isAdmin: false, now: NOW },
    );
    expect(state?.lines).toContain(CARD_EXPIRES_BEFORE_LINE);
  });

  it('a Booked booking waiting for a card (new server) offers the three actions', () => {
    const state = resolveCardHoldUiState(
      { status: 'Booked', deposit_status: 'Pending' },
      hold({ state: 'awaiting', source: 'awaiting', cancel_if_no_card_at: '2026-07-11T12:00:00Z' }),
      { isAdmin: false, now: NOW },
    );
    expect(state?.kind).toBe('awaiting_card');
    expect(state?.lines[0]).toBe('Waiting for card. A card request was sent to the client.');
    expect(state?.lines[1]).toMatch(/^The booking is cancelled if no card is added by 11 July, /);
    expect(state?.showSendCardRequest && state.showAddCardNow && state.showConfirmWithoutCard).toBe(true);
  });

  it('Card not needed from request_waived_at offers Send card request only', () => {
    const state = resolveCardHoldUiState(
      { status: 'Booked', deposit_status: 'Waived' },
      hold({ state: 'not_needed', request_waived_at: '2026-07-09T10:00:00Z' }),
      { isAdmin: true, now: NOW },
    );
    expect(state?.kind).toBe('not_needed');
    expect(state?.lines).toEqual([CARD_NOT_NEEDED_LINE]);
    expect(state?.showSendCardRequest).toBe(true);
    expect(state?.showConfirmWithoutCard).toBe(false);
  });

  it('Not you is said above the waiting line', () => {
    const state = resolveCardHoldUiState(
      { status: 'Booked', deposit_status: 'Pending' },
      hold({ state: 'awaiting', not_you_at: '2026-07-09T10:00:00Z' }),
      { isAdmin: true, now: NOW },
    );
    expect(state?.lines[0]).toBe(CARD_NOT_YOU_LINE);
  });

  it('offers nothing to send once the booking is over', () => {
    const state = resolveCardHoldUiState(
      { status: 'Completed', deposit_status: 'Pending' },
      hold({ state: 'awaiting' }),
      { isAdmin: true, now: NOW },
    );
    expect(state?.showSendCardRequest).toBe(false);
    expect(state?.showConfirmWithoutCard).toBe(false);
  });

  it('a list row card_state stands in for the hold when it is not loaded', () => {
    const state = resolveCardHoldUiState(
      { status: 'Booked', deposit_status: 'Pending', card_state: 'waiting' },
      undefined,
      { isAdmin: true, now: NOW },
    );
    expect(state?.kind).toBe('awaiting_card');
    expect(state?.showChargeAction).toBe(false);
  });
});

describe('card state words', () => {
  it('maps every card_state to its staff word and pill', () => {
    expect(staffCardStateLabel('protected')).toBe('Protected');
    expect(staffCardStateLabel('waiting')).toBe('Waiting for card');
    expect(staffCardStateLabel('not_needed')).toBe('Card not needed');
    expect(staffCardStateLabel('charged')).toBe('Fee charged');
    expect(staffCardStateLabel(null)).toBeNull();
    expect(cardStatePill('waiting')?.variant).toBe('warning');
    expect(cardStatePill('bogus')).toBeNull();
  });

  it('reads a row from an older server by its deposit status only', () => {
    expect(cardStateFromRow({ deposit_status: 'Card Held' })).toBe('protected');
    expect(cardStateFromRow({ deposit_status: 'Pending' })).toBeNull();
    expect(cardStateFromRow({ card_state: null, deposit_status: 'Card Held' })).toBeNull();
    expect(cardStateFromRow({ card_state: 'not_needed', deposit_status: 'Waived' })).toBe('not_needed');
  });

  it('labels cards and expiry like the web', () => {
    expect(cardLabel('visa', '4242')).toBe('Visa ending 4242');
    expect(cardLabel(null, null)).toBe('Card');
    expect(cardExpiry(8, 2028)).toBe('08/28');
    expect(cardExpiresBefore(8, 2028, '2028-08-31')).toBe(false);
    expect(cardExpiresBefore(8, 2028, '2028-09-01')).toBe(true);
  });
});

describe('staff booking form card line (plan §6.2)', () => {
  it('says what each switch and tick position does', () => {
    expect(staffSendCardRequestLine(true, false)).toBe(
      "The booking is confirmed now. If the client doesn't add a card, it stays booked and shows Waiting for card.",
    );
    expect(staffSendCardRequestLine(true, true)).toBe(
      'The booking waits for the card, and is cancelled if none is added within 24 hours.',
    );
    expect(staffSendCardRequestLine(false, true)).toBe(
      'No card will be asked for. The booking shows Card not needed.',
    );
  });

  it('offers the tick only for a phone booking whose client can be reached', () => {
    expect(staffCancelIfNoCardAllowed({ walkIn: true, email: 'a@b.c' })).toBe(false);
    expect(staffCancelIfNoCardAllowed({ walkIn: false, email: '', phone: null })).toBe(false);
    expect(staffCancelIfNoCardAllowed({ walkIn: false, phone: '+447700900000' })).toBe(true);
  });

  it('builds the found, group and not possible lines', () => {
    expect(staffCardFoundLine('visa', '4242', 1000)).toBe(
      'Protected by card on file (Visa ending 4242). No-show fee up to £10.00.',
    );
    expect(staffGroupCardFoundLine('Amy')).toBe(
      "Protected by Amy's card on file. It covers everyone in this booking.",
    );
    expect(staffCardNotPossibleLine('Sage Studio')).toBe(
      "Card not possible: Sage Studio can't take card payments yet.",
    );
  });

  it('parses the create response and words the confirmation', () => {
    expect(parseStaffCreateCardOnFile(undefined)).toBeNull();
    const waiting = parseStaffCreateCardOnFile({ covered: false, state: 'waiting', cancel_if_no_card_at: null });
    expect(waiting?.state).toBe('waiting');
    expect(staffCardConfirmationLines({ cardOnFile: waiting!, sentTo: 'amy@example.com' })).toEqual({
      heading: 'Booking confirmed',
      lines: [
        'A card request was sent to amy@example.com.',
        'The booking stays booked and shows Waiting for card until the client adds one.',
      ],
    });
    const ticked = parseStaffCreateCardOnFile({ state: 'waiting', cancel_if_no_card_at: '2026-07-11T12:00:00Z' });
    expect(staffCardConfirmationLines({ cardOnFile: ticked! }).heading).toBe('Waiting for card');
  });

  it('says no new request went when one already went today (2026-11-19)', () => {
    const again = parseStaffCreateCardOnFile({ state: 'waiting', cancel_if_no_card_at: null, request_already_sent_today: true });
    expect(again?.request_already_sent_today).toBe(true);
    expect(staffCardConfirmationLines({ cardOnFile: again!, sentTo: 'amy@example.com' }).lines[0]).toBe(
      'amy@example.com already had a card request today, so no new one was sent. The link in it covers this booking too.',
    );
    // An older server sends no flag: the old line.
    expect(parseStaffCreateCardOnFile({ state: 'waiting' })?.request_already_sent_today).toBe(false);
  });

  it('words the bulk questions', () => {
    expect(confirmWithoutCardQuestion(86).confirmLabel).toBe('Confirm 86 bookings');
    expect(confirmWithoutCardQuestion(1).title).toBe('Confirm 1 booking without a card?');
    expect(waitingForCardHomeLine(6)).toBe('6 upcoming bookings are waiting for a card');
    expect(waitingForCardHomeLine(1)).toBe('1 upcoming booking is waiting for a card');
  });
});
