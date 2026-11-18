/**
 * The staff booking form's card line (web Docs/card-on-file-plan.md §6.2, §4.9, §10): a card on
 * file found for the client with "Don't use the card for this booking", the "Send a card request"
 * switch on by default (C2), the optional "Cancel if no card is added within 24 hours" tick and its
 * rules, Card not possible, "Add card now", and the confirmation lines from `card_on_file` (with an
 * older server that sends none).
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import type { AppointmentSlot } from '@/types/appointment-availability';
import type { AppointmentServiceOption } from '@/types/appointment-catalog';

const mockCreate = jest.fn();
jest.mock('@/lib/queries/useCreateBooking', () => ({
  useCreateBooking: () => ({ mutate: mockCreate, isPending: false }),
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
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

let mockLookup: {
  card: { brand: string | null; last4: string | null; label: string; savedWith: string; scope: 'business' | 'collective' } | null;
  canTakeCards: boolean | null;
  addSavesWith: { scope: 'business' | 'collective'; name: string } | null;
} = { card: null, canTakeCards: null, addSavesWith: null };
const mockLookupArgs: unknown[][] = [];
jest.mock('@/components/booking-wizard/staff-card-request', () => {
  const actual = jest.requireActual('@/components/booking-wizard/staff-card-request');
  return {
    ...actual,
    useStaffCardLookup: (...args: unknown[]) => {
      mockLookupArgs.push(args);
      return { ...mockLookup, refresh: jest.fn() };
    },
  };
});
// The desk screen itself is tested in components/cards; here only that it opens.
jest.mock('@/components/booking-wizard/StaffAddCardSheet', () => ({
  StaffAddCardSheet: ({ open, guestId }: { open: boolean; guestId?: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return open ? React.createElement(Text, null, `desk sheet for ${guestId}`) : null;
  },
}));

import { ConfirmStep } from '@/components/booking-wizard/ConfirmStep';

const service: AppointmentServiceOption = {
  serviceId: 'svc-1',
  serviceName: 'Cut',
  durationMinutes: 30,
  pricePence: 2500,
  depositPence: 1000,
  paymentRequirement: 'card_hold',
  practitionerId: 'prac-1',
  practitionerName: 'Pat',
  addonGroups: [],
  variants: [],
};

const slot: AppointmentSlot = {
  practitioner_id: 'prac-1',
  practitioner_name: 'Pat',
  service_id: 'svc-1',
  service_name: 'Cut',
  start_time: '10:00',
  duration_minutes: 30,
  price_pence: 2500,
};

type Guest = { first_name: string; last_name: string; email: string; phone: string; guest_id?: string };
const JO: Guest = { first_name: 'Jo', last_name: 'Bloggs', email: 'jo@example.com', phone: '' };

async function renderStep(opts: { guest?: Guest; source?: 'phone' | 'walk-in'; noCardPayments?: boolean } = {}) {
  await render(
    <ConfirmStep
      service={service}
      date="2026-10-01"
      slot={slot}
      guest={opts.guest ?? JO}
      source={opts.source ?? 'phone'}
      noCardPayments={opts.noCardPayments}
      onSuccess={jest.fn()}
    />,
  );
}

async function create(response: Record<string, unknown> = {}) {
  mockCreate.mockImplementation(
    (_payload: unknown, options: { onSuccess: (res: Record<string, unknown>) => void }) =>
      options.onSuccess({ booking_id: 'b1', ...response }),
  );
  await act(async () => {
    fireEvent.press(screen.getByText('Create booking'));
  });
  return mockCreate.mock.calls[0]?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  mockCreate.mockReset();
  mockLookup = { card: null, canTakeCards: null, addSavesWith: null };
  mockLookupArgs.length = 0;
});

describe('no card found', () => {
  it('"Send a card request" is on by default and the create says so', async () => {
    await renderStep();
    const sw = screen.getByLabelText('Send a card request');
    expect(sw.props.value).toBe(true);
    expect(
      screen.getByText(
        "The booking is confirmed now. If the client doesn't add a card, it stays booked and shows Waiting for card.",
      ),
    ).toBeTruthy();
    const body = await create();
    expect(body.require_card_hold).toBe(true);
    expect(body).not.toHaveProperty('cancel_if_no_card');
    expect(body).not.toHaveProperty('use_card_on_file');
  });

  it('the tick changes the line and is sent; switching off hides it and makes Card not needed', async () => {
    await renderStep();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Cancel if no card is added within 24 hours'));
    });
    expect(
      screen.getByText('The booking waits for the card, and is cancelled if none is added within 24 hours.'),
    ).toBeTruthy();
    await act(async () => {
      fireEvent(screen.getByLabelText('Send a card request'), 'valueChange', false);
    });
    expect(screen.queryByLabelText('Cancel if no card is added within 24 hours')).toBeNull();
    expect(screen.getByText('No card will be asked for. The booking shows Card not needed.')).toBeTruthy();
    const body = await create();
    expect(body.require_card_hold).toBe(false);
    expect(body).not.toHaveProperty('cancel_if_no_card');
  });

  it('sends the tick when it is set', async () => {
    await renderStep();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Cancel if no card is added within 24 hours'));
    });
    const body = await create();
    expect(body).toMatchObject({ require_card_hold: true, cancel_if_no_card: true });
  });

  it('never offers the tick for a walk-in, or for a client nobody can reach', async () => {
    await renderStep({ source: 'walk-in' });
    expect(screen.getByLabelText('Send a card request')).toBeTruthy();
    expect(screen.queryByLabelText('Cancel if no card is added within 24 hours')).toBeNull();
  });

  it('never offers the tick for a client with no email or mobile', async () => {
    await renderStep({ guest: { ...JO, email: '', phone: '' } });
    expect(screen.queryByLabelText('Cancel if no card is added within 24 hours')).toBeNull();
  });

  it('offers "Add card now" only for a client with a record, and opens the desk screen', async () => {
    await renderStep();
    expect(screen.queryByText('Add card now')).toBeNull();
    await renderStep({ guest: { ...JO, guest_id: 'g-1' } });
    await act(async () => {
      fireEvent.press(screen.getByText('Add card now'));
    });
    expect(screen.getByText('desk sheet for g-1')).toBeTruthy();
  });
});

/**
 * A service with options whose chosen option has no fee of its own takes the service's fee, as the
 * server does. Reading the option alone hid the whole card line (found on the phone 2026-11-18).
 */
