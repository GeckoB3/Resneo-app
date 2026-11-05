/**
 * A service of a visit cannot be dragged to another business's column (Docs/split-staff-visit-plan.md
 * 7.6, S24). The calendar refuses it during the drag, before any dialog opens: the move to another
 * business refuses any row with a group id, so offering it only to be refused helped nobody. This
 * applies to every visit row, linked or not, and to each person of a group booking.
 *
 * Mirror of the web's `src/lib/calendar/visit-cross-business-move.ts`; keep the two in step.
 */

export const VISIT_CROSS_BUSINESS_MOVE_REFUSAL =
  'This service is part of a visit, so it cannot move to another business. Book it there first, then cancel this service here.';

export const GROUP_CROSS_BUSINESS_MOVE_REFUSAL =
  'This booking is part of a group, so it cannot move to another business. Book it there first, then cancel this one here.';

/**
 * The refusal for dropping `row` on a column of `targetVenueId`, or null when the move may go on to
 * today's checks (the same business, a booking that is not part of a visit or group, or a service of
 * a visit moving inside the viewer's collective, where it stays in the visit: web 2026-11-05).
 * `collectiveVenueIds` are the businesses of the viewer's live collective; leave it out where none.
 * One person of a group never moves to another business.
 */
export function crossBusinessMoveRefusal(
  row: { group_booking_id?: string | null; person_label?: string | null },
  sourceVenueId: string | null | undefined,
  targetVenueId: string | null | undefined,
  collectiveVenueIds?: readonly string[] | null,
): string | null {
  if (!row.group_booking_id) return null;
  if ((sourceVenueId ?? null) === (targetVenueId ?? null)) return null;
  if (row.person_label) return GROUP_CROSS_BUSINESS_MOVE_REFUSAL;
  const inCollective =
    Boolean(sourceVenueId && targetVenueId) &&
    (collectiveVenueIds ?? []).includes(sourceVenueId!) &&
    (collectiveVenueIds ?? []).includes(targetVenueId!);
  return inCollective ? null : VISIT_CROSS_BUSINESS_MOVE_REFUSAL;
}
