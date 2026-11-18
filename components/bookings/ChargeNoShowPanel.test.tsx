/**
 * ChargeNoShowPanel (card-on-file-plan §4.10, §6.8): lines grouped by card with how the card was
 * found and the cardholder, each line lowered or left out, one charge per card, the outcome in
 * words, and an older server without the visit route.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';

import {
  ChargeNoShowPanel,
  chargeGroupHeading,
  chargeOutcomeText,
  moneyInputToPence,
} from './ChargeNoShowPanel';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/lib/haptics', () => ({ hapticSuccess: jest.fn(), hapticWarning: jest.fn(), hapticSelect: jest.fn(), hapticTap: jest.fn() }));

let mockQuery: { data?: unknown; error?: unknown; isLoading?: boolean; refetch?: () => void } = {};
const mockCharge = jest.fn();
jest.mock('@/lib/queries/useCardsOnFile', () => ({
  useNoShowCharges: () => mockQuery,
  useChargeNoShowFees: () => ({ mutateAsync: mockCharge, isPending: false }),
}));

function line(over: Record<string, unknown> = {}) {
  return {
    booking_id: 'b-1',
    hold_id: 'h-1',
    service_name: 'Cut and blow dry',
    person_label: null,
    booking_date: '2026-11-12',
    booking_time: '10:00:00',
    status: 'No-Show',
    fee_pence: 2000,
    currency: 'GBP',
    chargeable: true,
    refusal: null,
    refusal_message: null,
    ...over,
  };
}

const group = {
  key: 'cof:card-1',
  kind: 'card_on_file',
  brand: 'visa',
  last4: '4242',
  cardholder_name: 'A Smith',
  found_by: 'same_email',
  found_by_label: 'Linked by email at Sage Studio',
  total_pence: 3000,
  lines: [line(), line({ booking_id: 'b-2', hold_id: 'h-2', service_name: 'Colour', fee_pence: 1000 })],
};

const onUnavailable = jest.fn();
const onBack = jest.fn();

beforeEach(() => {
  mockCharge.mockReset();
  onUnavailable.mockReset();
  mockQuery = { data: { groups: [group], unchargeable: [] }, isLoading: false };
});

describe('ChargeNoShowPanel', () => {
  it('shows the card, the cardholder and how it was found, with one charge for the card', async () => {
    await render(<ChargeNoShowPanel visitId="v-1" bookingId="b-1" onUnavailable={onUnavailable} onBack={onBack} />);
    expect(screen.getByText('Visa ending 4242')).toBeTruthy();
    expect(screen.getByText('Cardholder: A Smith')).toBeTruthy();
    expect(screen.getByText('Linked by email at Sage Studio.')).toBeTruthy();
    expect(screen.getByText('Charge £30.00')).toBeTruthy();
  });

  it('charges the lowered amounts and leaves out a line', async () => {
    mockCharge.mockResolvedValue({
      charges: [{ key: 'cof:card-1', kind: 'card_on_file', charge_id: 'c-1', status: 'succeeded', amount_pence: 1500, currency: 'GBP', booking_ids: ['b-1'], failure_code: null, message: null, brand: 'visa', last4: '4242' }],
      skipped: [],
    });
    await render(<ChargeNoShowPanel visitId="v-1" bookingId="b-1" onUnavailable={onUnavailable} onBack={onBack} />);
    await fireEvent.changeText(screen.getByLabelText('Amount for Cut and blow dry'), '15');
    await fireEvent.press(screen.getByLabelText('Charge Colour'));
    expect(screen.getByText('Left out')).toBeTruthy();
    await fireEvent.press(screen.getByText('Charge £15.00'));
    expect(mockCharge).toHaveBeenCalledWith({ lines: [{ booking_id: 'b-1', amount_pence: 1500 }] });
    expect(screen.getByTestId('charge-outcome-cof:card-1').props.children).toBe(
      '£15.00 charged. The client has been sent a receipt.',
    );
    expect(screen.queryByText('Charge £15.00')).toBeNull();
  });

  it('refuses an amount above the fee', async () => {
    await render(<ChargeNoShowPanel visitId="v-1" bookingId="b-1" onUnavailable={onUnavailable} onBack={onBack} />);
    await fireEvent.changeText(screen.getByLabelText('Amount for Colour'), '12');
    expect(screen.getByText('Enter an amount up to £10.00.')).toBeTruthy();
  });

  it('says what the bank said when the card is declined, and keeps the charge open', async () => {
    mockCharge.mockResolvedValue({
      charges: [{ key: 'cof:card-1', kind: 'card_on_file', charge_id: null, status: 'failed', amount_pence: 3000, currency: 'GBP', booking_ids: [], failure_code: 'card_declined', message: 'The bank declined the card. Send the client a payment link instead.', brand: 'visa', last4: '4242' }],
      skipped: [],
    });
    await render(<ChargeNoShowPanel visitId="v-1" bookingId="b-1" onUnavailable={onUnavailable} onBack={onBack} />);
    await fireEvent.press(screen.getByText('Charge £30.00'));
    expect(screen.getByText('The bank declined the card. Send the client a payment link instead.')).toBeTruthy();
    expect(screen.getByText('Charge £30.00')).toBeTruthy();
  });

  it('shows why a line cannot be charged', async () => {
    mockQuery = {
      data: {
        groups: [{ ...group, lines: [line({ chargeable: false, refusal: 'hold_expired', refusal_message: 'The charge window for this booking has ended, so the fee can no longer be charged.' })] }],
        unchargeable: [line({ booking_id: 'b-3', service_name: 'Fringe trim', chargeable: false, refusal_message: 'Mark the booking as a no-show before charging the fee.' })],
      },
      isLoading: false,
    };
    await render(<ChargeNoShowPanel visitId="v-1" bookingId="b-1" onUnavailable={onUnavailable} onBack={onBack} />);
    expect(screen.getByText('The charge window for this booking has ended, so the fee can no longer be charged.')).toBeTruthy();
    expect(screen.getByText('Fringe trim: Mark the booking as a no-show before charging the fee.')).toBeTruthy();
    expect(screen.queryByText(/^Charge £/)).toBeNull();
  });

  it('hands back to the single-booking charge on an older server', async () => {
    mockQuery = { error: new ApiError('Not found', 404, '<html>'), isLoading: false };
    await render(<ChargeNoShowPanel visitId="v-1" bookingId="b-1" onUnavailable={onUnavailable} onBack={onBack} />);
    expect(onUnavailable).toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('reads amounts and words outcomes', () => {
    expect(moneyInputToPence('£12.5')).toBe(1250);
    expect(moneyInputToPence('abc')).toBeNull();
    expect(chargeGroupHeading({ kind: 'till_card', brand: null, last4: null })).toBe('Card saved at the till');
    expect(chargeGroupHeading({ kind: 'booking_customer', brand: null, last4: null })).toBe('Card saved for this booking');
    expect(
      chargeOutcomeText({ key: 'k', kind: 'card_on_file', charge_id: null, status: 'pending', amount_pence: 1, currency: 'GBP', booking_ids: [], failure_code: null, message: null, brand: null, last4: null }).tone,
    ).toBe('muted');
  });
});
