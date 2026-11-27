/**
 * Review & confirm reads the server's quote (web codebase standards plan P4.2, P4.3): the total,
 * what "Pay now" takes, the "Cancel if not paid by ..." deadline, the no-show fee and its
 * percentage come from it, and the screen keeps its local rules when there is no quote (an older
 * server). jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { render, screen, within } from '@testing-library/react-native';

import type { BookingQuote, BookingQuoteRequest } from '@/lib/booking/booking-quote';
import type { AppointmentSlot } from '@/types/appointment-availability';
import type { AppointmentCatalogAddon, AppointmentServiceOption } from '@/types/appointment-catalog';

let mockQuote: BookingQuote | null = null;
const mockQuoteRequests: (BookingQuoteRequest | null)[] = [];
jest.mock('@/lib/queries/useBookingQuote', () => ({
  useBookingQuote: (request: BookingQuoteRequest | null) => {
    mockQuoteRequests.push(request);
    return { quote: mockQuote, isLoading: false };
  },
}));
jest.mock('@/lib/queries/useCreateBooking', () => ({
  useCreateBooking: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/queries/useCreateMultiServiceBooking', () => ({
  useCreateMultiServiceBooking: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token' }));
jest.mock('@/lib/booking/find-just-created-booking', () => ({ findJustCreatedBooking: jest.fn() }));
jest.mock('@/lib/haptics', () => ({
  hapticSuccess: jest.fn(),
  hapticWarning: jest.fn(),
  hapticTap: jest.fn(),
  hapticSelect: jest.fn(),
}));
jest.mock('@/components/booking-wizard/staff-card-request', () => {
  const actual = jest.requireActual('@/components/booking-wizard/staff-card-request');
  return {
    ...actual,
    useStaffCardLookup: () => ({ card: null, canTakeCards: null, addSavesWith: null, refresh: jest.fn() }),
  };
});

import { ConfirmStep } from '@/components/booking-wizard/ConfirmStep';

/** A pay-in-full service with a priced add-on. */
const balayage: AppointmentServiceOption = {
  serviceId: 'svc-bal',
  serviceName: 'Balayage',
  durationMinutes: 45,
  pricePence: 5000,
  depositPence: null,
  paymentRequirement: 'full_payment',
  practitionerId: 'prac-1',
  practitionerName: 'Pat',
  addonGroups: [],
  variants: [],
};

const slot: AppointmentSlot = {
  practitioner_id: 'prac-1',
  practitioner_name: 'Pat',
  service_id: 'svc-bal',
  service_name: 'Balayage',
  start_time: '10:00',
  duration_minutes: 45,
  price_pence: 5000,
};

const gloss: AppointmentCatalogAddon = {
  id: 'addon-gloss',
  name: 'Gloss',
  description: null,
  additional_price_pence: 1000,
  additional_duration_minutes: 15,
  sort_order: 0,
};

function quote(over: Partial<BookingQuote> = {}): BookingQuote {
  return {
    quote_version: 1,
    mode: 'single',
    cancellation_notice_hours: 24,
    card_payments_available: true,
    items: [
      {
        index: 0,
        service_id: 'svc-bal',
        calendar_id: 'prac-1',
        date: '2026-12-15',
        start: '10:00',
        end: '11:00',
        duration_minutes: 60,
        buffer_minutes: 0,
        processing_tail_minutes: 0,
        estimated_end_time: '2026-12-15T11:00:00.000Z',
        price: { service_pence: 5000, addons_pence: 1000, total_pence: 6000 },
        charge: {
          kind: 'full_payment',
          amount_pence: 6000,
          card_hold_fee_pence: null,
          offered_kind: 'full_payment',
          offered_amount_pence: 6000,
          card_hold_percent: null,
        },
      },
    ],
    totals: {
      price_pence: 6000,
      duration_minutes: 60,
      starts_at: '10:00',
      ends_at: '11:00',
      charge_now_pence: 6000,
      offered_charge_pence: 6000,
      card_hold_fee_pence: 0,
    },
    deposit: {
      required: true,
      amount_pence: 6000,
      offered_amount_pence: 6000,
      word: 'payment',
      cancel_choice: true,
      deadline_text: 'Wed 2 Dec, 09:00',
      cancel_label: 'Cancel if not paid by Wed 2 Dec, 09:00',
      kept: false,
      cancel_at: '2026-12-02T09:00:00.000Z',
      outcome_line: 'If it is not paid by Wed 2 Dec, 09:00, the booking is cancelled.',
    },
    card_hold: { required: false, fee_pence: 0, consent_text: null, percent: null, percent_label: null },
    ...over,
  };
}

