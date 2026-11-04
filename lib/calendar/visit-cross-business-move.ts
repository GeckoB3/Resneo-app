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
 * today's checks (the same business, or a booking that is not part of a visit or group).
 */
export function crossBusinessMoveRefusal(
  row: { group_booking_id?: string | null; person_label?: string | null },
  sourceVenueId: string | null | undefined,
  targetVenueId: string | null | undefined,
): string | null {
  if (!row.group_booking_id) return null;
  if ((sourceVenueId ?? null) === (targetVenueId ?? null)) return null;
  return row.person_label ? GROUP_CROSS_BUSINESS_MOVE_REFUSAL : VISIT_CROSS_BUSINESS_MOVE_REFUSAL;
}
