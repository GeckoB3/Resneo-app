/**
 * DepositSheet — which deposit actions are offered, and for which states.
 *
 * R21-1 / web F18. The gate here used to be "not Paid and not Refunded", so Send
 * payment link / Record cash payment / Waive deposit appeared on every booking
 * whose deposit was `'Not Required'` — which is every service with no deposit at
 * all. `send_payment_link` had always been refused server-side; `waive` and
 * `record_cash` had not, so recording cash wrote `deposit_status: 'Paid'` with a
 * zero amount and the row then read "£0.00 · Paid" beside its real outstanding
 * balance, offering to refund £0. Web closed that in `491832ca` (both now answer
 * 409 `invalid_state`), which turned the app's three buttons into three ways to
 * produce an error. These pin the client half.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';
import { resolveCardHoldUiState } from '@/lib/booking/card-hold';

import { DepositSheet, type DepositTarget } from './DepositSheet';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

/** Render Sheet children inline (avoids gesture-handler/Modal). */
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

jest.mock('@/lib/haptics', () => ({
  hapticSuccess: jest.fn(),
  hapticWarning: jest.fn(),
  hapticTap: jest.fn(),
}));

const mockDeposit = jest.fn();
const mockKeep = jest.fn();
jest.mock('@/lib/queries/useBookingMutations', () => ({
  useBookingDeposit: () => ({ mutateAsync: mockDeposit, isPending: false }),
  useKeepWithoutDeposit: () => ({ mutateAsync: mockKeep, isPending: false }),
}));

const mockSendRequests = jest.fn();
const mockConfirmWithout = jest.fn();
const mockUndo = jest.fn();
jest.mock('@/lib/queries/useCardsOnFile', () => ({
  useSendCardRequests: () => ({ mutateAsync: mockSendRequests, isPending: false }),
  useConfirmWithoutCard: () => ({ mutateAsync: mockConfirmWithout, isPending: false }),
  useUndoConfirmWithoutCard: () => ({ mutateAsync: mockUndo, isPending: false }),
}));

/** The visit charge panel has its own suite; here it only says it was opened. */
const mockPanelUnavailable = { current: false };
jest.mock('@/components/bookings/ChargeNoShowPanel', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    ChargeNoShowPanel: ({ visitId, onUnavailable }: { visitId: string; onUnavailable: () => void }) => {
      React.useEffect(() => {
        if (mockPanelUnavailable.current) onUnavailable();
      }, [onUnavailable]);
      return React.createElement(Text, null, `charge panel for ${visitId}`);
    },
  };
});

const onClose = jest.fn();

function target(over: Partial<DepositTarget> = {}): DepositTarget {
  return {
    id: 'bk-1',
    guestName: 'Alex Rivera',
    amountPence: 2500,
    status: 'Pending',
    ...over,
  };
}

/** The three actions that only make sense while a deposit is outstanding. */
const SETTLE_ACTIONS = ['Send payment link', 'Record cash payment', 'Waive deposit'];

beforeEach(() => {
  mockDeposit.mockClear();
  mockDeposit.mockResolvedValue({});
  onClose.mockClear();
});

