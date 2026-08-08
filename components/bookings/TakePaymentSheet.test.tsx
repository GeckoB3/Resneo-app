/**
 * TakePaymentSheet (Tap to Pay design doc §7.8 / §11 mobile tests):
 *  - the unknown-price path REQUIRES a staff-entered amount before anything
 *    can be collected (§5.7 / flow §8-G),
 *  - cash recording posts the right charge-route body, behind a confirm step,
 *  - no money action can be committed at an amount the route would clamp or
 *    reject,
 *  - the card option only exists when the venue is card-present ready, the
 *    native SDK is in the build, AND the build carries a Stripe publishable key,
 *  - refunds are admin-only and list only succeeded ledger rows.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

/**
 * A real build that can take cards has this set; without it `TerminalProvider`
 * never mounts. Set here so the card cases below exercise a build that CAN pay,
 * and cleared explicitly in the one case that asserts the opposite.
 */
const ORIGINAL_STRIPE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
beforeEach(() => {
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_fixture';
});
afterEach(() => {
  if (ORIGINAL_STRIPE_KEY === undefined) delete process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  else process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = ORIGINAL_STRIPE_KEY;
});

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
const takePaymentDefault = async (_input: {
  attemptId: string;
  amountPence?: number;
  readerType?: string;
}) => ({ amountPence: 2500 });
const mockTakePayment = jest.fn(takePaymentDefault);
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

/**
 * Whether the BUILD may use the phone's own NFC. Jest runs as iOS, where this is
 * currently false (no Apple entitlement — see tap-to-pay-build-support.ts), which
 * would hide the Tap to Pay button and gut this suite. Tap to Pay is still live
 * on Android, so it defaults to true here and each case can opt out.
 */
let mockBuildSupportsTapToPay = true;
jest.mock('@/lib/payments/tap-to-pay-build-support', () => ({
  buildSupportsTapToPay: () => mockBuildSupportsTapToPay,
  TAP_TO_PAY_IOS_ENABLED: false,
}));

const mockTapConnect = jest.fn(
  async (): Promise<{ ok: boolean; error: string | null }> => ({ ok: true, error: null }),
);
const mockTapAbort = jest.fn(async () => undefined);
// Named rather than inline so cases can assert the build gate stopped the call.
const mockCheckSupport = jest.fn(async () => true);
jest.mock('@/lib/payments/terminal', () => ({
  useTapToPayReader: () => ({
    status: 'idle',
    error: null,
    supported: true,
    connect: mockTapConnect,
    checkSupport: mockCheckSupport,
    abort: mockTapAbort,
    reset: jest.fn(),
  }),
}));

const mockBtState = {
  connected: null as { serialNumber: string } | null,
  status: 'idle' as string,
  /**
   * Readers the pairing step should list. This was hard-coded empty, so the
   * reader rows, their per-row progress and the connect handler were never
   * rendered by any test — the whole pairing screen was uncovered.
   */
  discovered: [] as { serialNumber: string; label?: string }[],
};
/**
 * Mirrors the real hook: a successful connect becomes the CONNECTED reader.
 * Without this the mock left `connected` null, so the collect step that pairing
 * hands over to decided no reader was attached and bounced straight back to
 * pairing — a loop the real app does not have.
 */
const btConnectDefault = async (reader: { serialNumber: string }) => {
  mockBtState.connected = { serialNumber: reader.serialNumber };
  return true;
};
const mockBtConnect = jest.fn(btConnectDefault);
const mockBtScan = jest.fn(async () => undefined);
const mockBtReconnect = jest.fn(async () => false);
const mockBtAbort = jest.fn(async () => undefined);
jest.mock('@/lib/payments/bluetoothReader', () => ({
  useBluetoothReader: () => ({
    status: mockBtState.status,
    error: null,
    discovered: mockBtState.discovered,
    connected: mockBtState.connected,
    batteryLevel: null,
    batteryLow: false,
    updateProgress: null,
    scan: mockBtScan,
    connect: mockBtConnect,
    reconnectRemembered: mockBtReconnect,
    forget: jest.fn(async () => undefined),
    abort: mockBtAbort,
    reset: jest.fn(),
  }),
}));

