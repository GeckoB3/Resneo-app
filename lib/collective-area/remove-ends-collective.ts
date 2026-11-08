/**
 * Whether the host removing a venue ends the collective (web
 * `src/lib/linked-accounts/remove-ends-collective.ts`, QA 2026-11-08 COL-F21).
 *
 * The engine's own rule: fewer than two active venues, unless one is left and an open invitation
 * could still bring it back to two. The member's Leave sheet warns by the same rule, so the host's
 * Remove now warns exactly when a Leave would.
 */
export interface CollectiveVenueStatus {
  venue_id: string;
  status: string;
}

export function removeEndsCollective(venues: readonly CollectiveVenueStatus[], removedVenueId: string): boolean {
  const active = venues.filter((v) => v.status === 'active' && v.venue_id !== removedVenueId).length;
  const invited = venues.filter((v) => v.status === 'invited' && v.venue_id !== removedVenueId).length;
  return !(active >= 2 || (active >= 1 && active + invited >= 2));
}
