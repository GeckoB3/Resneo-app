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
const mockTakePayment = jest.fn(
  async (_input: { attemptId: string; amountPence?: number; readerType?: string }) => ({
    amountPence: 2500,
  }),
);
const mockCancelCollection = jest.fn(async () => undefined);
jest.mock('@/lib/queries/useTakePayment', () => ({
  useRecordExternalPayment: () => ({ mutateAsync: mockRecord, isPending: false }),
  useRefundPayment: () => ({ mutateAsync: mockRefund, isPending: false }),
  useTakePayment: () => ({ mutateAsync: mockTakePayment, isPending: false }),
  useCancelCardCollection: () => mockCancelCollection,
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

const mockTapConnect = jest.fn(
  async (): Promise<{ ok: boolean; error: string | null }> => ({ ok: true, error: null }),
);
jest.mock('@/lib/payments/terminal', () => ({
  useTapToPayReader: () => ({
    status: 'idle',
    error: null,
    supported: true,
    connect: mockTapConnect,
    checkSupport: jest.fn(async () => true),
    reset: jest.fn(),
  }),
}));

const mockBtState = {
  connected: null as { serialNumber: string } | null,
  status: 'idle' as string,
};
const mockBtConnect = jest.fn(async () => true);
const mockBtScan = jest.fn(async () => undefined);
jest.mock('@/lib/payments/bluetoothReader', () => ({
  useBluetoothReader: () => ({
    status: mockBtState.status,
    error: null,
    discovered: [] as { serialNumber: string; label?: string }[],
    connected: mockBtState.connected,
    batteryLevel: null,
    batteryLow: false,
    updateProgress: null,
    scan: mockBtScan,
    connect: mockBtConnect,
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
  mockCancelCollection.mockClear();
  mockTapConnect.mockReset();
  mockTapConnect.mockResolvedValue({ ok: true, error: null });
  mockBtConnect.mockClear();
  mockBtScan.mockClear();
  mockBtState.connected = null;
  mockBtState.status = 'idle';
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

describe('multi-service visit (§5.7)', () => {
  const visitTarget = (count: number) =>
    target({
      // The visit balance, which is larger than the opened service's price.
      balanceDuePence: 9000,
      visitPayment: {
        booking_count: count,
        booking_ids: Array.from({ length: count }, (_, i) => `bk-${i + 1}`),
        total_pence: 9000,
        amount_paid_pence: 0,
        balance_due_pence: 9000,
      },
    });

  it('tells staff the balance covers every service in the visit', async () => {
    await render(<TakePaymentSheet target={visitTarget(2)} onClose={jest.fn()} />);
    expect(screen.getByText('£90.00 due')).toBeTruthy();
    expect(screen.getByText('Covers all 2 services in this visit')).toBeTruthy();
  });

  it('collects the whole visit balance in one payment', async () => {
    await render(<TakePaymentSheet target={visitTarget(2)} onClose={jest.fn()} />);
    await press('Record cash');
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'cash', amountPence: 9000 }),
    );
  });

  it('stays uncluttered for a standalone appointment', async () => {
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    expect(screen.queryByText(/Covers all/)).toBeNull();
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

describe('card collection', () => {
  it('collects via Tap to Pay and shows the amount collected', async () => {
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    await press('Tap to Pay on this phone');

    expect(mockTakePayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountPence: 2500, readerType: 'tap_to_pay' }),
    );
    // A fresh uuid attempt id is minted per user-initiated attempt (6.3c).
    const arg = mockTakePayment.mock.calls[0]![0];
    expect(arg.attemptId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    expect(screen.getByText('£25.00 collected')).toBeTruthy();
    expect(screen.getByText(/receipt has been emailed to Ada Lovelace/i)).toBeTruthy();
  });

  it('collects on the reader without a second tap once one is connected', async () => {
    mockBtState.connected = { serialNumber: 'WP-1' };
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    await press('Use card reader');

    expect(mockTakePayment).toHaveBeenCalledWith(
      expect.objectContaining({ readerType: 'bluetooth' }),
    );
  });

  it('sends staff to pairing when no reader is connected or remembered', async () => {
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    await press('Connect a card reader');

    // The pairing step opens and starts scanning; nothing is charged yet.
    expect(mockBtScan).toHaveBeenCalled();
    expect(mockTakePayment).not.toHaveBeenCalled();
  });
});

describe('card errors', () => {
  it('shows the reader connect failure returned by connect(), not a generic fallback', async () => {
    // Regression: the reason must travel back through the call. Reading
    // `tapToPay.error` after awaiting sees the pre-await render's value, which
    // silently downgraded specific messages to the generic fallback.
    mockTapConnect.mockResolvedValue({
      ok: false,
      error: 'Location permission is needed to take card payments.',
    });
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    await press('Tap to Pay on this phone');

    expect(
      screen.getByText('Location permission is needed to take card payments.'),
    ).toBeTruthy();
    expect(mockTakePayment).not.toHaveBeenCalled();
  });

  it('offers Retry after a failed attempt', async () => {
    mockTapConnect.mockResolvedValue({ ok: false, error: 'The reader is unavailable.' });
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    await press('Tap to Pay on this phone');
    expect(screen.getByText('Retry')).toBeTruthy();
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

  it("routes a sibling line's payment to its own booking, and labels it (§5.7)", async () => {
    // payments[] is visit-wide. Refunding a sibling's row against the opened
    // booking 409s server-side, and staff have no other clue the row belongs
    // to a different service.
    await render(
      <TakePaymentSheet
        target={target({ isAdmin: true, payments: [{ ...paid, booking_id: 'bk-2' }] })}
        onClose={jest.fn()}
      />,
    );
    await press('Refund a payment');
    expect(screen.getByText('Collected on another service in this visit')).toBeTruthy();

    await press('Refund £25.00 · Card');
    await press('Tap to confirm refund');
    expect(mockRefund).toHaveBeenCalledWith({ paymentId: 'pay-1', paymentBookingId: 'bk-2' });
  });

  it('does not label a row anchored to the booking on screen', async () => {
    await render(
      <TakePaymentSheet
        target={target({ isAdmin: true, payments: [{ ...paid, booking_id: 'bk-1' }] })}
        onClose={jest.fn()}
      />,
    );
    await press('Refund a payment');
    expect(screen.queryByText('Collected on another service in this visit')).toBeNull();
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
