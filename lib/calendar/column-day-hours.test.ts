import { resolveColumnDayHours } from '@/lib/calendar/column-day-hours';
import type { VenueDayHours } from '@/lib/calendar/venue-closures';

const MONDAY = '2026-09-14';
const NINE_TO_FIVE = { '1': [{ start: '09:00', end: '17:00' }] };
const venueNineToFive: VenueDayHours = { kind: 'open', periods: [{ start: 540, end: 1020 }] };

describe('resolveColumnDayHours', () => {
  it('hands the grids the weekly hours as the feed would', () => {
    const out = resolveColumnDayHours({ working_hours: NINE_TO_FIVE }, MONDAY, venueNineToFive);
    expect(out.workingHours).toEqual([{ start: '09:00', end: '17:00' }]);
    expect(out.amended).toBe(false);
    expect(out.venueHours).toEqual(venueNineToFive);
  });

  it('follows an amended day and widens the venue window for that column only', () => {
    // 09:00–17:00 venue; the calendar amended to 06:00–22:00: the column works
    // 06:00–22:00, and its venue shading lifts over those minutes. Another
    // column on the same day keeps the venue's 09:00–17:00 window.
    const out = resolveColumnDayHours(
      {
        working_hours: NINE_TO_FIVE,
        availability_exceptions: { [MONDAY]: { periods: [{ start: '06:00', end: '22:00' }] } },
      },
      MONDAY,
      venueNineToFive,
    );
    expect(out.workingHours).toEqual([{ start: '06:00', end: '22:00' }]);
    expect(out.amended).toBe(true);
    expect(out.venueHours).toEqual({ kind: 'open', periods: [{ start: 360, end: 1320 }] });
    expect(out.venueOpenRanges).toEqual([{ start: 360, end: 1320 }]);

    const other = resolveColumnDayHours({ working_hours: NINE_TO_FIVE }, MONDAY, venueNineToFive);
    expect(other.venueHours).toEqual(venueNineToFive);
  });

  it('opens a column on a day the venue is closed when its hours were amended', () => {
    const out = resolveColumnDayHours(
      { working_hours: NINE_TO_FIVE, availability_exceptions: { [MONDAY]: { periods: [{ start: '10:00', end: '14:00' }] } } },
      MONDAY,
      { kind: 'closed' },
    );
    expect(out.venueHours).toEqual({ kind: 'open', periods: [{ start: 600, end: 840 }] });
  });

  it('does not widen the venue window for a weekly template that merely runs past it', () => {
    const out = resolveColumnDayHours(
      { working_hours: { '1': [{ start: '08:00', end: '18:00' }] } },
      MONDAY,
      venueNineToFive,
    );
    expect(out.workingHours).toEqual([{ start: '08:00', end: '18:00' }]);
    expect(out.venueHours).toEqual(venueNineToFive);
  });

  it('closes the day for a closed override or a day off, and keeps the feed for an unconfigured column', () => {
    expect(
      resolveColumnDayHours(
        { working_hours: NINE_TO_FIVE, availability_exceptions: { [MONDAY]: { closed: true } } },
        MONDAY,
        venueNineToFive,
      ).workingHours,
    ).toEqual([]);
    expect(
      resolveColumnDayHours({ working_hours: NINE_TO_FIVE, days_off: ['mon'] }, MONDAY, venueNineToFive).workingHours,
    ).toEqual([]);
    expect(resolveColumnDayHours({}, MONDAY, venueNineToFive).workingHours).toBeNull();
    expect(resolveColumnDayHours(null, MONDAY, venueNineToFive).workingHours).toBeNull();
  });
});
