import {
  appointmentCalendarsOf,
  isResourceCalendar,
} from '@/lib/calendar/schedule-calendars';

describe('isResourceCalendar', () => {
  it('recognises a resource column', () => {
    expect(isResourceCalendar({ calendar_type: 'resource' })).toBe(true);
  });

  it('treats a missing or null type as a plain practitioner calendar', () => {
    // The column is nullable and older rows predate it, so the ABSENCE of a
    // type must never read as "resource" — that would silently hide working
    // calendars from the leave and blocks controls.
    expect(isResourceCalendar({})).toBe(false);
    expect(isResourceCalendar({ calendar_type: null })).toBe(false);
    expect(isResourceCalendar(undefined)).toBe(false);
    expect(isResourceCalendar(null)).toBe(false);
  });

  it('does not treat other calendar types as resources', () => {
    expect(isResourceCalendar({ calendar_type: 'practitioner' })).toBe(false);
    expect(isResourceCalendar({ calendar_type: 'class' })).toBe(false);
    expect(isResourceCalendar({ calendar_type: 'team' })).toBe(false);
  });
});

describe('appointmentCalendarsOf', () => {
  const calendars = [
    { id: 'a', calendar_type: 'practitioner' },
    { id: 'b', calendar_type: 'resource' },
    { id: 'c', calendar_type: null },
    { id: 'd' },
    { id: 'e', calendar_type: 'resource' },
  ];

  it('drops every resource and keeps the rest in order', () => {
    expect(appointmentCalendarsOf(calendars).map((c) => c.id)).toEqual(['a', 'c', 'd']);
  });

  it('leaves the input untouched', () => {
    const before = calendars.length;
    appointmentCalendarsOf(calendars);
    expect(calendars).toHaveLength(before);
  });

  it('handles a roster with no resources at all', () => {
    const plain = [
      { id: 'a', calendar_type: 'practitioner' },
      { id: 'b', calendar_type: null },
    ];
    expect(appointmentCalendarsOf(plain)).toEqual(plain);
  });

  it('handles a roster of nothing but resources', () => {
    expect(appointmentCalendarsOf([{ id: 'r', calendar_type: 'resource' }])).toEqual([]);
  });
});
