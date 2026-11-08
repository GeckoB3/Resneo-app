/**
 * QA 2026-11-08 DEVICE-F4: a booking made on a partner business's calendar in a collective said
 * nothing about where it was made until it was opened afterwards. The review and the confirmation
 * now say "Booked at Light 16".
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
  bookedAtBusiness: string | null = null,
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
      bookedAtBusiness={bookedAtBusiness}
    />,
  );
  await act(async () => {
    fireEvent.press(screen.getByText('Create booking'));
  });
}

describe('ConfirmStep names the business a collective booking is made at', () => {
  beforeEach(() => mockCreate.mockReset());

  it('on the review and on the confirmation', async () => {
    mockCreate.mockImplementation(() => undefined);
    await render(
      <ConfirmStep
        service={service}
        date="2026-10-01"
        slot={slot}
        guest={{ first_name: 'Jo', last_name: 'Bloggs', email: 'jo@example.com', phone: '07700 900123' }}
        source="phone"
        onSuccess={jest.fn()}
        bookedAtBusiness="Light 16"
      />,
    );
    expect(screen.getByText('Booked at')).toBeTruthy();
    expect(screen.getByText('Light 16')).toBeTruthy();
    expect(screen.getByTestId('confirm-booked-at-note')).toHaveTextContent(
      "The booking and the client's details are saved at Light 16.",
    );
  });

  it('after it is created', async () => {
    await createWith({}, undefined, 'Light 16');
    expect(screen.getByText('Booking confirmed')).toBeTruthy();
    expect(screen.getByText('Booked at')).toBeTruthy();
    expect(screen.getByText('Light 16')).toBeTruthy();
  });

  it('says nothing for a booking at the signed-in business', async () => {
    await createWith({});
    expect(screen.queryByText('Booked at')).toBeNull();
  });
});
