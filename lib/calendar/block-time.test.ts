import {
  blockSavedMessage,
  defaultBlockCalendarId,
  defaultBlockEnd,
  defaultBlockStart,
} from '@/lib/calendar/block-time';

describe('defaultBlockEnd', () => {
  it('runs an hour on from the start', () => {
    expect(defaultBlockEnd('09:30')).toBe('10:30');
  });

  it('stays inside the day', () => {
    expect(defaultBlockEnd('23:30')).toBe('23:59');
  });
});

describe('defaultBlockStart', () => {
  it('starts at 09:00 on another day', () => {
    expect(defaultBlockStart('2026-11-04', '2026-11-01', 14 * 60)).toBe('09:00');
  });

  it('starts at the next half hour today', () => {
    expect(defaultBlockStart('2026-11-01', '2026-11-01', 14 * 60 + 10)).toBe('14:30');
    expect(defaultBlockStart('2026-11-01', '2026-11-01', 14 * 60 + 30)).toBe('15:00');
  });

  it('leaves room for the block late in the evening', () => {
    expect(defaultBlockStart('2026-11-01', '2026-11-01', 23 * 60 + 45)).toBe('23:00');
  });
});

describe('blockSavedMessage', () => {
  const block = { calendarName: 'Andrew', date: '2026-11-04', startTime: '13:00', endTime: '14:00' };

  it('says who, which day and when', () => {
    expect(blockSavedMessage({ ...block, edited: false })).toBe('Time blocked for Andrew on Wed 4 Nov, 13:00 to 14:00');
  });

  it('says so when a block was changed', () => {
    expect(blockSavedMessage({ ...block, edited: true })).toBe('Block updated for Andrew on Wed 4 Nov, 13:00 to 14:00');
  });

  it('leaves the name out if it is not known', () => {
    expect(blockSavedMessage({ ...block, calendarName: null, edited: false })).toBe('Time blocked on Wed 4 Nov, 13:00 to 14:00');
  });
});

describe('defaultBlockCalendarId', () => {
  const calendars = [{ id: 'mine' }, { id: 'also-mine' }];

  it('starts on the calendar in view', () => {
    expect(defaultBlockCalendarId(calendars, 'also-mine')).toBe('also-mine');
  });

  it('falls back to the first they may block when the one in view is not theirs', () => {
    expect(defaultBlockCalendarId(calendars, 'theirs')).toBe('mine');
    expect(defaultBlockCalendarId(calendars, null)).toBe('mine');
  });

  it('has none to offer when they may block nothing', () => {
    expect(defaultBlockCalendarId([], 'theirs')).toBeNull();
  });
});
