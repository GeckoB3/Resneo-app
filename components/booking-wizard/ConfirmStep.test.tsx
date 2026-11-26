/**
 * The confirmation after a staff create (web QA B-9, 2026-09-23). When the 201
 * carries a `payment_url`, a deposit or card link went to the guest and the
 * booking stays Pending until they use it, so the heading says what it is
 * waiting for rather than "Booking confirmed". jest hoists mock factories
 * above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

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

import { ConfirmStep } from '@/components/booking-wizard/ConfirmStep';

const service: AppointmentServiceOption = {
  serviceId: 'svc-1',
  serviceName: 'Cut',
  durationMinutes: 30,
  pricePence: 2500,
  depositPence: 1000,
  paymentRequirement: 'deposit',
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

/** The day before the 10:00 (BST) appointment, at 10:00: its deadline is 2 hours before it. */
const NOW_MS = Date.parse('2026-09-30T09:00:00Z');
let nowSpy: jest.SpyInstance | null = null;
beforeEach(() => {
  nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW_MS);
});
afterEach(() => {
  nowSpy?.mockRestore();
});

async function createWith(
  response: { payment_url?: string; card_hold_requested?: boolean },
  guest: { email: string; phone: string } = { email: 'jo@example.com', phone: '07700 900123' },
) {
  mockCreate.mockImplementation(
    (_payload: unknown, options: { onSuccess: (res: Record<string, unknown>) => void }) =>
      options.onSuccess({ booking_id: 'b1', ...response }),
  );
  await render(
    <ConfirmStep
      service={service}
      date="2026-10-01"
      slot={slot}
      guest={{ first_name: 'Jo', last_name: 'Bloggs', ...guest }}
      source="phone"
      requireDeposit
      onSuccess={jest.fn()}
    />,
  );
  await act(async () => {
    fireEvent.press(screen.getByText('Create booking'));
  });
}

/** "Cancel if not paid by ..." under Require deposit (web deposit-handling plan DH1). */
describe('ConfirmStep: Cancel if not paid', () => {
  beforeEach(() => mockCreate.mockReset());

  async function renderTicked() {
    mockCreate.mockImplementation(
      (_payload: unknown, options: { onSuccess: (res: Record<string, unknown>) => void }) =>
        options.onSuccess({ booking_id: 'b1', payment_url: 'https://pay.example/abc' }),
    );
    await render(
      <ConfirmStep
        service={service}
        date="2026-10-01"
        slot={slot}
        guest={{ first_name: 'Jo', last_name: 'Bloggs', email: 'jo@example.com', phone: '07700 900123' }}
        source="phone"
        requireDeposit
        onChangeRequireDeposit={jest.fn()}
        timeZone="Europe/London"
        onSuccess={jest.fn()}
      />,
    );
  }

  it('is on by default with the deadline', async () => {
    await renderTicked();
    expect(screen.getByLabelText('Cancel if not paid by Thu 1 Oct, 08:00').props.accessibilityState).toEqual({ checked: true });
  });

  it('turned off, the create says so and the confirmation reads as confirmed', async () => {
    await renderTicked();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Cancel if not paid by Thu 1 Oct, 08:00'));
    });
    expect(screen.getByText('The booking is confirmed now and the deposit stays due.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Create booking'));
    });
    expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({ require_deposit: true, cancel_if_unpaid: false });
    expect(screen.getByText('Booking confirmed')).toBeTruthy();
    expect(
      screen.getByText('The booking is confirmed, with the deposit still due. It stays booked if the deposit is not paid.'),
    ).toBeTruthy();
  });

  it('sends no choice when no deposit is asked for', async () => {
    mockCreate.mockImplementation(
      (_payload: unknown, options: { onSuccess: (res: Record<string, unknown>) => void }) =>
        options.onSuccess({ booking_id: 'b1' }),
    );
    await render(
      <ConfirmStep
        service={service}
        date="2026-10-01"
        slot={slot}
        guest={{ first_name: 'Jo', last_name: 'Bloggs', email: 'jo@example.com', phone: '07700 900123' }}
        source="phone"
        requireDeposit={false}
        onChangeRequireDeposit={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    expect(screen.queryByText(/Cancel if not paid/)).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Create booking'));
    });
    expect(mockCreate.mock.calls[0]?.[0]).not.toHaveProperty('cancel_if_unpaid');
  });
});

