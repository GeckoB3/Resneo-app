import {
  RESOURCE_NEEDS_ANOTHER_CALENDAR,
  assignmentsMovingHere,
  planCalendarAssignments,
} from '@/lib/venue/calendar-assignments';

const HERE = 'cal-1';
const OTHER = 'cal-2';

describe('planCalendarAssignments', () => {
  it('moves only what changed, and sends the full service set', () => {
    const plan = planCalendarAssignments({
      calendarId: HERE,
      fallbackCalendarId: OTHER,
      draft: {
        services: new Set(['s1', 's2']),
        classes: new Set(['c-here', 'c-elsewhere']),
        resources: new Set(['r-here']),
        events: new Set([]),
      },
      classes: [
        { id: 'c-here', name: 'Yoga', calendarId: HERE },
        { id: 'c-elsewhere', name: 'Pilates', calendarId: OTHER },
        { id: 'c-none', name: 'Spin', calendarId: null },
      ],
      resources: [{ id: 'r-here', name: 'Room A', calendarId: HERE }],
      events: [{ id: 'e-here', name: 'Gala', calendarId: HERE }],
    });
    expect(plan.serviceIds).toEqual(['s1', 's2']);
    expect(plan.classes).toEqual([{ id: 'c-elsewhere', name: 'Pilates', calendarId: HERE }]);
    expect(plan.resources).toEqual([]);
    expect(plan.events).toEqual([{ id: 'e-here', name: 'Gala', calendarId: null }]);
    expect(plan.error).toBeNull();
  });

  it('moves an unticked resource to another calendar rather than leaving it without one', () => {
    const plan = planCalendarAssignments({
      calendarId: HERE,
      fallbackCalendarId: OTHER,
      draft: { services: new Set(), classes: new Set(), resources: new Set(), events: new Set() },
      classes: [],
      resources: [{ id: 'r-here', name: 'Room A', calendarId: HERE }],
      events: [],
    });
    expect(plan.resources).toEqual([{ id: 'r-here', name: 'Room A', calendarId: OTHER }]);
    expect(plan.error).toBeNull();
  });

  it('refuses to take the only calendar off a resource', () => {
    const plan = planCalendarAssignments({
      calendarId: HERE,
      fallbackCalendarId: null,
      draft: { services: new Set(), classes: new Set(), resources: new Set(), events: new Set() },
      classes: [],
      resources: [{ id: 'r-here', name: 'Room A', calendarId: HERE }],
      events: [],
    });
    expect(plan.resources).toEqual([]);
    expect(plan.error).toBe(RESOURCE_NEEDS_ANOTHER_CALENDAR);
  });

  it('names what a draft would move here from another column', () => {
    const items = [
      { id: 'a', name: 'Here already', calendarId: HERE },
      { id: 'b', name: 'From elsewhere', calendarId: OTHER },
      { id: 'c', name: 'Unassigned', calendarId: null },
    ];
    expect(assignmentsMovingHere(items, new Set(['a', 'b', 'c']), HERE).map((i) => i.name)).toEqual([
      'From elsewhere',
    ]);
  });
});