describe('DepositSheet — which actions are offered', () => {
  it('offers the settle actions while a deposit is Pending', async () => {
    await render(<DepositSheet target={target({ status: 'Pending' })} onClose={onClose} />);
    for (const label of SETTLE_ACTIONS) expect(screen.getByText(label)).toBeTruthy();
  });

  it('offers them on a Failed collection too — the money is still owed', async () => {
    await render(<DepositSheet target={target({ status: 'Failed' })} onClose={onClose} />);
    for (const label of SETTLE_ACTIONS) expect(screen.getByText(label)).toBeTruthy();
  });

  it('offers none of them when no deposit was ever required', async () => {
    // The case that made this necessary. Recording cash here used to write
    // 'Paid' for £0.00; the route now refuses it, so offering the button at all
    // is offering an error.
    await render(
      <DepositSheet target={target({ status: 'Not Required', amountPence: null })} onClose={onClose} />,
    );
    for (const label of SETTLE_ACTIONS) expect(screen.queryByText(label)).toBeNull();
  });

  // One render per status: RTL's `screen` follows the last mounted tree, so
  // re-rendering inside a single test leaves the next one reading a stale one.
  it.each(['Waived', 'Refunded', 'Charged', 'Card Held'])(
    'offers none of them once the deposit is %s',
    async (status) => {
      await render(<DepositSheet target={target({ status })} onClose={onClose} />);
      for (const label of SETTLE_ACTIONS) expect(screen.queryByText(label)).toBeNull();
    },
  );

  it('offers none of them when the row carries no deposit status at all', async () => {
    await render(<DepositSheet target={target({ status: null, amountPence: null })} onClose={onClose} />);
    for (const label of SETTLE_ACTIONS) expect(screen.queryByText(label)).toBeNull();
  });

  it('still offers Refund on a Paid deposit', async () => {
    // Refund is gated separately and must not be caught by the same tightening.
    await render(<DepositSheet target={target({ status: 'Paid' })} onClose={onClose} />);
    expect(screen.getByText('Refund')).toBeTruthy();
    for (const label of SETTLE_ACTIONS) expect(screen.queryByText(label)).toBeNull();
  });

  it('does not offer Refund while the deposit is still owed', async () => {
    await render(<DepositSheet target={target({ status: 'Pending' })} onClose={onClose} />);
    expect(screen.queryByText('Refund')).toBeNull();
  });

  it('never fires a deposit action just by opening', async () => {
    await render(<DepositSheet target={target({ status: 'Not Required' })} onClose={onClose} />);
    expect(mockDeposit).not.toHaveBeenCalled();
  });
});

