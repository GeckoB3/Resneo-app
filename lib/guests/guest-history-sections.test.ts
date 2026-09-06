import {
  guestBookingsSummary,
  isGuestBookingUpcoming,
  splitGuestHistory,
} from '@/lib/guests/guest-history-sections';

const TZ = 'Europe/London';
// 2026-06-15 10:30 in London (BST, UTC+1).
const NOW = new Date('2026-06-15T09:30:00Z');

function row(over: Partial<{
  id: string;
  booking_date: string;
  booking_time: string;
  status: string;
  estimated_end_time: string | null;
  booking_end_time: string | null;
}> = {}) {
  return {
    id: 'b1',
    booking_date: '2026-06-15',
    booking_time: '11:00:00',
    status: 'Booked',
    ...over,
  };
}

describe('isGuestBookingUpcoming', () => {
  it('is upcoming on a later day and past on an earlier one', () => {
    expect(isGuestBookingUpcoming(row({ booking_date: '2026-06-16' }), NOW, TZ)).toBe(true);
    expect(isGuestBookingUpcoming(row({ booking_date: '2026-06-14' }), NOW, TZ)).toBe(false);
  });

  it("judges today's by the wall clock in the venue's timezone", () => {
    expect(isGuestBookingUpcoming(row({ booking_time: '10:30:00' }), NOW, TZ)).toBe(true);
    expect(isGuestBookingUpcoming(row({ booking_time: '10:15:00' }), NOW, TZ)).toBe(false);
  });

  it('keeps a visit under way upcoming until its end passes', () => {
    expect(
      isGuestBookingUpcoming(
        row({ booking_time: '10:00:00', booking_end_time: '10:45:00' }),
        NOW,
        TZ,
      ),
    ).toBe(true);
    expect(
      isGuestBookingUpcoming(
        row({ booking_time: '09:00:00', booking_end_time: '10:00:00' }),
        NOW,
        TZ,
      ),
    ).toBe(false);
  });

  it('prefers the estimated end instant when the server has one', () => {
    expect(
      isGuestBookingUpcoming(
        row({ booking_date: '2026-06-14', estimated_end_time: '2026-06-15T09:45:00Z' }),
        NOW,
        TZ,
      ),
    ).toBe(true);
    expect(
      isGuestBookingUpcoming(
        row({ booking_date: '2026-06-16', estimated_end_time: '2026-06-15T09:00:00Z' }),
        NOW,
        TZ,
      ),
    ).toBe(false);
  });

  it('never counts a cancelled booking as upcoming', () => {
    expect(
      isGuestBookingUpcoming(row({ booking_date: '2026-07-01', status: 'Cancelled' }), NOW, TZ),
    ).toBe(false);
  });
});

describe('splitGuestHistory / guestBookingsSummary', () => {
  it('orders upcoming soonest first and previous latest first', () => {
    const sections = splitGuestHistory(
      [
        row({ id: 'later', booking_date: '2026-06-20', booking_time: '09:00:00' }),
        row({ id: 'old', booking_date: '2026-05-01', booking_time: '09:00:00' }),
        row({ id: 'soon', booking_date: '2026-06-15', booking_time: '14:00:00' }),
        row({ id: 'recent', booking_date: '2026-06-10', booking_time: '09:00:00' }),
        row({ id: 'cancelled', booking_date: '2026-06-30', status: 'Cancelled' }),
      ],
      NOW,
      TZ,
    );
    expect(sections.upcoming.map((r) => r.id)).toEqual(['soon', 'later']);
    expect(sections.previous.map((r) => r.id)).toEqual(['cancelled', 'recent', 'old']);
    expect(guestBookingsSummary(sections)).toBe('2 upcoming · 3 previous');
  });

  it('summarises an empty history', () => {
    expect(guestBookingsSummary(splitGuestHistory([], NOW, TZ))).toBe('0 upcoming · 0 previous');
  });
});
