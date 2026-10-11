/**
 * The card screen with the client's tip (owner 2026-10-10; UX spec §3.18, §13.3): staff press Tap
 * to Pay, the reader gets ready while they still hold the phone, then they hand it over; the client
 * chooses a tip and taps straight away, the payment carries that tip, and the screen ends on "Thank
 * you. Please hand the phone back." before staff carry on. A retry after a decline keeps the tip.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' },
    venue: { name: 'Studio', logo_url: null },
  }),
}));
jest.mock('@/components/bookings/TakePaymentSheet', () => ({ ReaderPairingSection: () => null }));
jest.mock('@/components/payments/TapToPayEducation', () => ({ TapToPayEducationContent: () => null }));
jest.mock('@/components/payments/TapToPayProgress', () => ({ TapToPayProgress: () => null }));
jest.mock('@/lib/payments/terminal-sdk', () => ({
  getTerminalSdk: () => ({ useStripeTerminal: () => ({ cancelCollectPaymentMethod: jest.fn() }) }),
}));
jest.mock('@/lib/payments/tap-to-pay-build-support', () => ({ buildSupportsTapToPay: () => true }));
const mockConnect = jest.fn(async () => ({ ok: true, error: null, acceptedTerms: false }));
jest.mock('@/lib/payments/terminal', () => ({
  useTapToPayReader: () => ({ supported: true, progress: null, connect: mockConnect, checkSupport: jest.fn(async () => true), abort: jest.fn() }),
}));
jest.mock('@/providers/TapToPayProvider', () => ({
  useTapToPay: () => ({ recordConnect: jest.fn(), showEducation: jest.fn(async () => true) }),
}));
jest.mock('@/lib/payments/bluetoothReader', () => ({
  useBluetoothReader: () => ({ connected: null, status: 'idle', reconnectRemembered: jest.fn(async () => false), abort: jest.fn() }),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'tok' }));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ info: jest.fn(), success: jest.fn() }) }));
jest.mock('@/lib/haptics', () => ({ ...jest.requireActual<typeof import('@/lib/haptics')>('@/lib/haptics'), hapticSuccess: jest.fn(), hapticWarning: jest.fn() }));

import { CardCollectPanel } from '@/components/pos/SaleCardCollect';
import { __resetClientFacingForTests, isClientFacing, requestClientBack } from '@/lib/ui/client-facing';
import { SaleCardError, type SaleCardResult } from '@/lib/payments/useSaleCardPayment';
import { makeLine, makeSale } from '@/lib/pos/test-sale';

const sale = makeSale({ total_pence: 4500, balance_due_pence: 4500, lines: [makeLine({ total_pence: 4500 })] });
const tipInput = {
  sale,
  tipSettings: { tipping_enabled: true, tip_percent_presets: [10, 15, 20], smart_tip_threshold_pence: 1000, tip_base: 'total' as const },
  amountPence: 4500,
  balancePence: 4500,
  maxPaymentPence: null,
  venueName: 'Studio',
  clientName: 'Ada',
};
const paidResult: SaleCardResult = { paymentId: 'p1', amountPence: 4500, tipPence: 450, card: null, alreadyPaid: false, cardSave: null };

async function renderPanel(pay: jest.Mock) {
  const onDone = jest.fn();
  const onFacing = jest.fn();
  await render(
    <CardCollectPanel
      saleId="sale-1"
      amountPence={4500}
      customerTip={tipInput}
      onCustomerFacing={onFacing}
      isAdmin={false}
      pay={pay}
      onDone={onDone}
      onBack={jest.fn()}
    />,
  );
  return { onDone, onFacing };
}

async function chooseTenPercent() {
  await act(async () => {
    fireEvent.press(screen.getByText('Hand over'));
  });
  await act(async () => {
    fireEvent.press(screen.getByText('10%'));
  });
  await act(async () => {
    fireEvent.press(screen.getByText('Pay £49.50'));
  });
}

describe('CardCollectPanel with the client choosing the tip', () => {
  beforeEach(() => {
    mockConnect.mockClear();
    __resetClientFacingForTests();
  });

  it('readies the reader, hands over for the tip, pays with it, then asks for the phone back', async () => {
    const pay = jest.fn(async () => paidResult);
    const { onDone, onFacing } = await renderPanel(pay);
    await act(async () => {
      fireEvent.press(screen.getByText(/^Tap to Pay/));
    });
    // The reader is ready before the phone leaves staff's hands, and nothing is charged yet.
    expect(mockConnect).toHaveBeenCalled();
    expect(pay).not.toHaveBeenCalled();
    expect(screen.getByText('Hand the phone to Ada so they can choose a tip.')).toBeTruthy();
    await chooseTenPercent();
    expect(pay).toHaveBeenCalledWith('tap_to_pay', expect.any(Object), 450);
    expect(onFacing).toHaveBeenCalledWith(true);
    // Client mode: paid, with the tip, thanks by name, then staff's Done.
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(screen.getByText('Includes a £4.50 tip')).toBeTruthy();
    expect(screen.getByText('Thank you, Ada.')).toBeTruthy();
    expect(screen.getByText('Please hand the phone back.')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByText('Done'));
    });
    expect(onDone).toHaveBeenCalledWith(paidResult);
    expect(onFacing).toHaveBeenLastCalledWith(false);
  });

  it('keeps the tip when a declined card is tried again, without asking twice', async () => {
    const pay = jest
      .fn()
      .mockRejectedValueOnce(new SaleCardError('declined', 'declined', 'p1'))
      .mockResolvedValueOnce(paidResult);
    await renderPanel(pay);
    await act(async () => {
      fireEvent.press(screen.getByText(/^Tap to Pay/));
    });
    await chooseTenPercent();
    expect(pay).toHaveBeenCalledTimes(1);
    // The client still holds the phone: they see their own declined screen, not staff's.
    expect(screen.getByText('Payment declined')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Try again'));
    });
    expect(screen.queryByText('Hand over')).toBeNull();
    expect(pay).toHaveBeenLastCalledWith('tap_to_pay', expect.any(Object), 450);
    expect(screen.getByText('Paid')).toBeTruthy();
  });

  it('never offers a retry when the outcome is unsure, and hands back to staff', async () => {
    const pay = jest.fn().mockRejectedValueOnce(new SaleCardError('unsure', 'unsure', 'p1'));
    const { onFacing } = await renderPanel(pay);
    await act(async () => {
      fireEvent.press(screen.getByText(/^Tap to Pay/));
    });
    await chooseTenPercent();
    expect(screen.getByText("We're checking your payment")).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Done'));
    });
    expect(onFacing).toHaveBeenLastCalledWith(false);
    expect(screen.getByText(/^Tap to Pay/)).toBeTruthy();
  });

  it('lets staff stop from the client screen, after asking', async () => {
    const pay = jest.fn(async () => paidResult);
    const { onFacing } = await renderPanel(pay);
    await act(async () => {
      fireEvent.press(screen.getByText(/^Tap to Pay/));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Hand over'));
    });
    expect(isClientFacing()).toBe(true);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Stop the card payment, for the team'));
    });
    expect(screen.getByText('Stop this card payment?')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Keep paying'));
    });
    expect(screen.queryByText('Stop this card payment?')).toBeNull();
    // Back (Android) opens the same question instead of closing anything.
    await act(async () => {
      requestClientBack();
    });
    expect(screen.getByText('Stop this card payment?')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Stop payment'));
    });
    expect(pay).not.toHaveBeenCalled();
    expect(onFacing).toHaveBeenLastCalledWith(false);
    expect(isClientFacing()).toBe(false);
    expect(screen.getByText(/^Tap to Pay/)).toBeTruthy();
  });

  it('charges nothing when the hand-over is cancelled', async () => {
    const pay = jest.fn(async () => paidResult);
    await renderPanel(pay);
    await act(async () => {
      fireEvent.press(screen.getByText(/^Tap to Pay/));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Cancel'));
    });
    expect(pay).not.toHaveBeenCalled();
    expect(screen.getByText(/^Tap to Pay/)).toBeTruthy();
  });
});