/** "Keep without deposit" (web deposit-handling plan DH4), beside Send payment link, Record cash and Waive. */
describe('DepositSheet: Keep without deposit', () => {
  beforeEach(() => {
    mockKeep.mockReset();
    mockKeep.mockResolvedValue({});
  });

  it('is offered on a booking waiting for its deposit, asks first, then keeps it', async () => {
    await render(
      <DepositSheet
        target={target({
          bookingStatus: 'Pending',
          owedLine: 'Deposit £25.00 owed. If it is not paid by tomorrow at 09:12, the booking is cancelled.',
        })}
        onClose={onClose}
      />,
    );
    expect(
      screen.getByText('Deposit £25.00 owed. If it is not paid by tomorrow at 09:12, the booking is cancelled.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText('Keep without deposit'));
    expect(mockKeep).not.toHaveBeenCalled();
    expect(screen.getByText('Keep without the deposit?')).toBeTruthy();
    expect(
      screen.getByText(
        'The booking stays booked even if the deposit is not paid. Alex Rivera is sent a confirmation that says the £25.00 deposit is still due, with the payment link.',
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText('Keep booking'));
    expect(mockKeep).toHaveBeenCalledWith({ bookingId: 'bk-1' });
    expect(onClose).toHaveBeenCalled();
  });

  it('says payment for a full payment', async () => {
    await render(<DepositSheet target={target({ bookingStatus: 'Pending', paidInFull: true })} onClose={onClose} />);
    expect(screen.getByText('Keep without payment')).toBeTruthy();
    expect(screen.getByText('Waive payment')).toBeTruthy();
  });

  it('is not offered once the booking is booked', async () => {
    await render(<DepositSheet target={target({ bookingStatus: 'Booked' })} onClose={onClose} />);
    expect(screen.queryByText('Keep without deposit')).toBeNull();
  });

  it('is not offered on a part of a visit across businesses', async () => {
    await render(<DepositSheet target={target({ bookingStatus: 'Pending', linkedVisitId: 'v1' })} onClose={onClose} />);
    expect(screen.queryByText('Keep without deposit')).toBeNull();
  });
});

describe('DepositSheet: Record cash asks before it records (web QA PAY-A-F8)', () => {
  it('needs a second tap that names the amount, and records nothing on the first', async () => {
    await render(<DepositSheet target={target({ status: 'Pending', amountPence: 1000 })} onClose={onClose} />);
    await fireEvent.press(screen.getByText('Record cash payment'));
    expect(mockDeposit).not.toHaveBeenCalled();
    expect(screen.getByText('Tap to confirm £10.00 cash')).toBeTruthy();
    expect(
      screen.getByText(
        'This records £10.00 as paid in cash by Alex Rivera. If the booking was waiting for it, the booking is confirmed and they get their confirmation.',
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText('Tap to confirm £10.00 cash'));
    expect(mockDeposit).toHaveBeenCalledWith({ action: 'record_cash' });
  });
});

describe('DepositSheet: the Card actions (card-on-file-plan §6.3)', () => {
  const NOW = new Date('2026-07-10T12:00:00Z');
  const baseHold = {
    fee_pence: 1000,
    saved: false,
    charged_pence: null,
    charged_at: null,
    released_at: null,
    charge_failure_code: null,
    charge_window_ends_at: '2026-07-20T12:00:00Z',
  };
  const waiting = resolveCardHoldUiState(
    { status: 'Booked', deposit_status: 'Pending' },
    { ...baseHold, state: 'awaiting', source: 'awaiting' },
    { isAdmin: true, now: NOW },
  );
  const notNeeded = resolveCardHoldUiState(
    { status: 'Booked', deposit_status: 'Waived' },
    { ...baseHold, state: 'not_needed', request_waived_at: '2026-07-09T10:00:00Z' },
    { isAdmin: true, now: NOW },
  );
  const noShow = resolveCardHoldUiState(
    { status: 'No-Show', deposit_status: 'Card Held' },
    { ...baseHold, saved: true, state: 'held', source: 'card_on_file' },
    { isAdmin: true, now: NOW },
  );
  const onAddCard = jest.fn();

  beforeEach(() => {
    mockSendRequests.mockReset();
    mockConfirmWithout.mockReset();
    mockUndo.mockReset();
    onAddCard.mockReset();
    mockPanelUnavailable.current = false;
  });

  it('Waiting for card offers the three actions, and none of the deposit ones', async () => {
    await render(
      <DepositSheet target={target({ cardHold: waiting, canAddCard: true })} onClose={onClose} onAddCard={onAddCard} />,
    );
    expect(screen.getByText('Waiting for card')).toBeTruthy();
    expect(screen.getByText('Send card request')).toBeTruthy();
    expect(screen.getByText('Add card now')).toBeTruthy();
    expect(screen.getByText('Confirm without a card')).toBeTruthy();
    for (const label of SETTLE_ACTIONS) expect(screen.queryByText(label)).toBeNull();
    await fireEvent.press(screen.getByText('Add card now'));
    expect(onAddCard).toHaveBeenCalled();
  });

  it('hides Add card now without a client record of ours', async () => {
    await render(<DepositSheet target={target({ cardHold: waiting })} onClose={onClose} onAddCard={onAddCard} />);
    expect(screen.queryByText('Add card now')).toBeNull();
  });

  it('Card not needed offers Send card request only', async () => {
    await render(<DepositSheet target={target({ cardHold: notNeeded })} onClose={onClose} />);
    expect(screen.getByText('Card not needed')).toBeTruthy();
    expect(screen.getByText('Send card request')).toBeTruthy();
    expect(screen.queryByText('Confirm without a card')).toBeNull();
  });

  it('sends the card request for this booking and shows the server words', async () => {
    mockSendRequests.mockResolvedValue({ message: '1 client: 1 email and 1 text.' });
    await render(<DepositSheet target={target({ cardHold: notNeeded })} onClose={onClose} />);
    await fireEvent.press(screen.getByText('Send card request'));
    expect(mockSendRequests).toHaveBeenCalledWith({ bookingIds: ['bk-1'] });
    expect(screen.getByText('1 client: 1 email and 1 text.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('falls back to the deposit route on an older server', async () => {
    mockSendRequests.mockRejectedValue(new ApiError('Not found', 404, '<html>'));
    await render(<DepositSheet target={target({ cardHold: waiting })} onClose={onClose} />);
    await fireEvent.press(screen.getByText('Send card request'));
    expect(mockDeposit).toHaveBeenCalledWith({ action: 'send_payment_link' });
  });

  it('asks before confirming without a card, then offers Undo', async () => {
    mockConfirmWithout.mockResolvedValue({
      changed: 1,
      bookingIds: ['bk-1'],
      unitExtra: 0,
      skipped: [],
      actionIds: ['act-1'],
      undoUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      message: '1 booking confirmed without a card.',
    });
    mockUndo.mockResolvedValue({ restored: 1, kept: 0 });
    await render(<DepositSheet target={target({ cardHold: waiting })} onClose={onClose} />);
    await fireEvent.press(screen.getByText('Confirm without a card'));
    expect(mockConfirmWithout).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'They stay booked, reminders stop, and none will be cancelled for a missing card. Clients can still add a card before their appointment.',
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText('Confirm 1 booking'));
    expect(mockConfirmWithout).toHaveBeenCalledWith({ bookingIds: ['bk-1'] });
    expect(screen.getByText('1 booking confirmed without a card.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Undo'));
    expect(mockUndo).toHaveBeenCalledWith(['act-1']);
    expect(screen.getByText('Undone. The booking is waiting for a card again.')).toBeTruthy();
    expect(screen.queryByText('Undo')).toBeNull();
  });

  it('says so when Undo kept the booking because a card was added meanwhile (2026-11-19)', async () => {
    mockConfirmWithout.mockResolvedValue({
      changed: 1,
      bookingIds: ['bk-1'],
      unitExtra: 0,
      skipped: [],
      actionIds: ['act-1'],
      undoUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      message: '1 booking confirmed without a card.',
    });
    mockUndo.mockResolvedValue({ restored: 0, kept: 1 });
    await render(<DepositSheet target={target({ cardHold: waiting })} onClose={onClose} />);
    await fireEvent.press(screen.getByText('Confirm without a card'));
    await fireEvent.press(screen.getByText('Confirm 1 booking'));
    await fireEvent.press(screen.getByText('Undo'));
    expect(
      screen.getByText(
        'This could not be undone because a card was added since. The booking stays confirmed and the card protects it.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Undone. The booking is waiting for a card again.')).toBeNull();
  });

  it('confirms with Waive on an older server', async () => {
    mockConfirmWithout.mockRejectedValue(new ApiError('Not found', 404, undefined));
    await render(<DepositSheet target={target({ cardHold: waiting })} onClose={onClose} />);
    await fireEvent.press(screen.getByText('Confirm without a card'));
    await fireEvent.press(screen.getByText('Confirm 1 booking'));
    expect(mockDeposit).toHaveBeenCalledWith({ action: 'waive' });
  });

  it('opens the visit charge for a no-show', async () => {
    await render(<DepositSheet target={target({ cardHold: noShow, visitId: 'visit-9' })} onClose={onClose} />);
    await fireEvent.press(screen.getByText('Charge no-show fees'));
    expect(screen.getByText('charge panel for visit-9')).toBeTruthy();
  });

  it('falls back to the single-booking charge when the visit route is missing', async () => {
    mockPanelUnavailable.current = true;
    await render(<DepositSheet target={target({ cardHold: noShow })} onClose={onClose} />);
    await fireEvent.press(screen.getByText('Charge no-show fees'));
    expect(screen.getByText('Charge £10.00')).toBeTruthy();
    await fireEvent.press(screen.getByText('Charge £10.00'));
    expect(mockDeposit).toHaveBeenCalledWith({ action: 'charge_no_show_fee', amount_pence: 1000 });
  });
});
