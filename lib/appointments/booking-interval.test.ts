import {
  bookingIntervalGrid,
  bookingStartFingerprint,
  bookingStartTimesToMinutes,
  describeBookingStartOffsets,
  describeBookingStartTimes,
  findTooCloseStartTimes,
  minutesToBookingStartTime,
  normalizeBookingIntervalMinutes,
  normalizeBookingStartForStorage,
  sanitizeBookingMinuteMarks,
  sanitizeBookingStartTimes,
  usesFixedStartTimes,
} from '@/lib/appointments/booking-interval';

/**
 * Booking-start configuration (web parity: `lib/appointments/booking-interval.ts`).
 * The app never generates slots, but the service editor must read and save exactly
 * what the availability engine reads — so these pin the normalisation rules the
 * API applies on the other side.
 */

describe('normalizeBookingIntervalMinutes', () => {
  it('clamps to 1-60 and floors fractional values', () => {
    expect(normalizeBookingIntervalMinutes(0)).toBe(1);
    expect(normalizeBookingIntervalMinutes(90)).toBe(60);
    expect(normalizeBookingIntervalMinutes(12.9)).toBe(12);
  });

  it('falls back to the default for input that is not a number at all', () => {
    expect(normalizeBookingIntervalMinutes('abc')).toBe(15);
    expect(normalizeBookingIntervalMinutes(undefined)).toBe(15);
  });

  it('treats null as 0 and therefore clamps it to the minimum (web parity)', () => {
    // `Number(null)` is 0, which is finite, so it clamps rather than defaulting.
    // Callers that mean "unset" pass `?? DEFAULT_BOOKING_INTERVAL_MINUTES`, which
    // is what `normalizeBookingStartForStorage` does.
    expect(normalizeBookingIntervalMinutes(null)).toBe(1);
    expect(normalizeBookingStartForStorage(null, null).booking_interval_minutes).toBe(15);
  });
});

describe('bookingIntervalGrid', () => {
  it('walks the hour from :00 at the interval spacing', () => {
    expect(bookingIntervalGrid(15)).toEqual([0, 15, 30, 45]);
    expect(bookingIntervalGrid(60)).toEqual([0]);
  });
});

describe('sanitizeBookingMinuteMarks', () => {
  it('keeps only unique on-grid marks, ascending', () => {
    expect(sanitizeBookingMinuteMarks([30, 0, 30, 45], 15)).toEqual([0, 30, 45]);
  });

  it('drops marks that do not land on the grid', () => {
    expect(sanitizeBookingMinuteMarks([0, 7, 20, 30], 15)).toEqual([0, 30]);
  });

  it('is empty for non-array input', () => {
    expect(sanitizeBookingMinuteMarks(null, 15)).toEqual([]);
  });
});

describe('sanitizeBookingStartTimes', () => {
  it('dedupes and sorts chronologically', () => {
    expect(sanitizeBookingStartTimes(['13:45', '09:20', '13:45', '11:30'])).toEqual([
      '09:20',
      '11:30',
      '13:45',
    ]);
  });

  it('accepts a seconds-bearing value by taking HH:MM', () => {
    expect(sanitizeBookingStartTimes(['09:20:00'])).toEqual(['09:20']);
  });

  it('rejects malformed, out-of-range and non-string entries', () => {
    expect(sanitizeBookingStartTimes(['24:00', '9:20', '', '12:60', 930, null])).toEqual([]);
  });

  it('is empty for non-array input', () => {
    expect(sanitizeBookingStartTimes(null)).toEqual([]);
  });
});

describe('bookingStartTimesToMinutes / minutesToBookingStartTime', () => {
  it('round-trips a time of day', () => {
    expect(bookingStartTimesToMinutes(['09:20', '13:45'])).toEqual([560, 825]);
    expect(minutesToBookingStartTime(560)).toBe('09:20');
    expect(minutesToBookingStartTime(825)).toBe('13:45');
  });

  it('clamps out-of-range minutes into the day', () => {
    expect(minutesToBookingStartTime(-30)).toBe('00:00');
    expect(minutesToBookingStartTime(24 * 60)).toBe('23:59');
  });
});

