/**
 * Moving a class booking (web `StaffClassModifyInstancePicker`): the server moves
 * one only by session, so the app lists the same class's other sessions with room
 * and sends `target_class_instance_id`. The app's Reschedule sent a date and time
 * instead and was refused ("Pick another session of this class…").
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: { timezone: 'Europe/London' } }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

function session(id: string, date: string, over: Record<string, unknown> = {}) {
  return {
    instance_id: id,
    class_type_id: 'yoga',
    class_name: 'Yoga Flow',
    description: null,
    instance_date: date,
    start_time: '09:00:00',
    duration_minutes: 60,
    capacity: 10,
    remaining: 10,
    instructor_id: null,
    instructor_name: 'Andrew',
    price_pence: 1500,
    payment_requirement: 'none',
    deposit_amount_pence: null,
    cancellation_notice_hours: 24,
    ...over,
  };
}

let mockInstances: ReturnType<typeof session>[] = [];
jest.mock('@/lib/queries/useBookingMoveOptions', () => ({
  useStaffClassSessions: () => ({
    data: { venue_id: 'v1', from: '', to: '', classes: [], instances: mockInstances },
    isLoading: false,
    isError: false,
  }),
}));
const mockMove = jest.fn();
const mockInvalidate = jest.fn();
jest.mock('@/lib/queries/useBookingMutations', () => ({
  useMoveClassBooking: () => ({ mutateAsync: mockMove, isPending: false }),
  invalidateBookingCaches: (...args: unknown[]) => mockInvalidate(...args),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token' }));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ClassSessionMoveSheet } from '@/components/bookings/ClassSessionMoveSheet';

const TARGET = { bookingId: 'bk-1', guestName: 'Combined Tester', classInstanceId: 'cur', partySize: 2 };

beforeEach(() => {
  mockInvalidate.mockReset();
  mockMove.mockReset();
  mockMove.mockResolvedValue({});
  mockInstances = [
    session('cur', '2099-10-12'),
    session('next', '2099-10-19'),
    session('full', '2099-10-26', { remaining: 1 }),
    session('other-class', '2099-10-20', { class_type_id: 'pilates', class_name: 'Pilates' }),
  ];
});

describe('ClassSessionMoveSheet', () => {
  it('offers the same class’s other sessions with room for the whole booking', async () => {
    await render(<ClassSessionMoveSheet target={TARGET} onClose={jest.fn()} />);
    expect(screen.getByText('Now: Yoga Flow · Monday 12 October · 09:00')).toBeTruthy();
    expect(screen.getByText(/Monday 19 October/)).toBeTruthy();
    // One place left cannot take a booking for two; another class is not a move.
    expect(screen.queryByText(/Monday 26 October/)).toBeNull();
    expect(screen.queryByText(/Tuesday 20 October/)).toBeNull();
  });

  it('moves the booking to the chosen session', async () => {
    const onClose = jest.fn();
    await render(<ClassSessionMoveSheet target={TARGET} onClose={onClose} />);
    await act(async () => {
      fireEvent.press(screen.getByText(/09:00 · 10 of 10 places left/));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Move booking'));
    });
    expect(mockMove).toHaveBeenCalledWith('next');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the server’s refusal', async () => {
    mockMove.mockRejectedValue(new (jest.requireActual('@/lib/api/client').ApiError)('That session just filled.', 409));
    await render(<ClassSessionMoveSheet target={TARGET} onClose={jest.fn()} />);
    await act(async () => {
      fireEvent.press(screen.getByText(/09:00 · 10 of 10 places left/));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Move booking'));
    });
    expect(screen.getByText('That session just filled.')).toBeTruthy();
  });

  // Web QA X-F2: a sheet opened before a colleague's change must not quietly undo it.
  it('sends the version the sheet opened on with the move', async () => {
    await render(
      <ClassSessionMoveSheet target={{ ...TARGET, updatedAt: '2026-11-08T10:00:00+00:00' }} onClose={jest.fn()} />,
    );
    await act(async () => {
      fireEvent.press(screen.getByText(/09:00 · 10 of 10 places left/));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Move booking'));
    });
    expect(mockMove).toHaveBeenCalledWith({ targetClassInstanceId: 'next', expectedUpdatedAt: '2026-11-08T10:00:00+00:00' });
  });

  it('on a stale_booking refusal says someone else changed it, and Refresh reloads and closes', async () => {
    const { ApiError } = jest.requireActual('@/lib/api/client');
    mockMove.mockRejectedValue(new ApiError('Someone changed this booking.', 412, { error: 'x', code: 'stale_booking' }));
    const onClose = jest.fn();
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <ClassSessionMoveSheet target={{ ...TARGET, updatedAt: 'v1' }} onClose={onClose} />
      </QueryClientProvider>,
    );
    await act(async () => {
      fireEvent.press(screen.getByText(/09:00 · 10 of 10 places left/));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Move booking'));
    });
    expect(screen.getByText('Someone else changed this booking. Refresh to see their change, then try again.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Refresh'));
    });
    expect(mockInvalidate).toHaveBeenCalledWith(expect.anything(), 'token', 'bk-1');
    expect(onClose).toHaveBeenCalled();
  });
});
