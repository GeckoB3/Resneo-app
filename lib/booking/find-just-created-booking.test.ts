/**
 * After a create timed out, the app looks for the booking before inviting a
 * retry (staging 2026-09-23: "Request timed out… try again" over a booking that
 * had been made). It must find that booking, and must not mistake another one.
 */
const mockApiFetch = jest.fn();
jest.mock('@/lib/api/client', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

import { findJustCreatedBooking } from '@/lib/booking/find-just-created-booking';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'bk-1',
    booking_date: '2026-09-28',
    booking_time: '11:00:00',
    party_size: 1,
    status: 'Booked',
    guest_name: 'Colour Client',
    guest_email: 'colour.client@example.com',
    guest_phone: null,
    deposit_status: null,
    calendar_id: 'cal-andrew',
    ...over,
  };
}

const query = {
  accessToken: 'tok',
  date: '2026-09-28',
  time: '11:00',
  practitionerId: 'cal-andrew',
  email: 'Colour.Client@example.com',
  phone: null,
  fullName: 'Colour Client',
};

beforeEach(() => mockApiFetch.mockReset());

describe('findJustCreatedBooking', () => {
  it('finds the booking by its day, time, calendar and guest', async () => {
    mockApiFetch.mockResolvedValue({ bookings: [row({ id: 'other', booking_time: '10:00:00' }), row()] });
    await expect(findJustCreatedBooking(query)).resolves.toBe('bk-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/venue/bookings/list?date=2026-09-28', { accessToken: 'tok' });
  });

  it('matches a guest by phone when there is no email', async () => {
    mockApiFetch.mockResolvedValue({
      bookings: [row({ guest_email: null, guest_phone: '+447911123456', guest_name: 'Someone Else' })],
    });
    await expect(
      findJustCreatedBooking({ ...query, email: null, fullName: null, phone: '07911 123456' }),
    ).resolves.toBe('bk-1');
  });

  it('ignores a cancelled booking, another calendar and another guest', async () => {
    mockApiFetch.mockResolvedValue({
      bookings: [
        row({ id: 'cancelled', status: 'Cancelled' }),
        row({ id: 'other-cal', calendar_id: 'cal-david' }),
        row({ id: 'other-guest', guest_email: 'x@example.com', guest_name: 'X' }),
      ],
    });
    await expect(findJustCreatedBooking(query)).resolves.toBeNull();
  });
});
