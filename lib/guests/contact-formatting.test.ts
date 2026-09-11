import { format, subDays } from 'date-fns';

import {
  bookingsOnFileLabel,
  formatCalendarDayShort,
  formatNextBookingSummary,
  formatRelativeVisitDate,
  visitCountLabel,
} from '@/lib/guests/contact-formatting';

// A Monday, so the weekday in the expected label is not a coincidence.
const TODAY = '2026-09-07';

describe('formatCalendarDayShort', () => {
  it('names today and tomorrow by the venue day it is given', () => {
    expect(formatCalendarDayShort('2026-09-07', TODAY)).toBe('Today');
    expect(formatCalendarDayShort('2026-09-08', TODAY)).toBe('Tomorrow');
  });

  it('writes any other day as the web does', () => {
    expect(formatCalendarDayShort('2026-09-14', TODAY)).toBe('Mon 14 Sep');
    expect(formatCalendarDayShort('2026-03-01', TODAY)).toBe('Sun 1 Mar');
  });

  it('shows a dash when there is no date', () => {
    expect(formatCalendarDayShort(null, TODAY)).toBe('—');
    expect(formatCalendarDayShort(undefined, TODAY)).toBe('—');
  });
});

describe('formatNextBookingSummary', () => {
  it('puts the time after the day, seconds trimmed', () => {
    expect(formatNextBookingSummary('2026-09-07', '14:30:00', TODAY)).toBe('Today 14:30');
    expect(formatNextBookingSummary('2026-09-14', '09:00', TODAY)).toBe('Mon 14 Sep 09:00');
  });

  it('is the day alone without a time, and null without a date', () => {
    expect(formatNextBookingSummary('2026-09-08', null, TODAY)).toBe('Tomorrow');
    expect(formatNextBookingSummary(null, '10:00', TODAY)).toBeNull();
  });
});

describe('formatRelativeVisitDate', () => {
  it('counts back from now', () => {
    const tenDaysAgo = format(subDays(new Date(), 10), 'yyyy-MM-dd');
    expect(formatRelativeVisitDate(tenDaysAgo)).toBe('10 days ago');
  });

  it('shows a dash when there is no date', () => {
    expect(formatRelativeVisitDate(null)).toBe('—');
  });
});

describe('visitCountLabel', () => {
  it('reads "New" until the first visit', () => {
    expect(visitCountLabel(0)).toBe('New');
  });

  it('counts visits', () => {
    expect(visitCountLabel(1)).toBe('1 visit');
    expect(visitCountLabel(4)).toBe('4 visits');
  });
});

describe('bookingsOnFileLabel', () => {
  it('uses the venue’s word for a booking', () => {
    expect(bookingsOnFileLabel(4, 'Appointment')).toBe('4 appointments on file');
    expect(bookingsOnFileLabel(1, 'Reservation')).toBe('1 reservation on file');
  });

  it('says so when there is no history', () => {
    expect(bookingsOnFileLabel(0, 'Appointment')).toBe('No past appointments yet');
  });
});
