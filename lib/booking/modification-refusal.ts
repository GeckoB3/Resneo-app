/**
 * Plain wording for the service↔calendar refusal that the booking PATCH and its
 * dry-run answer with.
 *
 * Since web #194 a calendar may stop offering a service while the bookings
 * already taken stay on it ("leave them where they are"). The scheduling
 * validator still requires a live service→calendar link for ANY schedule edit —
 * `getOfferedAppointmentServicesForPractitioner` has no "no links means
 * everything" fallback, and none of the outside-hours, breaks or overlap
 * overrides relaxes it — so a booking left behind refuses every move with
 * "Service not available with this staff member", even a ten-minute drag on the
 * column it is already on. The engine's wording then reads as a mistake by the
 * staff member rather than a consequence of a setting they changed last week.
 *
 * The gate is web-side and is handed back in `Docs/R35_WEB_HANDOVER.md` (R35-3).
 * This is what the app says meanwhile, and it stays right afterwards for the
 * case the refusal is genuinely about: moving a booking ONTO a calendar that
 * does not offer its service.
 *
 * @see C:\Resneo\src\lib\booking\validate-appointment-modification.ts (:203)
 * @see C:\Resneo\src\lib\availability\appointment-engine.ts (:493)
 */

/** The engine's own words, matched exactly. */
export const SERVICE_NOT_ON_CALENDAR_REASON = 'Service not available with this staff member';

export interface ModificationRefusalContext {
  /**
   * True when the edit leaves the booking on the calendar it already sits on —
   * i.e. nothing is being reassigned, so "not available with this staff member"
   * cannot be a choice the staff member just made.
   */
  sameCalendar: boolean;
  /** The calendar the edit targets, when its name is to hand. */
  calendarName?: string | null;
  serviceName?: string | null;
}

function named(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/**
 * A sentence that says what actually happened, or null when the reason is one
 * the app has nothing better to say about — callers fall back to the server's
 * own message, which is right for every other refusal.
 */
export function explainModificationRefusal(
  reason: string | null | undefined,
  context: ModificationRefusalContext,
): string | null {
  if (reason?.trim() !== SERVICE_NOT_ON_CALENDAR_REASON) return null;

  // Two fallbacks each: a name reads the same everywhere, "this calendar" does
  // not read the same as the subject of a sentence and as its object.
  const calendar = named(context.calendarName, context.sameCalendar ? 'This calendar' : 'That calendar');
  const calendarAgain = named(context.calendarName, 'the calendar');
  const service = named(context.serviceName, 'this service');
  const serviceAgain = named(context.serviceName, 'the service');

  if (context.sameCalendar) {
    return (
      `${calendar} no longer offers ${service}, so this booking cannot be moved while it stays there. ` +
      `Add ${serviceAgain} back to ${calendarAgain}, or move the booking to a calendar that offers it.`
    );
  }
  return (
    `${calendar} does not offer ${service}. ` +
    `Move the booking to a calendar that offers it, or add ${serviceAgain} to ${calendarAgain} first.`
  );
}
