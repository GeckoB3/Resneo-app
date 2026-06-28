/**
 * Pure state transition for the multi-calendar day view's column filter
 * (wide / tablet viewports). The visible set is `string[] | null` where null
 * means "all calendars" and a non-null value is a genuine proper subset.
 *
 * Mirrors the web's "Calendars" checklist semantics, adapted to single-tap
 * chips:
 *   - From "all" (null), tapping a calendar ISOLATES to just that one.
 *   - On a subset, tapping toggles that calendar in/out.
 *   - Tapping the sole remaining calendar clears back to "all".
 *   - Selecting every calendar normalizes to "all" (null) — no point filtering
 *     to everything.
 * The result is always either null or a non-empty proper subset, ordered to
 * match `allIds`.
 */
export function nextVisibleCalendars(
  prev: string[] | null,
  id: string,
  allIds: readonly string[],
): string[] | null {
  let next: string[];
  if (prev == null) {
    // From "all", tapping a calendar isolates to just it.
    next = [id];
  } else {
    const set = new Set(prev);
    if (set.has(id)) {
      set.delete(id);
    } else {
      set.add(id);
    }
    next = allIds.filter((c) => set.has(c));
  }
  // Empty (deselected the last) or full (everything selected) → "all" (null).
  if (next.length === 0 || next.length >= allIds.length) return null;
  return next;
}