describe('usesFixedStartTimes', () => {
  it('is true only when at least one valid time survives sanitising', () => {
    expect(usesFixedStartTimes(['09:20'])).toBe(true);
    expect(usesFixedStartTimes([])).toBe(false);
    expect(usesFixedStartTimes(['nope'])).toBe(false);
    expect(usesFixedStartTimes(null)).toBe(false);
  });
});

describe('normalizeBookingStartForStorage', () => {
  it('collapses a full-grid restriction to null', () => {
    expect(normalizeBookingStartForStorage(15, [0, 15, 30, 45])).toMatchObject({
      booking_interval_minutes: 15,
      booking_minute_marks: null,
    });
  });

  it('collapses an empty restriction to null', () => {
    expect(normalizeBookingStartForStorage(15, []).booking_minute_marks).toBeNull();
  });

  it('keeps a genuine subset of the grid', () => {
    expect(normalizeBookingStartForStorage(15, [0, 30]).booking_minute_marks).toEqual([0, 30]);
  });

  it('collapses an empty fixed-time list to null so the grid takes over', () => {
    expect(normalizeBookingStartForStorage(15, null, []).booking_start_times).toBeNull();
    expect(normalizeBookingStartForStorage(15, null, ['bad']).booking_start_times).toBeNull();
  });

  it('stores fixed times sorted, and keeps the interval so switching back restores it', () => {
    expect(normalizeBookingStartForStorage(20, [0, 20], ['13:45', '09:20'])).toEqual({
      booking_interval_minutes: 20,
      booking_minute_marks: [0, 20],
      booking_start_times: ['09:20', '13:45'],
    });
  });
});

describe('describeBookingStartOffsets / describeBookingStartTimes', () => {
  it('renders offsets past the hour', () => {
    expect(describeBookingStartOffsets([0, 5, 10])).toBe(':00, :05, :10');
  });

  it('renders fixed times on a 12-hour clock', () => {
    expect(describeBookingStartTimes(['09:20', '11:30', '13:45'])).toBe('9:20am, 11:30am, 1:45pm');
  });

  it('renders midnight and noon as 12', () => {
    expect(describeBookingStartTimes(['00:05', '12:00'])).toBe('12:05am, 12:00pm');
  });
});

describe('findTooCloseStartTimes', () => {
  it('finds the first pair closer together than one appointment', () => {
    expect(findTooCloseStartTimes(['09:00', '09:20', '11:00'], 30)).toEqual({
      earlier: '09:00',
      later: '09:20',
    });
  });

  it('is null when every gap fits the appointment', () => {
    expect(findTooCloseStartTimes(['09:00', '09:30', '10:00'], 30)).toBeNull();
  });

  it('compares in chronological order regardless of input order', () => {
    expect(findTooCloseStartTimes(['11:00', '09:20', '09:00'], 30)).toEqual({
      earlier: '09:00',
      later: '09:20',
    });
  });

  it('says nothing when the span is unknown', () => {
    expect(findTooCloseStartTimes(['09:00', '09:20'], 0)).toBeNull();
    expect(findTooCloseStartTimes(['09:00', '09:20'], Number.NaN)).toBeNull();
  });
});

describe('bookingStartFingerprint', () => {
  it('is stable across equivalent configurations', () => {
    // A full-grid restriction and no restriction normalise to the same thing.
    expect(bookingStartFingerprint(15, [0, 15, 30, 45], null)).toBe(
      bookingStartFingerprint(15, null, null),
    );
    // Fixed times differing only in order are the same configuration.
    expect(bookingStartFingerprint(15, null, ['13:45', '09:20'])).toBe(
      bookingStartFingerprint(15, null, ['09:20', '13:45']),
    );
  });

  it('changes when the mode changes', () => {
    expect(bookingStartFingerprint(15, null, ['09:20'])).not.toBe(
      bookingStartFingerprint(15, null, null),
    );
  });

  it('changes when the interval changes even while fixed times are set', () => {
    // The interval is still stored, so switching back must restore it.
    expect(bookingStartFingerprint(20, null, ['09:20'])).not.toBe(
      bookingStartFingerprint(15, null, ['09:20']),
    );
  });
});
