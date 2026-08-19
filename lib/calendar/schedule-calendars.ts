/**
 * Which calendars a scheduling control may be pointed at.
 *
 * The Calendar availability screen lists every calendar column, RESOURCES
 * INCLUDED, because a resource is a `unified_calendars` row like any other and
 * its weekly hours are the same `working_hours` column — `/api/venue/resources`
 * only aliases it as `availability_hours` on the way in and out. Excluding them
 * is what forced a second weekly-hours editor to exist.
 *
 * Hours are the ONLY part of the schedule a resource supports. Everything else
 * on that screen has to work on {@link appointmentCalendarsOf} instead:
 *
 *  - **breaks** — the resource engine reads `break_times` from the HOST
 *    calendar row, never the resource's own, so a break stored against a
 *    resource is invisible to every engine;
 *  - **leave / closures** — `POST /api/venue/practitioner-leave` rejects a
 *    resource outright (`requireVenueHostCalendarId` filters them out), and
 *    `GET` 404s on one, which would blank the screen into an error state.
 *
 * Web reaches the same split from the other direction (its `scheduleCalendars`
 * vs `appointmentCalendars`), and defers the resource half of its closures work
 * for exactly these reasons.
 */

/** The only field the split reads — structural, so any calendar row fits. */
export interface CalendarTypeCarrier {
  calendar_type?: string | null;
}

/**
 * Is this a resource column?
 *
 * A missing or null `calendar_type` means a plain practitioner calendar: the
 * column is nullable and older rows predate it, so the absence of a type is
 * never evidence of a resource.
 */
export function isResourceCalendar(calendar: CalendarTypeCarrier | null | undefined): boolean {
  return (calendar?.calendar_type ?? 'practitioner') === 'resource';
}

/** The calendars that take bookings — everything except resources. */
export function appointmentCalendarsOf<T extends CalendarTypeCarrier>(calendars: readonly T[]): T[] {
  return calendars.filter((c) => !isResourceCalendar(c));
}
