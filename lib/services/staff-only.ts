/**
 * "Staff bookings only" (`service_items.is_bookable_online = false`), web parity with
 * `AppointmentServiceFormFields.tsx` and the `svc.form.staffOnly.*` strings in the web's
 * `collective-copy.ts`. The team can book the service from the diary; guests never see it.
 *
 * Admin only on both sides: the web sends `is_bookable_online` with every admin save
 * (`appointment-service-form-to-payload.ts`) and the API defaults it to true on create.
 */

export const STAFF_ONLY_LABEL = 'Staff bookings only';

/** The help line under the switch; names the collective page when the venue is in one. */
export function staffOnlyHelp(collectiveName?: string | null): string {
  const name = collectiveName?.trim();
  if (name) {
    return `Teams at every venue in ${name} can book this from the diary. Guests do not see it on the ${name} page.`;
  }
  return 'Your team can book this from the diary. Guests do not see it on your booking page.';
}

/** True when the stored service is staff-only. Absent (older server) or true means guests can book. */
export function isStaffOnlyService(service: { is_bookable_online?: boolean | null }): boolean {
  return service.is_bookable_online === false;
}

/** The collective name the services report, for the help line (web `collective?.name`). */
export function collectiveNameFromServices(
  services: readonly { collective?: { collective_name?: string | null } | null }[],
): string | null {
  return services.find((s) => s.collective)?.collective?.collective_name ?? null;
}
