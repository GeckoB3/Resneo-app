/**
 * The bookings list "Booked through" filter: which collective page a booking
 * was made through. Mirrors the web's `filterRegistryAppointments` collective
 * arm and its `collectiveChoices` (src/app/dashboard/bookings/
 * AppointmentBookingsDashboard.tsx).
 *
 * - `'all'`: every booking (the default).
 * - `'none'`: only bookings NOT made through any collective page.
 * - a collective id: only bookings made through that collective's page.
 */
export type CollectiveFilter = 'all' | 'none' | (string & {});

export type CollectiveChoice = { id: string; name: string };

type CollectiveRow = { collective_id?: string | null; collective_name?: string | null };

/** True when the row passes the collective filter. */
export function matchesCollectiveFilter(row: CollectiveRow, filter: CollectiveFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'none') return !row.collective_id;
  return row.collective_id === filter;
}

/**
 * Narrows this venue's own bookings by the collective filter. Rows from linked venues pass through
 * untouched (`isLinked`), as on the web, where linked venues' bookings are a separate list the
 * collective filter does not reach.
 */
export function filterByCollective<T extends CollectiveRow & { id: string }>(
  rows: readonly T[],
  filter: CollectiveFilter,
  isLinked: (id: string) => boolean,
): T[] {
  if (filter === 'all') return [...rows];
  return rows.filter((row) => isLinked(row.id) || matchesCollectiveFilter(row, filter));
}

/**
 * The collectives the loaded bookings were made through, in first-seen order.
 * Empty means the filter is hidden, as on the web. A chosen collective that is
 * no longer in the loaded rows stays listed so the filter can still be seen
 * and cleared.
 */
export function collectiveChoicesFor(
  rows: readonly CollectiveRow[],
  selected: CollectiveFilter,
): CollectiveChoice[] {
  const byId = new Map<string, string>();
  for (const row of rows) {
    if (row.collective_id && !byId.has(row.collective_id)) {
      byId.set(row.collective_id, row.collective_name ?? 'Collective');
    }
  }
  if (selected !== 'all' && selected !== 'none' && !byId.has(selected)) {
    byId.set(selected, 'Collective');
  }
  return [...byId.entries()].map(([id, name]) => ({ id, name }));
}

/** The summary chip label for an applied collective filter. */
export function collectiveFilterLabel(
  filter: CollectiveFilter,
  choices: readonly CollectiveChoice[],
): string | null {
  if (filter === 'all') return null;
  if (filter === 'none') return 'Not through a collective';
  return choices.find((c) => c.id === filter)?.name ?? 'Collective';
}
