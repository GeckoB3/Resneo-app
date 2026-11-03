/**
 * Which visit a booking row belongs to (web `Docs/split-staff-visit-plan.md`, section 8.2).
 *
 * Mirror of the web's `src/lib/booking/visit-key.ts`; keep the two in step.
 *
 * A multi-service visit is one booking made of independent rows, one per service, sharing
 * `group_booking_id`. A visit that spans businesses keeps each business's part as its own group,
 * joined by `linked_visit_id`, so the key of the whole visit is the link when there is one, else
 * the group. A group booking (rows with a `person_label`), a class cart and event, class or
 * resource rows share a group id too, and have no visit key.
 */
export interface VisitKeyRow {
  id?: string | null;
  group_booking_id?: string | null;
  linked_visit_id?: string | null;
  person_label?: string | null;
  class_instance_id?: string | null;
  experience_event_id?: string | null;
  resource_id?: string | null;
}

/** The visit's key, or null when the row is not part of a multi-service visit. */
export function visitKeyOf(row: VisitKeyRow): string | null {
  if (row.person_label?.trim()) return null;
  if (row.experience_event_id || row.class_instance_id || row.resource_id) return null;
  return row.linked_visit_id || row.group_booking_id || null;
}

/** True when two rows belong to the same multi-service visit. */
export function sameVisit(a: VisitKeyRow, b: VisitKeyRow): boolean {
  const ka = visitKeyOf(a);
  return ka != null && ka === visitKeyOf(b);
}
