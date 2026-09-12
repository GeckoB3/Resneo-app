/**
 * R35-3 (app half) — what the app says when the scheduling validator refuses an
 * edit because the calendar does not offer the booking's service.
 */
import {
  SERVICE_NOT_ON_CALENDAR_REASON,
  explainModificationRefusal,
} from '@/lib/booking/modification-refusal';

describe('explainModificationRefusal', () => {
  it('explains a booking left behind on its own calendar', () => {
    expect(
      explainModificationRefusal(SERVICE_NOT_ON_CALENDAR_REASON, {
        sameCalendar: true,
        calendarName: 'Chair 1',
        serviceName: 'Cut and finish',
      }),
    ).toBe(
      'Chair 1 no longer offers Cut and finish, so this booking cannot be moved while it stays there. ' +
        'Add Cut and finish back to Chair 1, or move the booking to a calendar that offers it.',
    );
  });

  it('explains a move ONTO a calendar that does not offer the service', () => {
    expect(
      explainModificationRefusal(SERVICE_NOT_ON_CALENDAR_REASON, {
        sameCalendar: false,
        calendarName: 'Chair 2',
        serviceName: 'Colour',
      }),
    ).toBe(
      'Chair 2 does not offer Colour. ' +
        'Move the booking to a calendar that offers it, or add Colour to Chair 2 first.',
    );
  });

  it('reads as a sentence when no names are to hand', () => {
    expect(
      explainModificationRefusal(SERVICE_NOT_ON_CALENDAR_REASON, {
        sameCalendar: true,
        calendarName: '  ',
        serviceName: null,
      }),
    ).toBe(
      'This calendar no longer offers this service, so this booking cannot be moved while it stays there. ' +
        'Add the service back to the calendar, or move the booking to a calendar that offers it.',
    );
    expect(explainModificationRefusal(SERVICE_NOT_ON_CALENDAR_REASON, { sameCalendar: false })).toBe(
      'That calendar does not offer this service. ' +
        'Move the booking to a calendar that offers it, or add the service to the calendar first.',
    );
  });

  it('leaves every other refusal to the server wording', () => {
    const context = { sameCalendar: true, calendarName: 'Chair 1', serviceName: 'Cut' };
    expect(explainModificationRefusal('Staff not available', context)).toBeNull();
    expect(explainModificationRefusal('Conflicts with a break', context)).toBeNull();
    expect(explainModificationRefusal('That time is already booked', context)).toBeNull();
    expect(explainModificationRefusal(null, context)).toBeNull();
    expect(explainModificationRefusal(undefined, context)).toBeNull();
    expect(explainModificationRefusal('', context)).toBeNull();
  });
});
