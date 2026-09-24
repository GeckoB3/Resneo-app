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

describe('ConfirmStep confirmation heading (web QA B-9)', () => {
  beforeEach(() => mockCreate.mockReset());

  it('waits for the deposit when a payment link was sent', async () => {
    await createWith({ payment_url: 'https://pay.example/abc' });
    expect(screen.getByText('Waiting for the deposit')).toBeTruthy();
    expect(
      screen.getByText(
        'The booking stays pending until the deposit is paid. Then a confirmation will be sent to jo@example.com.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Booking confirmed')).toBeNull();
  });

  it('waits for card details when the link asks for a card, naming the phone when there is no email', async () => {
    await createWith(
      { payment_url: 'https://pay.example/abc', card_hold_requested: true },
      { email: '', phone: '07700 900123' },
    );
    expect(screen.getByText('Waiting for card details')).toBeTruthy();
    expect(
      screen.getByText(
        'The booking stays pending until the card is added. Then a confirmation will be sent to 07700 900123.',
      ),
    ).toBeTruthy();
  });

  it('says confirmed when nothing is owed', async () => {
    await createWith({});
    expect(screen.getByText('Booking confirmed')).toBeTruthy();
    expect(screen.getByText('The appointment has been created successfully.')).toBeTruthy();
    expect(screen.queryByText('Waiting for the deposit')).toBeNull();
  });
});
