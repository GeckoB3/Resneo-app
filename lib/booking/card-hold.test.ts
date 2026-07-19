import {
  CARD_HOLD_LATE_CANCELLED_LINE,
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

  it('Pending + open unsaved hold = awaiting_card with resend + waive', () => {
    const state = resolveCardHoldUiState(
      { status: 'Pending', deposit_status: 'Pending' },
      hold(),
      { isAdmin: true, now: NOW },
    );
    expect(state?.kind).toBe('awaiting_card');
    expect(state?.pill?.label).toBe('Card request sent');
    expect(state?.pill?.variant).toBe('warning');
    expect(state?.lines[0]).toContain('£25.00');
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

  it('Card Held open = held pill (info) with fee line, no charge before No-Show', () => {
    const state = resolveCardHoldUiState(
      { status: 'Booked', deposit_status: 'Card Held' },
      hold({ saved: true }),
      { isAdmin: true, now: NOW },
    );
    expect(state?.kind).toBe('held');
    expect(state?.pill?.label).toBe('Card held');
    expect(state?.pill?.variant).toBe('info');
    expect(state?.lines[0]).toBe('No-show fee up to £25.00. No payment taken.');
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
    expect(state?.pill?.label).toBe('Card hold ended');
    expect(state?.lines[0]).toContain('8 Jul 2026');
    expect(state?.showReleaseAction).toBe(false);
  });

  it('Charged = warning pill + amount line + admin refund action', () => {
    const state = resolveCardHoldUiState(
      { status: 'No-Show', deposit_status: 'Charged' },
      hold({ saved: true, charged_pence: 2500, charged_at: '2026-07-10T09:00:00Z' }),
      { isAdmin: true, now: NOW },
    );
    expect(state?.kind).toBe('charged');
    expect(state?.pill?.label).toBe('No-show fee charged');
    expect(state?.lines[0]).toBe('£25.00 charged on 10 Jul 2026.');
    expect(state?.showRefundAction).toBe(true);
    expect(state?.showChargeAction).toBe(false);
  });

  it('Refunded (was Charged) = brand pill + refunded line, no actions', () => {
    const state = resolveCardHoldUiState(
      { status: 'No-Show', deposit_status: 'Refunded' },
      hold({ saved: true, charged_pence: 2500, released_at: '2026-07-11T09:00:00Z' }),
      { isAdmin: true, now: NOW },
    );
    expect(state?.kind).toBe('refunded');
    expect(state?.pill?.label).toBe('No-show fee refunded');
    expect(state?.lines[0]).toBe('£25.00 refunded.');
    expect(state?.showRefundAction).toBe(false);
  });

  it('Waived hold = inactive with the waived line', () => {
    const state = resolveCardHoldUiState(
      { status: 'Booked', deposit_status: 'Waived' },
      hold(),
      { isAdmin: true, now: NOW },
    );
    expect(state?.kind).toBe('inactive');
    expect(state?.lines).toEqual([CARD_HOLD_WAIVED_LINE]);
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
    expect(state?.lines[0]).toBe('Card securely on file. No payment taken.');
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
  it('resolves the fee with units for card_hold entities when the flag is on', () => {
    expect(
      resolveStaffEntityCardHold({
        paymentRequirement: 'card_hold',
        feePerUnitPence: 500,
        cardHoldFlagEnabled: true,
        units: 3,
      }),
    ).toEqual({ feePence: 1500 });
    expect(
      resolveStaffEntityCardHold({
        paymentRequirement: 'card_hold',
        feePerUnitPence: 2500,
        cardHoldFlagEnabled: true,
      }),
    ).toEqual({ feePence: 2500 });
  });

  it('returns null when the flag is off, the requirement differs, or the fee is not positive', () => {
    expect(
      resolveStaffEntityCardHold({
        paymentRequirement: 'card_hold',
        feePerUnitPence: 500,
        cardHoldFlagEnabled: false,
      }),
    ).toBeNull();
    expect(
      resolveStaffEntityCardHold({
        paymentRequirement: 'deposit',
        feePerUnitPence: 500,
        cardHoldFlagEnabled: true,
      }),
    ).toBeNull();
    expect(
      resolveStaffEntityCardHold({
        paymentRequirement: 'card_hold',
        feePerUnitPence: 0,
        cardHoldFlagEnabled: true,
      }),
    ).toBeNull();
  });

  it('floors fractional units and treats sub-1 units as a single unit', () => {
    expect(
      resolveStaffEntityCardHold({
        paymentRequirement: 'card_hold',
        feePerUnitPence: 500,
        cardHoldFlagEnabled: true,
        units: 2.9,
      }),
    ).toEqual({ feePence: 1000 });
    expect(
      resolveStaffEntityCardHold({
        paymentRequirement: 'card_hold',
        feePerUnitPence: 500,
        cardHoldFlagEnabled: true,
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