describe('ConfirmStep confirmation heading (web QA B-9)', () => {
  beforeEach(() => mockCreate.mockReset());

  it('waits for the deposit when a payment link was sent, naming the real deadline', async () => {
    await createWith({ payment_url: 'https://pay.example/abc' });
    expect(screen.getByText('Waiting for the deposit')).toBeTruthy();
    expect(
      screen.getByText(
        'The booking stays pending until the deposit is paid. Then a confirmation will be sent to jo@example.com. If it is not paid by Thu 1 Oct, 08:00, the booking is cancelled.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Booking confirmed')).toBeNull();
    // Never the old "within 24 hours".
    expect(screen.queryByText(/24 hours|auto-cancelled/)).toBeNull();
    expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({ require_deposit: true, cancel_if_unpaid: true });
  });

  it('a client with no email or mobile: the booking is confirmed with the deposit still due (DH5)', async () => {
    await createWith({ payment_url: 'https://pay.example/abc' }, { email: '', phone: '' });
    expect(screen.getByText('Booking confirmed')).toBeTruthy();
    expect(
      screen.getByText('The booking is confirmed, with the deposit still due. It stays booked if the deposit is not paid.'),
    ).toBeTruthy();
  });

  it('under 2 hours to go: the booking is confirmed with the deposit still due', async () => {
    nowSpy?.mockReturnValue(Date.parse('2026-10-01T07:30:00Z'));
    await createWith({ payment_url: 'https://pay.example/abc' });
    expect(screen.getByText('Booking confirmed')).toBeTruthy();
    expect(screen.queryByText('Waiting for the deposit')).toBeNull();
  });

  it('an older server: waits for a card, naming the phone when there is no email', async () => {
    await createWith(
      { payment_url: 'https://pay.example/abc', card_hold_requested: true },
      { email: '', phone: '07700 900123' },
    );
    expect(screen.getAllByText('Waiting for card').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        'The booking is waiting for the client to add a card. Then a confirmation will be sent to 07700 900123.',
      ),
    ).toBeTruthy();
    // No 24-hour cancellation is claimed: nothing was ticked.
    expect(screen.queryByText(/cancelled/)).toBeNull();
  });

  it('says confirmed when nothing is owed', async () => {
    await createWith({});
    expect(screen.getByText('Booking confirmed')).toBeTruthy();
    expect(screen.getByText('The appointment has been created successfully.')).toBeTruthy();
    expect(screen.queryByText('Waiting for the deposit')).toBeNull();
  });
});

/**
 * A collective calendar guests cannot book (web `staffCalendarNotice`, 2026-10-28): staff read the
 * catalogue's note, and where the venue cannot take cards no deposit or card hold is offered or sent.
 */
describe('ConfirmStep on a collective calendar staff are told about', () => {
  const note = 'Card payments are not set up at Light 3, so take payment in person.';
  beforeEach(() => mockCreate.mockReset());

  it('shows the note, offers no deposit, turns a ticked one off and asks for none', async () => {
    const onChangeRequireDeposit = jest.fn();
    await render(
      <ConfirmStep
        service={service}
        date="2026-10-01"
        slot={slot}
        guest={{ first_name: 'Jo', last_name: 'Bloggs', email: 'jo@example.com', phone: '07700 900123' }}
        source="phone"
        requireDeposit
        onChangeRequireDeposit={onChangeRequireDeposit}
        staffNotes={[note]}
        noCardPayments
        onSuccess={jest.fn()}
      />,
    );
    expect(screen.getByText(note)).toBeTruthy();
    expect(screen.queryByLabelText(/^Require deposit/)).toBeNull();
    expect(screen.queryByText('Deposit')).toBeNull();
    expect(onChangeRequireDeposit).toHaveBeenCalledWith(false);
    await act(async () => {
      fireEvent.press(screen.getByText('Create booking'));
    });
    expect(mockCreate.mock.calls[0]?.[0]).not.toHaveProperty('require_deposit');
  });

  it('offers no card hold and tells the create there is none', async () => {
    await render(
      <ConfirmStep
        service={{ ...service, paymentRequirement: 'card_hold', depositPence: 1500 }}
        date="2026-10-01"
        slot={slot}
        guest={{ first_name: 'Jo', last_name: 'Bloggs', email: 'jo@example.com', phone: '07700 900123' }}
        source="phone"
        staffNotes={[note]}
        noCardPayments
        onSuccess={jest.fn()}
      />,
    );
    expect(screen.queryByLabelText(/^Card hold/)).toBeNull();
    expect(screen.queryByText('No-show fee')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Create booking'));
    });
    expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({ require_card_hold: false });
  });

  it('keeps the deposit where the note is about something else', async () => {
    await render(
      <ConfirmStep
        service={service}
        date="2026-10-01"
        slot={slot}
        guest={{ first_name: 'Jo', last_name: 'Bloggs', email: 'jo@example.com', phone: '07700 900123' }}
        source="phone"
        requireDeposit
        onChangeRequireDeposit={jest.fn()}
        staffNotes={['Forms are switched off at Light 3.']}
        onSuccess={jest.fn()}
      />,
    );
    expect(screen.getByText('Forms are switched off at Light 3.')).toBeTruthy();
    expect(screen.getByLabelText('Require deposit £10.00')).toBeTruthy();
  });
});
