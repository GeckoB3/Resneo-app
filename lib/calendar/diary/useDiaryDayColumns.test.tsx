import { renderHook } from '@testing-library/react-native';

import { useDiaryDayColumns, type DiaryDayColumnsInput } from '@/lib/calendar/diary/useDiaryDayColumns';
import type { DiaryGridQuery } from '@/lib/calendar/diary/types';
import type { DiaryScope } from '@/lib/roles/roles';
import type { CalendarGridBooking, CalendarGridResponse } from '@/types/calendar-grid';
import type { Practitioner } from '@/types/practitioner';

const ANCHOR = '2026-11-27';
const alex = { id: 'cal-1', name: 'Alex', is_active: true } as Practitioner;
const jo = { id: 'cal-2', name: 'Jo', is_active: true } as Practitioner;
const paused = { id: 'cal-3', name: 'Marcus', is_active: false } as Practitioner;

const grid: CalendarGridResponse = {
  calendars: [
    {
      calendarId: 'cal-1',
      calendarName: 'Alex',
      dates: [
        {
          date: ANCHOR,
          workingHours: [{ start: '09:00', end: '17:00' }],
          bookings: [{ id: 'b1' } as CalendarGridBooking],
          sessions: [],
          blocks: [],
        },
      ],
    },
  ],
} as unknown as CalendarGridResponse;

function input(extra: Partial<DiaryDayColumnsInput> = {}): DiaryDayColumnsInput {
  return {
    isWideDay: true,
    visibleIds: null,
    practitioners: [alex, jo],
    linkedVenues: [],
    anchor: ANCHOR,
    isAllView: false,
    workingHoursOnly: false,
    leavePeriods: [],
    openingHours: null,
    venueWideBlocks: undefined,
    showAllCalendars: true,
    gridQuery: { data: grid } as unknown as DiaryGridQuery,
    getDayBlocks: () => [],
    scheduleByCalendarDate: new Map(),
    diary: { allows: () => true } as unknown as DiaryScope,
    staffCollective: null,
    ...extra,
  };
}

async function columns(extra: Partial<DiaryDayColumnsInput> = {}) {
  const { result } = await renderHook(() => useDiaryDayColumns(input(extra)));
  return result.current.allColumnsForDay;
}

describe('useDiaryDayColumns', () => {
  it('draws every calendar with its own day', async () => {
    const cols = await columns();
    expect(cols.map((c) => c.calendarId)).toEqual(['cal-1', 'cal-2']);
    expect(cols[0]!.bookings.map((b) => b.id)).toEqual(['b1']);
    expect(cols[1]!.bookings).toEqual([]);
  });

  it('draws nothing when the side-by-side grid is not showing', async () => {
    expect(await columns({ showAllCalendars: false })).toEqual([]);
  });

  it('keeps only the columns picked on a wide day', async () => {
    const cols = await columns({ visibleIds: ['cal-2'] });
    expect(cols.map((c) => c.calendarId)).toEqual(['cal-2']);
  });

  it('shows everyone when a stale filter would leave the grid blank', async () => {
    const cols = await columns({ visibleIds: ['gone'] });
    expect(cols.map((c) => c.calendarId)).toEqual(['cal-1', 'cal-2']);
  });

  it('marks a paused calendar and takes no drops on it', async () => {
    const cols = await columns({ practitioners: [alex, paused] });
    expect(cols[1]).toMatchObject({ calendarId: 'cal-3', badge: 'Paused', acceptsDrops: false });
  });

  it('makes someone else’s column look only for a View only person', async () => {
    const diary = { allows: (id: string) => id === 'cal-1' } as unknown as DiaryScope;
    const cols = await columns({ diary });
    expect(cols[0]!.readOnly).toBeUndefined();
    expect(cols[1]).toMatchObject({ readOnly: true, acceptsDrops: false });
  });
});