describe('a service option', () => {
  const variant = {
    id: 'var-1',
    name: 'Long hair',
    description: null,
    duration_minutes: 45,
    buffer_minutes: 0,
    price_pence: 3500,
    deposit_pence: null as number | null,
    sort_order: 0,
  };

  async function renderWithVariant(v: typeof variant) {
    await render(
      <ConfirmStep
        service={{ ...service, variants: [v] }}
        variant={v}
        date="2026-10-01"
        slot={slot}
        guest={JO}
        source="phone"
        onSuccess={jest.fn()}
      />,
    );
  }

  it('without its own fee shows the card line and the tick, using the service fee', async () => {
    await renderWithVariant(variant);
    expect(screen.getByLabelText('Send a card request')).toBeTruthy();
    expect(screen.getByLabelText('Cancel if no card is added within 24 hours')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Cancel if no card is added within 24 hours'));
    });
    const body = await create();
    expect(body).toMatchObject({ require_card_hold: true, cancel_if_no_card: true });
  });

  it('with its own fee uses that fee', async () => {
    mockLookup = {
      card: { brand: 'visa', last4: '4242', label: 'Visa ending 4242', savedWith: 'Bloom', scope: 'business' },
      canTakeCards: true,
      addSavesWith: null,
    };
    await renderWithVariant({ ...variant, deposit_pence: 2500 });
    expect(screen.getByTestId('staff-card-found-line').props.children).toContain('£25.00');
  });
});

describe('a card on file found', () => {
  it('says the booking is protected, looks the card up for the picked client only, and uses it', async () => {
    mockLookup = {
      card: { brand: 'visa', last4: '4242', label: 'Visa ending 4242', savedWith: 'The Beauty Parlour', scope: 'collective' },
      canTakeCards: true,
      addSavesWith: null,
    };
    await renderStep({ guest: { ...JO, guest_id: 'g-1' } });
    expect(mockLookupArgs[0]).toEqual(['g-1', true]);
    expect(
      screen.getByText('Protected by card on file (Visa ending 4242). No-show fee up to £10.00.'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Send a card request')).toBeNull();
    const body = await create();
    expect(body).toMatchObject({ require_card_hold: true });
    expect(body).not.toHaveProperty('use_card_on_file');
  });

  it('"Don\'t use the card for this booking" shows the switch and sends use_card_on_file: false', async () => {
    mockLookup = {
      card: { brand: 'visa', last4: '4242', label: 'Visa ending 4242', savedWith: "Steph's", scope: 'business' },
      canTakeCards: true,
      addSavesWith: null,
    };
    await renderStep({ guest: { ...JO, guest_id: 'g-1' } });
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Don't use the card for this booking"));
    });
    expect(screen.getByLabelText('Send a card request')).toBeTruthy();
    expect(screen.getByLabelText('Use the card on file')).toBeTruthy();
    const body = await create();
    expect(body).toMatchObject({ require_card_hold: true, use_card_on_file: false });
  });
});

