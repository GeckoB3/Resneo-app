/**
 * A collective booking on a calendar guests cannot book (web `staffCalendarNotice`, 2026-10-28):
 * the notes for the chosen calendar and services, each once, and whether its venue can take cards.
 */
import { NO_STAFF_CALENDAR_NOTICE, staffCalendarNotice } from './staff-calendar-notice';

const catalog = {
  practitioners: [
    {
      id: 'cal-m',
      services: [
        {
          id: 'cut',
          staff_note: 'Card payments are not set up at Light 3, so take payment in person.',
          staff_exclusion: 'payments' as const,
        },
        {
          id: 'colour',
          staff_note: 'Card payments are not set up at Light 3, so take payment in person.',
          staff_exclusion: 'payments' as const,
        },
        { id: 'brow', staff_note: 'Forms are switched off at Light 3.', staff_exclusion: 'forms' as const },
        { id: 'plain' },
      ],
    },
    { id: 'cal-a', services: [{ id: 'cut' }] },
  ],
};

describe('staffCalendarNotice', () => {
  it("gives the calendar's note for the service, and that it cannot take cards", () => {
    expect(staffCalendarNotice(catalog, 'cal-m', ['cut'])).toEqual({
      notes: ['Card payments are not set up at Light 3, so take payment in person.'],
      noCards: true,
    });
  });

  it('lists each note once across a visit, and no cards when any service says so', () => {
    expect(staffCalendarNotice(catalog, 'cal-m', ['brow', 'cut', 'colour'])).toEqual({
      notes: ['Forms are switched off at Light 3.', 'Card payments are not set up at Light 3, so take payment in person.'],
      noCards: true,
    });
  });

  it('has a note but takes cards when the reason is not payments', () => {
    expect(staffCalendarNotice(catalog, 'cal-m', ['brow'])).toEqual({
      notes: ['Forms are switched off at Light 3.'],
      noCards: false,
    });
  });

  it('says nothing for another calendar, a plain service, or no catalogue', () => {
    expect(staffCalendarNotice(catalog, 'cal-a', ['cut'])).toBe(NO_STAFF_CALENDAR_NOTICE);
    expect(staffCalendarNotice(catalog, 'cal-m', ['plain'])).toBe(NO_STAFF_CALENDAR_NOTICE);
    expect(staffCalendarNotice(undefined, 'cal-m', ['cut'])).toBe(NO_STAFF_CALENDAR_NOTICE);
    expect(staffCalendarNotice(catalog, null, ['cut'])).toBe(NO_STAFF_CALENDAR_NOTICE);
  });
});
