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
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
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
    fireEvent.press(screen.getByText('I have handed it over'));
  });
  await act(async () => {
    fireEvent.press(screen.getByText('10% (£4.50)'));
  });
  await act(async () => {
    fireEvent.press(screen.getByText('Pay £49.50'));
  });
}

describe('CardCollectPanel with the client choosing the tip', () => {
  beforeEach(() => mockConnect.mockClear());

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
    expect(screen.getByText('Thank you. Please hand the phone back.')).toBeTruthy();
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
    await act(async () => {
      fireEvent.press(screen.getByText(/^Tap to Pay/));
    });
    expect(screen.queryByText('I have handed it over')).toBeNull();
    expect(pay).toHaveBeenLastCalledWith('tap_to_pay', expect.any(Object), 450);
    expect(screen.getByText('Thank you. Please hand the phone back.')).toBeTruthy();
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
