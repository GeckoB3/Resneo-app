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
import { render, screen } from '@testing-library/react-native';

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
}));

const mockDeposit = jest.fn();
jest.mock('@/lib/queries/useBookingMutations', () => ({
  useBookingDeposit: () => ({ mutateAsync: mockDeposit, isPending: false }),
}));

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
