import {
  groupScheduleByCalendarDate,
  isMovableBooking,
  isWideDayViewport,
  localNoon,
  nowMinutesInTz,
  scheduleKey,
} from '@/lib/calendar/diary-screen';
import type { CalendarGridBooking } from '@/types/calendar-grid';
import type { ScheduleBlockDTO } from '@/types/schedule-blocks';

function booking(status: string, extra: Record<string, unknown> = {}): CalendarGridBooking {
  return { id: 'b1', status, ...extra } as unknown as CalendarGridBooking;
}

describe('isMovableBooking', () => {
  it('moves the live statuses', () => {
    for (const status of ['Pending', 'Booked', 'Confirmed', 'Seated']) {
      expect(isMovableBooking(booking(status))).toBe(true);
    }
  });

  it('never moves a finished or cancelled booking', () => {
    for (const status of ['Completed', 'No-Show', 'Cancelled']) {
      expect(isMovableBooking(booking(status))).toBe(false);
    }
  });

  it('never moves a resource booking', () => {
    expect(isMovableBooking(booking('Booked', { resource_id: 'r1' }))).toBe(false);
    expect(isMovableBooking(booking('Booked', { resource_id: null }))).toBe(true);
  });
});

describe('isWideDayViewport', () => {
  it('is wide on a tablet', () => {
    expect(isWideDayViewport(700, 1000)).toBe(true);
  });

  it('is wide on a landscape phone of at least 600', () => {
    expect(isWideDayViewport(650, 380)).toBe(true);
    expect(isWideDayViewport(580, 380)).toBe(false);
  });

  it('is narrow on a portrait phone', () => {
    expect(isWideDayViewport(390, 844)).toBe(false);
  });
});

describe('localNoon', () => {
  it('reads the date as local noon', () => {
    const d = localNoon('2026-11-27');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 10, 27, 12]);
  });
});

describe('nowMinutesInTz', () => {
  afterEach(() => jest.useRealTimers());

  it('reads the wall clock in the venue timezone', () => {
    jest.useFakeTimers({ now: new Date('2026-07-01T09:30:00Z') });
    expect(nowMinutesInTz('Europe/London')).toBe(10 * 60 + 30);
    expect(nowMinutesInTz('UTC')).toBe(9 * 60 + 30);
  });
});

describe('groupScheduleByCalendarDate', () => {
  function dto(extra: Partial<ScheduleBlockDTO>): ScheduleBlockDTO {
    return {
      id: 'ev-1',
      kind: 'event',
      date: '2026-11-27',
      start_time: '10:00',
      end_time: '11:00',
      title: 'Workshop',
      calendar_id: 'cal-1',
      ...extra,
    } as ScheduleBlockDTO;
  }

  it('keys blocks by calendar and date', () => {
    const map = groupScheduleByCalendarDate([
      dto({ id: 'ev-1' }),
      dto({ id: 'ev-2', date: '2026-11-28' }),
      dto({ id: 'ev-3', calendar_id: 'cal-2' }),
    ]);
    expect(map.get(scheduleKey('cal-1', '2026-11-27'))).toHaveLength(1);
    expect(map.get(scheduleKey('cal-1', '2026-11-28'))).toHaveLength(1);
    expect(map.get(scheduleKey('cal-2', '2026-11-27'))).toHaveLength(1);
  });

  it('drops a block with no calendar to draw it on', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const map = groupScheduleByCalendarDate([dto({ calendar_id: null })]);
    expect(map.size).toBe(0);
    log.mockRestore();
  });
});
