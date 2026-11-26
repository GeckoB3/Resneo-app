/**
 * Book once (web codebase standards plan P2.7): a create that timed out is sent again with the same
 * key when the server books once, and the server replays the booking it made. On an older server
 * the app looks for the booking instead, as before (`findJustCreatedBooking`).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';
import { rememberServerFeatures } from '@/lib/booking/book-once';
import type { AppointmentSlot } from '@/types/appointment-availability';
import type { AppointmentServiceOption } from '@/types/appointment-catalog';

const mockCreate = jest.fn();
const mockFind = jest.fn();
jest.mock('@/lib/queries/useCreateBooking', () => ({
  useCreateBooking: () => ({ mutate: mockCreate, isPending: false }),
}));
jest.mock('@/lib/queries/useCreateMultiServiceBooking', () => ({
  useCreateMultiServiceBooking: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token' }));
jest.mock('@/lib/booking/find-just-created-booking', () => ({
  ...jest.requireActual('@/lib/booking/find-just-created-booking'),
  findJustCreatedBooking: (...args: unknown[]) => mockFind(...args),
}));
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
  depositPence: null,
  paymentRequirement: 'none',
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

type Handlers = { onSuccess: (res: Record<string, unknown>) => void; onError: (error: unknown) => void };
const timedOut = () => new ApiError('Request timed out. Check your connection and try again.', 408);

beforeEach(() => {
  jest.useFakeTimers();
  mockCreate.mockReset();
  mockFind.mockReset();
});
afterEach(() => {
  jest.useRealTimers();
  rememberServerFeatures(null);
});

async function pressCreate() {
  await render(
    <ConfirmStep
      service={service}
      date="2026-10-01"
      slot={slot}
      guest={{ first_name: 'Jo', last_name: 'Bloggs', email: 'jo@example.com', phone: '07700 900123' }}
      source="phone"
      onSuccess={jest.fn()}
    />,
  );
  await act(async () => {
    fireEvent.press(screen.getByText('Create booking'));
  });
}

describe('ConfirmStep: a create that timed out', () => {
  it('is sent again with the same payload when the server books once, and the replay confirms it', async () => {
    rememberServerFeatures({ server_features: { book_once: true } });
    mockCreate
      .mockImplementationOnce((_p: unknown, h: Handlers) => h.onError(timedOut()))
      .mockImplementationOnce((_p: unknown, h: Handlers) => h.onSuccess({ booking_id: 'b1', replayed: true }));
    await pressCreate();
    expect(screen.getByText(/Checking whether the booking was made/)).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate.mock.calls[1]![0]).toBe(mockCreate.mock.calls[0]![0]);
    expect(mockFind).not.toHaveBeenCalled();
    expect(screen.getByText('Booking confirmed')).toBeTruthy();
  });

  it('keeps sending while the first is still being made, then looks for it once the resends run out', async () => {
    rememberServerFeatures({ server_features: { book_once: true } });
    const stillBeingMade = new ApiError('Still being made.', 409, { error: 'Still being made.', code: 'CREATE_IN_PROGRESS' });
    mockCreate.mockImplementation((_p: unknown, h: Handlers) => h.onError(mockCreate.mock.calls.length === 1 ? timedOut() : stillBeingMade));
    mockFind.mockResolvedValue('b9');
    await pressCreate();
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(4000);
      });
    }
    expect(mockCreate).toHaveBeenCalledTimes(6);
    expect(mockFind).toHaveBeenCalledTimes(1);
  });

  it('on an older server, looks for the booking rather than sending it twice', async () => {
    mockCreate.mockImplementation((_p: unknown, h: Handlers) => h.onError(timedOut()));
    mockFind.mockResolvedValue('b1');
    await pressCreate();
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockFind).toHaveBeenCalledTimes(1);
  });
});
