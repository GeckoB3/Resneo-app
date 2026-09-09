/**
 * The schedule preview's day summary honours a calendar's amended hours
 * (`availability_exceptions`, web #187): an amended day replaces the weekly
 * shape and the period, a closed override closes the day, a day off does not
 * reopen an amended day, and leave still wins.
 */
import { summariseScheduleDay } from '@/components/availability/SchedulePreviewCalendar';

const WEEKLY = { mon: [{ start: '09:00', end: '17:00' }] };
const OPEN_ALL_WEEK = {
  '0': { periods: [{ open: '08:00', close: '20:00' }] },
  '1': { periods: [{ open: '08:00', close: '20:00' }] },
  '2': { periods: [{ open: '08:00', close: '20:00' }] },
  '3': { periods: [{ open: '08:00', close: '20:00' }] },
  '4': { periods: [{ open: '08:00', close: '20:00' }] },
  '5': { periods: [{ open: '08:00', close: '20:00' }] },
  '6': { periods: [{ open: '08:00', close: '20:00' }] },
} as never;

const MONDAY = '2026-09-14';
const SUNDAY = '2026-09-13';

function summarise(over: Partial<Parameters<typeof summariseScheduleDay>[0]> = {}) {
  return summariseScheduleDay({
    date: MONDAY,
    baseHours: WEEKLY,
    schedule: null,
    daysOff: [],
    venueOpeningHours: OPEN_ALL_WEEK,
    leave: [],
    ...over,
  });
}

describe('summariseScheduleDay with amended hours', () => {
  it('reads the weekly hours when there is no override', () => {
    expect(summarise()).toEqual(expect.objectContaining({ text: '09:00–17:00', reason: 'base' }));
  });

  it('replaces the weekly hours with the amended ones, and carries the note', () => {
    expect(
      summarise({
        overrides: { [MONDAY]: { periods: [{ start: '12:00', end: '15:00' }], reason: 'Dentist' } },
      }),
    ).toEqual(
      expect.objectContaining({ text: '12:00–15:00', reason: 'amended', overrideReason: 'Dentist' }),
    );
  });

  it('opens a day the calendar does not normally work', () => {
    expect(
      summarise({
        date: SUNDAY,
        overrides: { [SUNDAY]: { periods: [{ start: '10:00', end: '14:00' }] } },
      }),
    ).toEqual(expect.objectContaining({ text: '10:00–14:00', reason: 'amended' }));
  });

  it('closes an amended-closed day, and a day off does not reopen an amended day', () => {
    expect(summarise({ overrides: { [MONDAY]: { closed: true } } })).toEqual(
      expect.objectContaining({ text: 'Closed', reason: 'no-hours' }),
    );
    expect(
      summarise({
        daysOff: ['monday'],
        overrides: { [MONDAY]: { periods: [{ start: '12:00', end: '15:00' }] } },
      }),
    ).toEqual(expect.objectContaining({ reason: 'amended' }));
  });

  it('still lets leave win', () => {
    expect(
      summarise({
        leave: [{ start_date: MONDAY, end_date: MONDAY }],
        overrides: { [MONDAY]: { periods: [{ start: '12:00', end: '15:00' }] } },
      }),
    ).toEqual(expect.objectContaining({ text: 'Leave', reason: 'leave' }));
  });
});