describe('card not possible', () => {
  it('says so when the client record answers that the business cannot take cards', async () => {
    mockLookup = { card: null, canTakeCards: false, addSavesWith: null };
    await renderStep({ guest: { ...JO, guest_id: 'g-1' } });
    expect(screen.getByText("Card not possible: this business can't take card payments yet.")).toBeTruthy();
    expect(screen.queryByLabelText('Send a card request')).toBeNull();
    const body = await create();
    expect(body.require_card_hold).toBe(false);
  });
});

describe('the confirmation (card_on_file)', () => {
  it('Waiting for card, sent to the email, stays booked', async () => {
    await renderStep({ guest: { ...JO, guest_id: 'g-1' } });
    await create({
      payment_url: 'https://r.test/cr/abc',
      card_hold_requested: true,
      payment_link_sent: true,
      card_on_file: { covered: false, state: 'waiting', cancel_if_no_card_at: null },
    });
    expect(screen.getByText('Booking confirmed')).toBeTruthy();
    const card = within(screen.getByTestId('staff-card-confirmation'));
    expect(card.getByText('Waiting for card')).toBeTruthy();
    expect(card.getByText('A card request was sent to jo@example.com.')).toBeTruthy();
    expect(
      card.getByText('The booking stays booked and shows Waiting for card until the client adds one.'),
    ).toBeTruthy();
    expect(card.getByText('Add card now')).toBeTruthy();
  });

  it('a ticked booking reads Waiting for card with its deadline', async () => {
    await renderStep();
    await create({
      payment_url: 'https://r.test/cr/abc',
      card_hold_requested: true,
      card_on_file: { covered: false, state: 'waiting', cancel_if_no_card_at: '2026-10-01T08:00:00Z' },
    });
    expect(screen.getAllByText('Waiting for card').length).toBeGreaterThan(1);
    expect(screen.getByText(/^The booking is cancelled if no card is added by 1 October, /)).toBeTruthy();
  });

  it('shows the link to copy when the request could not be sent', async () => {
    await renderStep({ guest: { ...JO, email: '', phone: '' } });
    await create({
      payment_url: 'https://r.test/cr/abc',
      card_hold_requested: true,
      payment_link_sent: false,
      card_on_file: { covered: false, state: 'waiting', cancel_if_no_card_at: null },
    });
    expect(
      screen.getByText(
        'The client has no email or phone number, so the card request was not sent. Open the link on this device, or copy it to send. No payment is taken.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('https://r.test/cr/abc')).toBeTruthy();
    expect(screen.getByText('Copy link')).toBeTruthy();
  });

  it('Protected, with the card', async () => {
    await renderStep();
    await create({ card_on_file: { covered: true, state: 'protected', brand: 'mastercard', last4: '1111' } });
    expect(screen.getByText('Booking confirmed')).toBeTruthy();
    expect(screen.getByText('Protected by card on file (Mastercard ending 1111). No-show fee up to £10.00.')).toBeTruthy();
  });

  it('a client typed in as new gets "Add card now" from the guest_id the create answers', async () => {
    await renderStep();
    await create({
      guest_id: 'g-new',
      card_on_file: { covered: false, state: 'not_needed' },
    });
    const card = within(screen.getByTestId('staff-card-confirmation'));
    await act(async () => {
      fireEvent.press(card.getByText('Add card now'));
    });
    expect(screen.getByText('desk sheet for g-new')).toBeTruthy();
  });

  it('a typed new client with no guest_id in the answer (an older server) is offered no "Add card now"', async () => {
    await renderStep();
    await create({ card_on_file: { covered: false, state: 'not_needed' } });
    expect(screen.queryByText('Add card now')).toBeNull();
  });

  it('Card not needed and Card not possible', async () => {
    await renderStep();
    await create({ card_on_file: { covered: false, state: 'not_needed' } });
    expect(screen.getByText('No card was asked for. The booking shows Card not needed.')).toBeTruthy();
  });

  it('an older server that sends no card_on_file and no request reads as confirmed', async () => {
    await renderStep();
    await create({});
    expect(screen.getByText('Booking confirmed')).toBeTruthy();
    expect(screen.queryByTestId('staff-card-confirmation')).toBeNull();
  });
});