import { TakePaymentSheet, type TakePaymentTarget } from '@/components/bookings/TakePaymentSheet';
import {
  recordFailedCardAttempt,
  __resetFailedCardAttemptsForTests,
} from '@/lib/payments/failed-attempts';

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

/**
 * Two taps in one frame, before any re-render can disable the button, so the
 * ref guard under test is the only thing standing between them.
 *
 * The presses must share one `act` scope: released between them, RTL flushes
 * the re-render and `disabled` swallows the second tap, which would test
 * nothing. React logs an overlapping-act notice because `fireEvent` opens its
 * own scope inside this one; that is the cost of the shared frame.
 */
async function doublePress(label: string) {
  await act(async () => {
    const button = screen.getByText(label);
    fireEvent.press(button);
    fireEvent.press(button);
  });
}

/** Retype the amount field, addressed by what it currently holds. */
async function retypeAmount(from: string, to: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByDisplayValue(from), to);
  });
}

beforeEach(() => {
  mockSdkAvailable = true;
  mockBuildSupportsTapToPay = true;
  mockCheckSupport.mockClear();
  mockRecord.mockClear();
  mockRefund.mockClear();
  // Reset, not clear: the cancel cases install a collection that never settles,
  // and `mockClear` leaves the implementation behind for every later case.
  mockTakePayment.mockReset();
  mockTakePayment.mockImplementation(takePaymentDefault);
  mockCancelCollection.mockClear();
  mockTapConnect.mockReset();
  mockTapConnect.mockResolvedValue({ ok: true, error: null });
  mockBtConnect.mockClear();
  // Restored explicitly, so a case that freezes the connect cannot leak.
  mockBtConnect.mockImplementation(btConnectDefault);
  mockBtScan.mockClear();
  mockBtReconnect.mockReset();
  mockBtReconnect.mockResolvedValue(false);
  mockBtAbort.mockClear();
  mockTapAbort.mockClear();
  mockBtState.connected = null;
  mockBtState.status = 'idle';
  mockBtState.discovered = [];
  // The known-failure store is module-level and survives renders by design.
  __resetFailedCardAttemptsForTests();
});

describe('known balance', () => {
  it('shows the amount due and offers card + cash', async () => {
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    expect(screen.getByText('£25.00 due')).toBeTruthy();
    expect(screen.getByText('Card payment')).toBeTruthy();
    expect(screen.getByText('Record cash')).toBeTruthy();
  });

  it('records cash with the pre-filled balance, behind a confirm step', async () => {
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Record cash');
    // Every other money action has a step; a mis-tap here used to write a
    // ledger row that only an admin could reverse.
    expect(mockRecord).not.toHaveBeenCalled();
    expect(screen.getByText('Record £25.00 taken in cash?')).toBeTruthy();

    await press('Record £25.00 cash');
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'cash', amountPence: 2500 }),
    );
  });

  it('writes one ledger row when the cash confirm is double-tapped', async () => {
    // `busy` comes from mutation state that has not re-rendered yet, and unlike
    // the card path the charge route has NO idempotency for cash: it inserts
    // unconditionally, so a second tap records the money twice and only an
    // admin can reverse it.
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Record cash');
    await doublePress('Record £25.00 cash');

    expect(mockRecord).toHaveBeenCalledTimes(1);
  });

  it('backs out of the cash confirm without recording anything', async () => {
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Record cash');
    await press('Back');
    expect(mockRecord).not.toHaveBeenCalled();
    expect(screen.getByText('Card payment')).toBeTruthy();
  });

  it('shows a success screen and hides the now-stale balance', async () => {
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Record cash');
    await press('Record £25.00 cash');

    expect(screen.getByText('£25.00 collected')).toBeTruthy();
    // The header balance is a snapshot from when the sheet opened; showing it
    // after collecting would tell staff money is still owed.
    expect(screen.queryByText('£25.00 due')).toBeNull();
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('does not promise a receipt for cash (only the card path emails one)', async () => {
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Record cash');
    await press('Record £25.00 cash');
    expect(screen.queryByText(/receipt has been emailed/i)).toBeNull();
  });

  it('says what is left after a part payment', async () => {
    // "£10.00 collected" alone reads as done, with £15 still owed.
    await render(<TakePaymentSheet target={target({ balanceDuePence: 2500 })} onClose={jest.fn()} />);
    await retypeAmount('25.00', '10');
    await press('Record cash');
    await press('Record £10.00 cash');

    expect(screen.getByText('£10.00 collected')).toBeTruthy();
    expect(screen.getByText('£15.00 is still outstanding.')).toBeTruthy();
  });

  it('says nothing about a remaining balance when the payment settled it', async () => {
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Record cash');
    await press('Record £25.00 cash');
    expect(screen.queryByText(/still outstanding/)).toBeNull();
  });
});

