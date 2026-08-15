/**
 * The client half of web's C8 gate: which calendars a staff member may move a
 * booking onto.
 *
 * These cases exist because the server's version is the authority and the two
 * must agree — a client rule that is stricter blocks work the server allows, and
 * one that is looser puts the refusal back after the gesture, which is the whole
 * problem R16-1 set out to fix. Every expectation below names the line of
 * `requireManagedCalendarAccess` it mirrors.
 */
import {
  canStaffUseCalendar,
  filterToUsableCalendars,
} from '@/lib/calendar/managed-calendars';

const CAL_A = 'cal-a';
const CAL_B = 'cal-b';

describe('canStaffUseCalendar', () => {
  it('lets an admin onto any calendar, including one not assigned to them', () => {
    // Server: the role is checked before the id (`venue-auth.ts:423`), and
    // `requireManagedCalendarIds` returns an EMPTY list for an admin rather than
    // their calendars — so an admin must never be measured against that list.
    expect(
      canStaffUseCalendar({ role: 'admin', managedCalendarIds: [] }, CAL_B),
    ).toBe(true);
  });

  it('lets a non-admin onto a calendar assigned to them', () => {
    expect(
      canStaffUseCalendar({ role: 'staff', managedCalendarIds: [CAL_A] }, CAL_A),
    ).toBe(true);
  });

  it('refuses a non-admin a colleague’s calendar', () => {
    expect(
      canStaffUseCalendar({ role: 'staff', managedCalendarIds: [CAL_A] }, CAL_B),
    ).toBe(false);
  });

  it('refuses a non-admin with no assigned calendars', () => {
    // Server: `requireManagedCalendarIds` returns NO_ASSIGNED_CALENDARS_ERROR on
    // an empty list — an empty scope is not an allow-all.
    expect(canStaffUseCalendar({ role: 'staff', managedCalendarIds: [] }, CAL_A)).toBe(
      false,
    );
    expect(
      canStaffUseCalendar({ role: 'staff', managedCalendarIds: undefined }, CAL_A),
    ).toBe(false);
  });

  it('fails closed on a missing target calendar', () => {
    // Server: `if (!calendarId) return { ok: false }` is the FIRST line, before
    // any scope is loaded. A move with no destination is not the permissive case.
    expect(canStaffUseCalendar({ role: 'staff', managedCalendarIds: [CAL_A] }, null)).toBe(
      false,
    );
    expect(
      canStaffUseCalendar({ role: 'staff', managedCalendarIds: [CAL_A] }, undefined),
    ).toBe(false);
    expect(canStaffUseCalendar({ role: 'staff', managedCalendarIds: [CAL_A] }, '')).toBe(
      false,
    );
  });

  it('allows the move while the staff profile is still loading', () => {
    // The ONE deliberate divergence from the server, and it only goes one way:
    // an unknown role is optimistic. Refusing here would block admins for the
    // first moments after launch, and the server still runs the real check — so
    // being wrong costs a 403, where the pessimistic version costs a broken
    // gesture for everyone.
    expect(canStaffUseCalendar({ role: undefined, managedCalendarIds: undefined }, CAL_B)).toBe(
      true,
    );
  });
});

describe('filterToUsableCalendars', () => {
  const calendars = [{ id: CAL_A }, { id: CAL_B }];

  it('narrows a non-admin to their assigned calendars', () => {
    expect(
      filterToUsableCalendars({ role: 'staff', managedCalendarIds: [CAL_B] }, calendars),
    ).toEqual([{ id: CAL_B }]);
  });

  it('leaves the list intact for an admin and while the profile loads', () => {
    expect(
      filterToUsableCalendars({ role: 'admin', managedCalendarIds: [] }, calendars),
    ).toEqual(calendars);
    expect(
      filterToUsableCalendars({ role: undefined, managedCalendarIds: undefined }, calendars),
    ).toEqual(calendars);
  });

  it('returns a copy rather than the caller’s array', () => {
    // The admin path used to be a plain `return calendars`, which handed a
    // memoised catalogue array back out to be sorted in place by a caller.
    const result = filterToUsableCalendars(
      { role: 'admin', managedCalendarIds: [] },
      calendars,
    );
    expect(result).not.toBe(calendars);
  });

  it('empties the list for a non-admin with nothing assigned', () => {
    expect(
      filterToUsableCalendars({ role: 'staff', managedCalendarIds: [] }, calendars),
    ).toEqual([]);
  });
});
