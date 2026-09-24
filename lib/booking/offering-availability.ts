/**
 * E-9 (web 2026-09-23, `src/lib/booking/offering-availability.ts`): telling staff that a class
 * session is full or an event is sold out, instead of hiding it.
 *
 * The offerings routes already return every session in range with its places left (`remaining`
 * for classes, `remaining_capacity` for events), full ones included; only the summaries drop
 * them. These helpers derive what the booking flows show as "Full" or "Sold out" from those
 * rows, so no route or response changes.
 *
 * Nothing here makes a full session bookable: the server still refuses one (409).
 */

/** Dates that have at least one session and no places left on any of them, ascending. */
export function datesWithNoPlacesLeft<T>(
  items: readonly T[],
  dateOf: (item: T) => string,
  placesLeft: (item: T) => number,
): string[] {
  const anyOpenByDate = new Map<string, boolean>();
  for (const item of items) {
    const date = dateOf(item);
    anyOpenByDate.set(date, (anyOpenByDate.get(date) ?? false) || placesLeft(item) > 0);
  }
  return [...anyOpenByDate]
    .filter(([, anyOpen]) => !anyOpen)
    .map(([date]) => date)
    .sort();
}

/**
 * Groups (class types, event series) whose every session in range has no places left, each
 * with its sessions in the order given. A group with even one open session is left out: it is
 * bookable and already has a summary of its own.
 */
export function groupsWithNoPlacesLeft<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  placesLeft: (item: T) => number,
): { key: string; items: T[] }[] {
  const byKey = new Map<string, { items: T[]; anyOpen: boolean }>();
  for (const item of items) {
    const key = keyOf(item);
    const group = byKey.get(key) ?? { items: [], anyOpen: false };
    group.items.push(item);
    if (placesLeft(item) > 0) group.anyOpen = true;
    byKey.set(key, group);
  }
  return [...byKey]
    .filter(([, group]) => !group.anyOpen)
    .map(([key, group]) => ({ key, items: group.items }));
}

/**
 * The session a date should go straight to: the one session on that date when it is the only
 * one and has places. Otherwise null, so the day's times are listed and full ones can be marked.
 */
export function sessionForDirectPick<T>(
  sessionsOnDate: readonly T[],
  placesLeft: (item: T) => number,
): T | null {
  if (sessionsOnDate.length !== 1) return null;
  const only = sessionsOnDate[0]!;
  return placesLeft(only) > 0 ? only : null;
}

/**
 * E-5 (web `src/lib/booking/staff-listed-item-owner.ts`): the `owner_venue_id` a staff booking
 * sends for a class or event picked on New Booking.
 *
 * Inside a live collective the Classes and Events steps list this venue's own classes and
 * events, whether or not they are on the combined page, next to the ones the other members list
 * there. A listed item books for the collective: the create route resolves its listing and the
 * venue that runs it, and records both. One of the venue's own unlisted items carries its venue
 * but no listing, and books as the venue's own, so it sends no owner at all (sending the
 * collective would be refused as "no longer bookable from the combined page").
 *
 * Outside a collective nothing is tagged, so a linked partner venue's id is sent as before.
 */
export function staffCreateOwnerVenueId(
  linkedOwnerVenueId: string | null | undefined,
  item: { venue_id?: string | null; collective_listing_id?: string | null },
): string | undefined {
  if (!linkedOwnerVenueId) return undefined;
  if (item.venue_id && !item.collective_listing_id) return undefined;
  return linkedOwnerVenueId;
}