describe('over-entry (the route silently clamps to the balance)', () => {
  it('blocks a cash amount larger than the balance, and says why', async () => {
    // charge/route.ts clamps with Math.min(...), so £100 against a £25 balance
    // records £25 while the till holds £100.
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await retypeAmount('25.00', '100');

    expect(
      screen.getByText('That is more than the £25.00 outstanding. Enter £25.00 or less.'),
    ).toBeTruthy();
    await press('Record cash');
    expect(screen.queryByText(/taken in cash\?/)).toBeNull();
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('blocks the card path on the same over-entry', async () => {
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await retypeAmount('25.00', '100');
    await press('Card payment');
    expect(screen.queryByText('Tap to Pay on this phone')).toBeNull();
    expect(mockTakePayment).not.toHaveBeenCalled();
  });

  it('explains the £1,000 cap instead of letting the route 400 "Invalid request"', async () => {
    // An unknown-price appointment is exactly where staff must type an amount,
    // and a £1,200 package is plausible there.
    await render(
      <TakePaymentSheet target={target({ balanceDuePence: null })} onClose={jest.fn()} />,
    );
    await retypeAmount('', '1200');
    expect(
      screen.getByText(
        'The most you can take in one payment is £1,000.00. Take the rest as a second payment.',
      ),
    ).toBeTruthy();
    await press('Record cash');
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('still takes a genuine over-cap balance in full', async () => {
    // Omitting amount_pence bypasses the schema cap: the server charges the
    // balance it resolved itself.
    await render(<TakePaymentSheet target={target({ balanceDuePence: 120_000 })} onClose={jest.fn()} />);
    await press('Record cash');
    await press('Record £1,200.00 cash');
    // No amount_pence at all: supplying £1,200 would fail the route's schema.
    expect(mockRecord).toHaveBeenCalledWith({ method: 'cash' });
  });
});

describe('a balance that moves while the sheet is open', () => {
  it('follows a balance that moves while the sheet is open', async () => {
    // A deposit landing mid-sheet must not leave the header and the field
    // disagreeing about what is owed.
    const { rerender } = await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await rerender(
      <TakePaymentSheet target={target({ balanceDuePence: 1000 })} onClose={jest.fn()} />,
    );

    expect(screen.getByText('£10.00 due')).toBeTruthy();
    expect(screen.getByDisplayValue('10.00')).toBeTruthy();
  });

  it('leaves an amount the staff member typed alone', async () => {
    const { rerender } = await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await retypeAmount('25.00', '5.00');
    await rerender(
      <TakePaymentSheet target={target({ balanceDuePence: 1000 })} onClose={jest.fn()} />,
    );

    expect(screen.getByText('£10.00 due')).toBeTruthy();
    expect(screen.getByDisplayValue('5.00')).toBeTruthy();
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
    await press('Record £90.00 cash');
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
    await retypeAmount('', '18.50');
    await press('Record cash');
    await press('Record £18.50 cash');
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

  /**
   * The build-configuration case, found in a go-live check: the production EAS
   * profile carried no publishable key, so `TerminalProvider` would render its
   * children bare and every card collect would die on "Could not start the card
   * reader" — a config problem dressed as a hardware fault. The option must not
   * be offered when the build cannot honour it.
   */
  it('hides the card option when the build carries no Stripe publishable key', async () => {
    delete process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    expect(screen.queryByText('Card payment')).toBeNull();
    // Cash and the rest of the sheet still work — only the card channel goes.
    expect(screen.getByText('Record cash')).toBeTruthy();
  });
});

describe('a build with no Tap to Pay entitlement (iOS, pending Apple)', () => {
  it('hides Tap to Pay but keeps the Bluetooth reader path', async () => {
    mockBuildSupportsTapToPay = false;
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');

    expect(screen.queryByText('Tap to Pay on this phone')).toBeNull();
    expect(screen.getByText('Connect a card reader')).toBeTruthy();
  });

  it('still collects through a connected reader', async () => {
    mockBuildSupportsTapToPay = false;
    mockBtState.connected = { serialNumber: 'WP-1' };
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    await press('Use card reader');

    expect(mockTakePayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountPence: 2500, readerType: 'bluetooth' }),
    );
  });

  it('never asks the SDK about a reader the build cannot use', async () => {
    // The native call is pointless without the entitlement and is a needless
    // place to throw on a build that is not allowed to try.
    mockBuildSupportsTapToPay = false;
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    expect(mockCheckSupport).not.toHaveBeenCalled();
  });

  it('does ask when the build IS allowed (Android today)', async () => {
    mockBuildSupportsTapToPay = true;
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    expect(mockCheckSupport).toHaveBeenCalled();
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

  it('shows the amount being charged on the card and pairing steps', async () => {
    // The card step used to keep showing the full balance while a part payment
    // was taken: "£90.00 due" on screen while £20 left the client's card.
    await render(<TakePaymentSheet target={target({ balanceDuePence: 9000 })} onClose={jest.fn()} />);
    await retypeAmount('90.00', '20');
    await press('Card payment');

    expect(screen.getByText('Charging £20.00')).toBeTruthy();
    expect(screen.getByText('Part of the £90.00 outstanding.')).toBeTruthy();
    expect(screen.queryByText('£90.00 due')).toBeNull();

    await press('Connect a card reader');
    expect(screen.getByText('Charging £20.00')).toBeTruthy();
  });

  it('shows the full balance as the charge when the field is left as seeded', async () => {
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    expect(screen.getByText('Charging £25.00')).toBeTruthy();
    expect(screen.queryByText(/Part of the/)).toBeNull();
  });

  it('fires one PaymentIntent when the collect button is double-tapped', async () => {
    // `busy` comes from state that has not re-rendered yet, so two taps in one
    // frame both pass the guard: two attempt ids, two PaymentIntents, and an
    // orphan pending row behind the "SDK is busy" failure.
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    await doublePress('Tap to Pay on this phone');

    expect(mockTakePayment).toHaveBeenCalledTimes(1);
  });

  it('re-arms after a failed attempt so Retry still works', async () => {
    // The double-tap guard must be released on the early-return paths too.
    mockTapConnect.mockResolvedValueOnce({ ok: false, error: 'The reader is unavailable.' });
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    await press('Tap to Pay on this phone');
    await press('Retry');

    expect(mockTakePayment).toHaveBeenCalledTimes(1);
  });
});

describe('a card payment still settling', () => {
  /**
   * The row's AGE decides how loud the sheet is, so the fixture is built from the
   * clock rather than a fixed date: a hard-coded timestamp silently became "stuck"
   * as soon as it aged past the five-minute window, which is exactly the
   * distinction under test here.
   */
  const pendingRow = {
    id: 'pay-pending',
    method: 'card_present' as const,
    status: 'pending' as const,
    amount_pence: 2500,
    note: null,
    created_at: new Date(Date.now() - 5_000).toISOString(),
  };

  it('warns before starting a second collection, instead of opening the menu', async () => {
    await render(
      <TakePaymentSheet target={target({ payments: [pendingRow] })} onClose={jest.fn()} />,
    );

    expect(screen.getByText(/A card payment of £25.00 is still going through/)).toBeTruthy();
    // The collect options must not be one tap away while money is in flight.
    expect(screen.queryByText('Card payment')).toBeNull();
    expect(screen.queryByText('Record cash')).toBeNull();
  });

  it('points staff at the Stripe dashboard for a payment that stays stuck', async () => {
    await render(
      <TakePaymentSheet target={target({ payments: [pendingRow] })} onClose={jest.fn()} />,
    );
    expect(screen.getByText(/check the payment in your Stripe dashboard/)).toBeTruthy();
  });

  it('still lets staff through deliberately', async () => {
    await render(
      <TakePaymentSheet target={target({ payments: [pendingRow] })} onClose={jest.fn()} />,
    );
    await press('Take another payment anyway');
    expect(screen.getByText('Card payment')).toBeTruthy();
  });

  it('opens straight on the menu when nothing is in flight', async () => {
    await render(
      <TakePaymentSheet
        target={target({ payments: [{ ...pendingRow, status: 'succeeded' }] })}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText('Card payment')).toBeTruthy();
    expect(screen.queryByText(/still going through/)).toBeNull();
  });

  it('warns when a row appears while staff are already on the menu', async () => {
    // The backend writes the pending row at PaymentIntent-create time, so one
    // can turn up mid-sheet: a colleague collecting on another device, or this
    // device's own confirm failing after Stripe captured. Reading the ledger
    // only at open would leave every commit button armed with no warning.
    const { rerender } = await render(
      <TakePaymentSheet target={target()} onClose={jest.fn()} />,
    );
    expect(screen.queryByText(/still going through/)).toBeNull();

    await rerender(
      <TakePaymentSheet target={target({ payments: [pendingRow] })} onClose={jest.fn()} />,
    );
    expect(screen.getByText(/A card payment of £25.00 is still going through/)).toBeTruthy();
    // Staff are not yanked out of the step they are on, so the menu stays.
    expect(screen.getByText('Card payment')).toBeTruthy();
  });

  it('warns above Retry after a collection that failed on the confirm step', async () => {
    // Retry mints a second PaymentIntent, and this is the case where the first
    // one may already have taken the money.
    mockTapConnect.mockResolvedValue({ ok: false, error: 'The payment was not completed.' });
    const { rerender } = await render(
      <TakePaymentSheet target={target()} onClose={jest.fn()} />,
    );
    await press('Card payment');
    await press('Tap to Pay on this phone');
    expect(screen.getByText('Retry')).toBeTruthy();

    await rerender(
      <TakePaymentSheet target={target({ payments: [pendingRow] })} onClose={jest.fn()} />,
    );
    expect(screen.getByText(/A card payment of £25.00 is still going through/)).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });
});

describe('a pending row the sheet must NOT block on', () => {
  const rowAt = (createdAtMs: number) => ({
    id: 'pay-pending',
    method: 'card_present' as const,
    status: 'pending' as const,
    amount_pence: 2500,
    note: null,
    created_at: new Date(createdAtMs).toISOString(),
  });

  it('does not hard-gate a row whose webhook is clearly never coming', async () => {
    /**
     * The bug: nothing in the app can settle a stuck `pending` row, so gating on
     * one for ever left the venue unable to take money at all. Past the settlement
     * window the sheet opens on the menu and the row becomes information.
     */
    await render(
      <TakePaymentSheet
        target={target({ payments: [rowAt(Date.now() - 10 * 60_000)] })}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Card payment')).toBeTruthy();
    expect(screen.getByText('Record cash')).toBeTruthy();
    expect(screen.queryByText('Take another payment anyway')).toBeNull();
    expect(screen.queryByText(/is still going through/)).toBeNull();
  });

  it('tells staff where to find out whether a stuck payment went through', async () => {
    await render(
      <TakePaymentSheet
        target={target({ payments: [rowAt(Date.now() - 10 * 60_000)] })}
        onClose={jest.fn()}
      />,
    );

    expect(
      screen.getByText(/A card payment of £25.00 started a while ago/),
    ).toBeTruthy();
    // Both places that can actually answer the question, in plain words.
    expect(screen.getByText(/Check the payment history on this booking/)).toBeTruthy();
    expect(screen.getByText(/Stripe dashboard/)).toBeTruthy();
    expect(screen.getByText(/Cash and other payments are not affected/)).toBeTruthy();
  });

  it('says nothing at all about a payment this client watched decline', async () => {
    /**
     * The reported bug: a declined tap, then close and reopen, and the sheet
     * warned "a card payment is still going through" for minutes — because only
     * the `payment_intent.payment_failed` webhook can move the row off `pending`,
     * and in dev it may never arrive. The client saw the decline; it must not
     * warn staff about it.
     */
    const startedAtMs = Date.now() - 20_000;
    recordFailedCardAttempt({
      bookingId: 'bk-1',
      paymentIntentId: 'pi_declined',
      amountPence: 2500,
      startedAtMs,
      failedAtMs: startedAtMs + 8_000,
    });

    await render(
      <TakePaymentSheet
        target={target({ payments: [{ ...rowAt(startedAtMs + 1_000), booking_id: 'bk-1' }] })}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Card payment')).toBeTruthy();
    expect(screen.queryByText(/is still going through/)).toBeNull();
    expect(screen.queryByText(/started a while ago/)).toBeNull();
  });

  it('still warns about a DIFFERENT payment while a decline is on record', async () => {
    // Suppression is per attempt, not a blanket amnesty: a colleague collecting a
    // different amount on another device must still stop this staff member.
    const startedAtMs = Date.now() - 20_000;
    recordFailedCardAttempt({
      bookingId: 'bk-1',
      paymentIntentId: 'pi_declined',
      amountPence: 2500,
      startedAtMs,
      failedAtMs: startedAtMs + 8_000,
    });

    await render(
      <TakePaymentSheet
        target={target({
          payments: [{ ...rowAt(startedAtMs + 1_000), amount_pence: 1000, booking_id: 'bk-1' }],
        })}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText(/A card payment of £10.00 is still going through/)).toBeTruthy();
  });
});

describe('a reader that never gets ready (the "spins for ever" bug)', () => {
  it('keeps Cancel live while preparing, and aborts the attempt', async () => {
    /**
     * On device: "Use card reader" sat on "Getting the card reader ready" and Back
     * did nothing, because `busy` disabled every button including Back. The only
     * way out was closing the whole sheet.
     */
    let releaseConnect: ((r: { ok: boolean; error: string | null }) => void) | undefined;
    mockTapConnect.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseConnect = resolve;
        }),
    );

    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    await press('Tap to Pay on this phone');

    // Stuck in prepare, with a live way out rather than a dead Back.
    expect(screen.getByText('Getting the card reader ready.')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();

    await press('Cancel');

    // Cancelling reaches the SDK: an abandoned discovery is refused as busy on
    // the next attempt, so it has to be stopped, not just ignored.
    expect(mockTapAbort).toHaveBeenCalled();
    expect(screen.queryByText('Getting the card reader ready.')).toBeNull();
    expect(screen.getByText('Back')).toBeTruthy();
    expect(mockTakePayment).not.toHaveBeenCalled();

    // The abandoned attempt finishing late must not resurrect the payment.
    await act(async () => {
      releaseConnect?.({ ok: true, error: null });
    });
    expect(mockTakePayment).not.toHaveBeenCalled();
  });

  /**
   * Reported on device: connect a reader, land on "Hold the card to the reader",
   * change your mind — and the back button does nothing. It was `disabled` for
   * the whole `collecting` stage, and the card step renders no Close, so the only
   * exit was the sheet's grabber or backdrop: a gesture nothing signposts. Since
   * `collectPaymentMethod` waits for a card indefinitely, nothing ended the state
   * on its own either.
   */
  it('keeps Cancel live while the client is at the reader, and reaches the SDK', async () => {
    let failCollection: ((e: Error) => void) | undefined;
    mockTakePayment.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          failCollection = reject;
        }),
    );

    mockBtState.connected = { serialNumber: 'WP-1' };
    mockBtReconnect.mockResolvedValue(true);

    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    await press('Use card reader');

    expect(screen.getByText('Hold the card to the reader, or insert the chip.')).toBeTruthy();
    await press('Cancel');

    // Cancelling an abandoned collection has to reach the reader, or the next
    // attempt is refused as busy.
    expect(mockCancelCollection).toHaveBeenCalled();
    expect(screen.queryByText('Hold the card to the reader, or insert the chip.')).toBeNull();
    expect(screen.getByText('Use card reader')).toBeTruthy();

    // The cancel makes the collection throw. That is the cancel completing, not
    // a fault, so staff must not be shown a card error for what they just did.
    await act(async () => {
      failCollection?.(new Error('The card was not read.'));
    });
    expect(screen.queryByText('The card was not read.')).toBeNull();
    expect(screen.getByText('Back')).toBeTruthy();
  });

  it('still reports a payment that lands in the same breath as the Cancel', async () => {
    // Cancel races the card. If the money moved, silence would hide a real
    // payment from the person who has to account for it.
    let completeCollection: ((r: { amountPence: number }) => void) | undefined;
    mockTakePayment.mockImplementation(
      () =>
        new Promise((resolve) => {
          completeCollection = resolve;
        }),
    );

    mockBtState.connected = { serialNumber: 'WP-1' };
    mockBtReconnect.mockResolvedValue(true);

    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    await press('Use card reader');
    await press('Cancel');

    await act(async () => {
      completeCollection?.({ amountPence: 2500 });
    });
    expect(screen.getByText('£25.00 collected')).toBeTruthy();
  });

  it('lets staff retry a different channel after cancelling', async () => {
    // Cancel must release the same-frame re-entry guard, or every button is dead
    // for the rest of the sheet's life.
    let releaseConnect: (() => void) | undefined;
    mockTapConnect.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseConnect = () => resolve({ ok: false, error: 'gone' });
        }),
    );
    mockBtState.connected = { serialNumber: 'WP-1' };

    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    await press('Tap to Pay on this phone');
    await press('Cancel');
    await press('Use card reader');

    expect(mockTakePayment).toHaveBeenCalledWith(
      expect.objectContaining({ readerType: 'bluetooth' }),
    );

    await act(async () => {
      releaseConnect?.();
    });
  });

  it('keeps Cancel live while a card reader is being reconnected', async () => {
    // The reported path: `reconnectRemembered` deadlocked on a Bluetooth
    // discovery that only a connect could end, so this prepare never returned.
    let releaseReconnect: ((ok: boolean) => void) | undefined;
    mockBtReconnect.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          releaseReconnect = resolve;
        }),
    );

    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    await press('Connect a card reader');

    expect(screen.getByText('Getting the card reader ready.')).toBeTruthy();
    await press('Cancel');

    expect(mockBtAbort).toHaveBeenCalled();
    expect(screen.queryByText('Getting the card reader ready.')).toBeNull();

    await act(async () => {
      releaseReconnect?.(false);
    });
    // The cancelled attempt must not drag staff into the pairing step afterwards.
    expect(screen.queryByText('Choose your card reader.')).toBeNull();
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

describe('reader pairing', () => {
  it('lists the readers it found, by name where there is one', async () => {
    mockBtState.discovered = [
      { serialNumber: 'WPC-111', label: 'Front desk' },
      { serialNumber: 'WPC-222' },
    ];
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    await press('Connect a card reader');

    expect(screen.getByText('Choose your card reader.')).toBeTruthy();
    expect(screen.getByText('Front desk')).toBeTruthy();
    // Unlabelled reader: the serial is all staff have to go on.
    expect(screen.getByText('WPC-222')).toBeTruthy();
  });

  it('connects to the chosen reader and continues straight into collection', async () => {
    mockBtState.discovered = [{ serialNumber: 'WPC-111', label: 'Front desk' }];
    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    await press('Connect a card reader');
    await press('Front desk');

    expect(mockBtConnect).toHaveBeenCalledWith(
      expect.objectContaining({ serialNumber: 'WPC-111' }),
    );
    // Pairing hands over to collection: staff must not have to press a second
    // time, mid-payment, with the client waiting.
    expect(mockTakePayment).toHaveBeenCalledWith(
      expect.objectContaining({ readerType: 'bluetooth' }),
    );
  });

  it('shows progress on the reader being paired rather than a dead button', async () => {
    /**
     * The reported symptom: "I click one, nothing seems to happen for a few
     * seconds". `scanning` and `connecting` were one flag, so the tapped row got
     * no feedback for the whole handshake.
     */
    mockBtState.discovered = [
      { serialNumber: 'WPC-111', label: 'Front desk' },
      { serialNumber: 'WPC-222', label: 'Back room' },
    ];
    let releaseConnect: ((ok: boolean) => void) | undefined;
    mockBtConnect.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          releaseConnect = resolve;
        }),
    );

    await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    await press('Connect a card reader');
    await press('Front desk');

    // A loading Button swaps its label for a spinner, so the tapped row's label
    // is gone while the other stays readable.
    expect(screen.queryByText('Front desk')).toBeNull();
    expect(screen.getByText('Back room')).toBeTruthy();

    await act(async () => {
      releaseConnect?.(true);
    });
  });

  it('says it is connecting rather than still searching', async () => {
    mockBtState.discovered = [{ serialNumber: 'WPC-111', label: 'Front desk' }];
    const view = await render(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    await press('Card payment');
    await press('Connect a card reader');
    expect(screen.getByText('Choose your card reader.')).toBeTruthy();

    // The reader hook reports 'connecting' for the whole pairing handshake.
    mockBtState.status = 'connecting';
    await act(async () => {
      view.rerender(<TakePaymentSheet target={target()} onClose={jest.fn()} />);
    });

    expect(screen.getByText('Connecting to your reader. This takes a few seconds.')).toBeTruthy();
    expect(
      screen.queryByText('Looking for card readers nearby. Keep the reader switched on.'),
    ).toBeNull();
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

  it('opens straight on the refund list when the caller asks for it', async () => {
    // The booking detail links here directly, so staff do not have to find the
    // action behind "Take payment" / "Paid".
    await render(
      <TakePaymentSheet
        target={target({ isAdmin: true, payments: [paid], initialMode: 'refund' })}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText('Refund £25.00 · Card')).toBeTruthy();
  });

  it('still warns about a payment in flight instead of honouring initialMode', async () => {
    // The double-charge warning is a safety step; a deep link must not skip it.
    const pending = { ...paid, id: 'pay-2', status: 'pending' as const, created_at: new Date().toISOString() };
    await render(
      <TakePaymentSheet
        target={target({ isAdmin: true, payments: [paid, pending], initialMode: 'refund' })}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByText('Refund £25.00 · Card')).toBeNull();
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

    // The amount stays in the label: it is the one fact worth re-reading at the
    // moment of confirming, and the old "Tap to confirm refund" dropped it.
    await press('Tap again to refund £25.00');
    expect(mockRefund).toHaveBeenCalledWith({ paymentId: 'pay-1' });
    expect(screen.getByText('Refund issued')).toBeTruthy();
  });

  it('lets an armed refund be cancelled', async () => {
    await render(
      <TakePaymentSheet
        target={target({ isAdmin: true, payments: [paid] })}
        onClose={jest.fn()}
      />,
    );
    await press('Refund a payment');
    await press('Refund £25.00 · Card');
    await press('Cancel refund');

    expect(mockRefund).not.toHaveBeenCalled();
    expect(screen.getByText('Refund £25.00 · Card')).toBeTruthy();
    expect(screen.queryByText('Cancel refund')).toBeNull();
  });

  it('disarms itself if nobody follows through', async () => {
    // An armed refund left on the counter must not be finishable by whoever
    // picks the phone up next.
    jest.useFakeTimers();
    try {
      await render(
        <TakePaymentSheet
          target={target({ isAdmin: true, payments: [paid] })}
          onClose={jest.fn()}
        />,
      );
      await press('Refund a payment');
      await press('Refund £25.00 · Card');
      expect(screen.getByText('Tap again to refund £25.00')).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(5000);
      });
      expect(screen.getByText('Refund £25.00 · Card')).toBeTruthy();
      expect(mockRefund).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
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
    await press('Tap again to refund £25.00');
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
    // `failed` rather than `pending`: a pending row opens the sheet on the
    // in-flight warning, which would hide the refund entry for another reason.
    await render(
      <TakePaymentSheet
        target={target({ isAdmin: true, payments: [{ ...paid, status: 'failed' }] })}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByText('Refund a payment')).toBeNull();
  });
});