async function renderStep(props: Partial<Parameters<typeof ConfirmStep>[0]> = {}) {
  await render(
    <ConfirmStep
      service={balayage}
      date="2026-12-15"
      slot={slot}
      addons={[gloss]}
      guest={{ first_name: 'Jo', last_name: 'Bloggs', email: 'jo@example.com', phone: '' }}
      source="phone"
      requireDeposit
      onChangeRequireDeposit={jest.fn()}
      onSuccess={jest.fn()}
      timeZone="Europe/London"
      {...props}
    />,
  );
}

beforeEach(() => {
  mockQuote = null;
  mockQuoteRequests.length = 0;
});

describe('Review & confirm with the server quote', () => {
  it('asks the quote with what the create sends', async () => {
    await renderStep();
    expect(mockQuoteRequests.at(-1)).toEqual({
      date: '2026-12-15',
      mode: 'single',
      source: 'phone',
      staff_charge: { require_deposit: true, require_card_hold: true, cancel_if_no_card: false, cancel_if_unpaid: true },
      client: { email: 'jo@example.com' },
      items: [{ service_id: 'svc-bal', calendar_id: 'prac-1', start: '10:00', addon_ids: ['addon-gloss'] }],
    });
  });

  it('a pay-in-full service with an add-on: Pay now is the price plus the add-on, as the server takes it', async () => {
    mockQuote = quote();
    await renderStep();
    expect(within(screen.getByTestId('confirm-charge-now')).getByText('£60.00')).toBeTruthy();
    expect(screen.getByText('60 min · Pat')).toBeTruthy();
    expect(screen.getByText('Cancel if not paid by Wed 2 Dec, 09:00')).toBeTruthy();
  });

  it('without a quote (an older server) the local rule stands: the add-on is left out of Pay now', async () => {
    // The live bug the quote fixes (P4.3): the local rule shows £50.00 while the server takes £60.00.
    await renderStep();
    expect(within(screen.getByTestId('confirm-charge-now')).getByText('£50.00')).toBeTruthy();
  });

  it('a card hold set as a percentage names it beside the fee', async () => {
    mockQuote = quote({
      deposit: { ...quote().deposit, required: false, amount_pence: 0, offered_amount_pence: 0, cancel_choice: false, deadline_text: null, cancel_label: null, kept: null, cancel_at: null, outcome_line: null },
      totals: { ...quote().totals, charge_now_pence: 0, offered_charge_pence: 0, card_hold_fee_pence: 3000 },
      card_hold: { required: true, fee_pence: 3000, consent_text: 'By saving your card...', percent: 50, percent_label: '50% of the price' },
    });
    await renderStep({ service: { ...balayage, paymentRequirement: 'card_hold', cardHoldFeePercent: 50 }, requireDeposit: false });
    const hold = within(screen.getByTestId('confirm-hold-now'));
    expect(hold.getByText('No-show fee (50% of the price)')).toBeTruthy();
    expect(hold.getByText('£30.00')).toBeTruthy();
  });

  it('a visit across businesses is not quoted', async () => {
    await renderStep({
      multiServiceSegments: [
        { serviceId: 'a', serviceName: 'A', practitionerId: 'p1', practitionerName: 'Pat', startTime: '10:00', durationMinutes: 30, naturalDurationMinutes: 30, bufferMinutes: 0, pricePence: 1000, venueId: 'v1' },
        { serviceId: 'b', serviceName: 'B', practitionerId: 'p2', practitionerName: 'Sam', startTime: '10:30', durationMinutes: 30, naturalDurationMinutes: 30, bufferMinutes: 0, pricePence: 1000, venueId: 'v2' },
      ],
      businessParts: [
        { venueId: 'v1', name: 'One', depositPence: 0, holdPence: 0, chargeLabel: 'deposit' },
        { venueId: 'v2', name: 'Two', depositPence: 0, holdPence: 0, chargeLabel: 'deposit' },
      ] as never,
    });
    expect(mockQuoteRequests.at(-1)).toBeNull();
  });
});
