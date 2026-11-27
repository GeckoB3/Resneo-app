import { renderHook } from '@testing-library/react-native';

import type { DiaryGridQuery } from '@/lib/calendar/diary/types';
import { useDiaryWeekData, type DiaryWeekDataInput } from '@/lib/calendar/diary/useDiaryWeekData';
import type { CalendarGridBooking, CalendarGridResponse } from '@/types/calendar-grid';
import type { LinkedVenueCalendar } from '@/types/linked-venues';
import type { Practitioner } from '@/types/practitioner';

// Monday 23 to Sunday 29 November 2026.
const DAYS = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
const alex = { id: 'cal-1', name: 'Alex', is_active: true } as Practitioner;
const marcus = { id: 'cal-3', name: 'Marcus', is_active: false } as Practitioner;

const partner = {
  venueId: 'v2',
  venueName: 'Partner Studio',
  practitioners: [{ id: 'p1', name: 'Jenny' }],
  bookings: [
    { id: 'l1', bookingDate: '2026-11-24', practitionerId: 'p1', status: 'Booked' },
    { id: 'l2', bookingDate: '2026-11-24', practitionerId: 'p1', status: 'Booked' },
    { id: 'l3', bookingDate: '2026-11-24', practitionerId: 'p1', status: 'No-Show' },
  ],
} as unknown as LinkedVenueCalendar;

const grid = {
  calendars: [
    {
      calendarId: 'cal-1',
      calendarName: 'Alex',
      dates: [{ date: '2026-11-25', workingHours: [], bookings: [{ id: 'b1' } as CalendarGridBooking], sessions: [], blocks: [] }],
    },
  ],
} as unknown as CalendarGridResponse;

function input(extra: Partial<DiaryWeekDataInput> = {}): DiaryWeekDataInput {
  return {
    scope: 'week',
    week: { days: DAYS },
    today: '2026-11-27',
    effectiveId: 'cal-1',
    practitioners: [alex, marcus],
    linkedVenues: [partner],
    gridQuery: { data: grid } as unknown as DiaryGridQuery,
    getDayBlocks: () => [],
    scheduleByCalendarDate: new Map(),
    openingHours: null,
    venueWideBlocks: undefined,
    leavePeriods: [],
    ...extra,
  };
}

describe('useDiaryWeekData', () => {
  it('builds seven day columns for the selected calendar', async () => {
    const { result } = await renderHook(() => useDiaryWeekData(input()));
    const { weekColumns } = result.current;
    expect(weekColumns.map((c) => c.date)).toEqual(DAYS);
    expect(weekColumns[0]).toMatchObject({ weekdayLabel: 'Mon', dayNumber: '23', isWeekend: false });
    expect(weekColumns[4]!.isToday).toBe(true);
    expect(weekColumns[5]!.isWeekend).toBe(true);
    expect(weekColumns[2]!.bookings.map((b) => b.id)).toEqual(['b1']);
  });

  it('lists our calendars, then each linked calendar, in the matrix', async () => {
    const { result } = await renderHook(() => useDiaryWeekData(input()));
    expect(result.current.weekMatrixCalendars).toEqual([
      { id: 'cal-1', name: 'Alex' },
      { id: 'cal-3', name: 'Marcus (paused)' },
      { id: 'v2:p1', name: 'Jenny', linked: true, venueName: 'Partner Studio' },
    ]);
    expect(result.current.weekMatrixDays).toHaveLength(7);
  });

  it('counts linked bookings per calendar and day, leaving out No-shows', async () => {
    const { result } = await renderHook(() => useDiaryWeekData(input()));
    expect([...result.current.weekMatrixLinkedCounts]).toEqual([['v2:p1|2026-11-24', 2]]);
  });

  it('builds nothing outside the week', async () => {
    const { result } = await renderHook(() => useDiaryWeekData(input({ scope: 'day' })));
    expect(result.current.weekColumns).toEqual([]);
    expect(result.current.weekMatrixDays).toEqual([]);
    expect(result.current.weekMatrixLinkedCounts.size).toBe(0);
  });
});
