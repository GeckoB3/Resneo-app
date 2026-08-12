import {
  MIN_CORE_DURATION_MINUTES,
  resolveBookingCoreDurationMinutes,
} from '@/lib/booking/booking-core-duration';

describe('resolveBookingCoreDurationMinutes', () => {
  it('prefers the wall-clock booking_end_time', () => {
    expect(
      resolveBookingCoreDurationMinutes({
        booking_time: '10:00:00',
        booking_end_time: '11:30:00',
        estimated_end_time: '2026-08-11T23:00:00.000Z',
      }),
    ).toBe(90);
  });

  it('falls back to estimated_end_time — the guest-created appointment case', () => {
    // booking_end_time is NULL for every guest-created appointment (only the
    // resource flows post one), so this is the path that used to yield 30.
    expect(
      resolveBookingCoreDurationMinutes({
        booking_time: '10:00:00',
        booking_end_time: null,
        estimated_end_time: '2026-08-11T11:30:00.000Z',
      }),
    ).toBe(90);
  });

  it('reads estimated_end_time as the venue-local wall clock, not a real instant', () => {
    // The column stores the wall clock encoded as UTC, so toISOString gives it
    // back unchanged regardless of the device's timezone.
    expect(
      resolveBookingCoreDurationMinutes({
        booking_time: '14:15',
        estimated_end_time: '2026-12-25T15:00:00.000Z',
      }),
    ).toBe(45);
  });

  it('returns null when the row carries no end at all', () => {
    expect(
      resolveBookingCoreDurationMinutes({ booking_time: '10:00:00' }),
    ).toBeNull();
    expect(
      resolveBookingCoreDurationMinutes({
        booking_time: '10:00:00',
        booking_end_time: null,
        estimated_end_time: null,
      }),
    ).toBeNull();
  });

  it('returns null for a degenerate end equal to the start', () => {
    expect(
      resolveBookingCoreDurationMinutes({
        booking_time: '10:00:00',
        booking_end_time: '10:00:00',
      }),
    ).toBeNull();
  });

  it('wraps an end past midnight instead of going negative', () => {
    expect(
      resolveBookingCoreDurationMinutes({
        booking_time: '22:30:00',
        booking_end_time: '01:00:00',
      }),
    ).toBe(150);
  });

  it('keeps a genuinely short appointment short (the API floor is 5, not 15)', () => {
    expect(
      resolveBookingCoreDurationMinutes({
        booking_time: '09:00:00',
        booking_end_time: '09:05:00',
      }),
    ).toBe(5);
  });

  it('floors a sub-minimum span rather than returning something unbookable', () => {
    expect(
      resolveBookingCoreDurationMinutes({
        booking_time: '09:00:00',
        booking_end_time: '09:02:00',
      }),
    ).toBe(MIN_CORE_DURATION_MINUTES);
  });

  it('ignores an unparseable estimated_end_time', () => {
    expect(
      resolveBookingCoreDurationMinutes({
        booking_time: '10:00:00',
        estimated_end_time: 'not-a-date',
      }),
    ).toBeNull();
  });

  it('returns null when the start itself is missing', () => {
    expect(
      resolveBookingCoreDurationMinutes({
        booking_time: '',
        booking_end_time: '11:00:00',
      }),
    ).toBeNull();
  });
});
