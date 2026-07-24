/**
 * TakePaymentSheet (Tap to Pay design doc §7.8 / §11 mobile tests):
 *  - the unknown-price path REQUIRES a staff-entered amount before anything
 *    can be collected (§5.7 / flow §8-G),
 *  - cash recording posts the right charge-route body,
 *  - the card option only exists when the venue is card-present ready,
 *  - refunds are admin-only and list only succeeded ledger rows.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

// Render Sheet children inline when visible (avoids gesture-handler/Modal).
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockRecord = jest.fn(async () => ({ success: true }));
const mockRefund = jest.fn(async () => ({ success: true }));
const mockTakePayment = jest.fn(async () => ({ amountPence: 2500 }));
jest.mock('@/lib/queries/useTakePayment', () => ({
  useRecordExternalPayment: () => ({ mutateAsync: mockRecord, isPending: false }),
  useRefundPayment: () => ({ mutateAsync: mockRefund, isPending: false }),
  useTakePayment: () => ({ mutateAsync: mockTakePayment, isPending: false }),
}));

// The Terminal SDK is present in these tests unless a case says otherwise.
let mockSdkAvailable = true;
jest.mock('@/lib/payments/terminal-sdk', () => ({
  isTerminalSdkAvailable: () => mockSdkAvailable,
  getTerminalSdk: () => ({ useStripeTerminal: () => ({}) }),
  terminalErrorMessage: (_e: unknown, f: string) => f,
}));

jest.mock('@/lib/payments/last-method', () => ({
  loadLastMethod: jest.fn(async () => null),
  rememberLastMethod: jest.fn(),
}));

jest.mock('@/lib/payments/terminal', () => ({
  useTapToPayReader: () => ({
    status: 'idle',
    error: null,
    supported: true,
    connect: jest.fn(async () => true),
    checkSupport: jest.fn(async () => true),
    reset: jest.fn(),
  }),
}));

jest.mock('@/lib/payments/bluetoothReader', () => ({
  useBluetoothReader: () => ({
    status: 'idle',
    error: null,
    discovered: [],
    connected: null,
    batteryLevel: null,
    batteryLow: false,
    updateProgress: null,
    scan: jest.fn(async () => undefined),
    connect: jest.fn(async () => true),
    reconnectRemembered: jest.fn(async () => false),
    forget: jest.fn(async () => undefined),
    reset: jest.fn(),
  }),
}));

import { TakePaymentSheet, type TakePaymentTarget } from '@/components/bookings/TakePaymentSheet';

function target(over: Partial<TakePaymentTarget> = {}): TakePaymentTarget {
  return {
    id: 'bk-1',
    guestName: 'Ada Lovelace',
    balanceDuePence: 2500,
    isAdmin: false,
    payments: [],
    cardPresentReady: true,
    ...over,
  };
}

async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
}

beforeEach(() => {
  mockSdkAvailable = true;
  mockRecord.mockClear();
  mockRefund.mockClear();
  mockTakePayment.mockClear();
});

describe('known balance', () => {
  it('shows the amount due and offers card + cash', async () => {
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    expect(screen.getByText('£25.00 due')).toBeTruthy();
    expect(screen.getByText('Card payment')).toBeTruthy();
    expect(screen.getByText('Record cash')).toBeTruthy();
  });

  it('records cash with the pre-filled balance', async () => {
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Record cash');
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'cash', amountPence: 2500 }),
    );
  });

  it('shows a success screen and hides the now-stale balance', async () => {
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Record cash');

    expect(screen.getByText('£25.00 collected')).toBeTruthy();
    // The header balance is a snapshot from when the sheet opened; showing it
    // after collecting would tell staff money is still owed.
    expect(screen.queryByText('£25.00 due')).toBeNull();
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('does not promise a receipt for cash (only the card path emails one)', async () => {
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Record cash');
    expect(screen.queryByText(/receipt has been emailed/i)).toBeNull();
  });
});

describe('unknown balance (§5.7 / flow G)', () => {
  it('prompts for an amount and blocks collection until one is entered', async () => {
    await render(
      <TakePaymentSheet target={target({ balanceDuePence: null })} onClose={jest.fn()} />,
    );
    expect(screen.getByText('Enter the amount')).toBeTruthy();

    // No amount yet: pressing cash must not post anything.
    await press('Record cash');
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('allows collection once staff enter an amount', async () => {
    await render(
      <TakePaymentSheet target={target({ balanceDuePence: null })} onClose={jest.fn()} />,
    );
    await act(async () => {
      fireEvent.changeText(screen.getByDisplayValue(''), '18.50');
    });
    await press('Record cash');
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'cash', amountPence: 1850 }),
    );
  });
});

describe('card availability', () => {
  it('hides the card option when the venue is not card-present ready', async () => {
    await render(
      <TakePaymentSheet target={target({ cardPresentReady: false })} onClose={jest.fn()} />,
    );
    expect(screen.queryByText('Card payment')).toBeNull();
    // Cash still works, so the sheet is never a dead end.
    expect(screen.getByText('Record cash')).toBeTruthy();
  });

  it('hides the card option when the Terminal SDK is missing from this build', async () => {
    mockSdkAvailable = false;
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    expect(screen.queryByText('Card payment')).toBeNull();
  });
});

describe('refunds', () => {
  const paid = {
    id: 'pay-1',
    method: 'card_present' as const,
    status: 'succeeded' as const,
    amount_pence: 2500,
    note: null,
    created_at: '2026-07-23T10:00:00Z',
  };

  it('is hidden for non-admins', async () => {
    await render(
      <TakePaymentSheet target={target({ payments: [paid] })} onClose={jest.fn()} />,
    );
    expect(screen.queryByText('Refund a payment')).toBeNull();
  });

  it('lists succeeded rows for admins and needs a second tap to confirm', async () => {
    await render(
      <TakePaymentSheet
        target={target({ isAdmin: true, payments: [paid] })}
        onClose={jest.fn()}
      />,
    );
    await press('Refund a payment');

    await press('Refund £25.00 · Card');
    expect(mockRefund).not.toHaveBeenCalled(); // armed only

    await press('Tap to confirm refund');
    expect(mockRefund).toHaveBeenCalledWith({ paymentId: 'pay-1' });
    expect(screen.getByText('Refund issued')).toBeTruthy();
  });

  it('offers nothing to refund when no row succeeded', async () => {
    await render(
      <TakePaymentSheet
        target={target({ isAdmin: true, payments: [{ ...paid, status: 'pending' }] })}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByText('Refund a payment')).toBeNull();
  });
});
