/**
 * Whether the new-booking wizard asks for a PERSON before a SERVICE.
 *
 * Port of the entry rule in the web `AppointmentBookingFlow`
 * (`orderingForSession`, resneo#129). The web toggle
 * `staff_first_booking_flow` is not public-only: when a venue turns it on, the
 * staff-facing "New Appointment" form reorders too, alongside the public and
 * collective booking pages. This module is the app's copy of that decision.
 *
 * THE RULE, both sides of the desk: reorder only when the session does not
 * already know the answer to one of the two questions.
 *
 *   - Knows the *what* already (a rebook seeded from a past appointment):
 *     stay service-first, because asking who first would be a step backwards.
 *   - Knows the *who* already (staff tapped an empty slot on someone's calendar
 *     column, so date, time and person are all set): stay service-first,
 *     because the person is no longer a question.
 *
 * Walk-ins are deliberately NOT excluded, matching the web: someone standing at
 * the desk asks for a person as often as for a service, so a walk-in launched
 * from a column still reorders.
 *
 * Web conditions with no equivalent here, recorded so the two can be compared:
 * `editBooking` (the app modifies bookings in a separate sheet, never this
 * wizard), `lockedPractitioner` (no per-practitioner page in the app), and
 * `preselectedServiceId` (no `?service_id=` entry point; the rebook bootstrap
 * is the app's only "knows the what" path).
 *
 * Decided ONCE at mount in the component, so nobody part-way through has the
 * steps rearranged under them because the venue flipped the setting.
 */

export type AppointmentFlowOrdering = 'service_first' | 'staff_first';

export interface AppointmentFlowOrderingInput {
  /**
   * `staff_first_booking_flow`, resolved for the venue being booked INTO. False
   * for a linked venue: its flags are not exposed to us, and guessing at another
   * venue's booking setup is worse than the familiar order (the same reasoning
   * that turns "any available" off for linked venues).
   */
  flagEnabled: boolean;
  /** `?date=` from a calendar empty-slot tap. */
  prefilledDate: string | null;
  /** `?time=` from a calendar empty-slot tap. */
  prefilledTime: string | null;
  /** `?practitionerId=` — the column that was tapped. */
  prefilledPractitionerId: string | null;
  /** `?intent=walk-in`. */
  isWalkIn: boolean;
  /** A rebook bootstrap resolved a past appointment (service AND practitioner). */
  rebookSeededAppointment: boolean;
}

/**
 * Staff tapped an empty slot on a calendar column, so date, time and person are
 * all already settled. Mirrors the web `staffCalendarSlotPrefillActive`,
 * including its walk-in exemption: a walk-in is treated as UNprefilled even when
 * launched from a column, because the person at the desk may want someone else.
 */
export function calendarSlotPrefillActive(
  input: Pick<
    AppointmentFlowOrderingInput,
    'prefilledDate' | 'prefilledTime' | 'prefilledPractitionerId' | 'isWalkIn' | 'rebookSeededAppointment'
  >,
): boolean {
  if (input.isWalkIn || input.rebookSeededAppointment) return false;
  return Boolean(
    input.prefilledDate?.trim() &&
      input.prefilledTime?.trim() &&
      input.prefilledPractitionerId?.trim(),
  );
}

/** The ordering this booking session should run in. */
export function resolveAppointmentFlowOrdering(
  input: AppointmentFlowOrderingInput,
): AppointmentFlowOrdering {
  if (!input.flagEnabled) return 'service_first';
  if (input.rebookSeededAppointment) return 'service_first';
  if (calendarSlotPrefillActive(input)) return 'service_first';
  return 'staff_first';
}
