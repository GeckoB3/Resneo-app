/**
 * Which diary blocks stop staff placing an appointment, and which are advice.
 *
 * Ported from web's `src/lib/calendar/occupying-blocks.ts` (SA-H3 / SA-H5).
 * Before this, both grids folded EVERY block into the drag's conflict set with
 * no discrimination of any kind, so a receptionist could not move a booking
 * onto a break or past closing — the commonest real reason anyone touches a
 * diary, and something the shipped help article promises is allowed with a note
 * rather than a refusal.
 *
 * ## The vocabularies differ, so this is a port and not a copy
 *
 * Web's rule names the SYNTHETIC types its diary computes (`venue_closed`,
 * `venue_amended_hours`, `practitioner_closed`). The app's grid comes from
 * `GET /api/venue/calendar-grid`, which returns `calendar_blocks.block_type`
 * raw — `'manual'`, `'break'`, `'closed'`, `'class_session'`. Both spellings are
 * accepted below so the rule keeps working if the endpoint ever moves to web's
 * computed set.
 *
 * ## What is deliberately still a wall
 *
 * `manual` (a block staff made by hand), `class_session`, and anything
 * unrecognised. `practitioner_leave` stays occupying on the same reasoning —
 * a closure is a boundary the venue can choose to work past, but leave means the
 * person is not in the building. The app now draws leave itself, from
 * `/api/venue/practitioner-leave` (the grid feed still does not carry it), so
 * the drag refuses it client-side and reads the same as the server, which
 * refuses it regardless: full-day leave survives even `allowOutsideHours`.
 *
 * An unknown type OCCUPIES, so any type added later is refused until someone
 * decides otherwise.
 */

const NON_OCCUPYING_BLOCK_TYPES = new Set([
  // The app's grid vocabulary.
  'break',
  'closed',
  'amended_hours',
  // Web's computed vocabulary, accepted so the rule survives an endpoint change,
  // and now also emitted by the app itself (`lib/calendar/schedule-closures.ts`).
  'venue_closed',
  'venue_amended_hours',
  'practitioner_closed',
  // A calendar's own per-date hours override. Advice, exactly like the venue's:
  // it marks the window that IS worked on an amended day.
  'calendar_amended_hours',
]);

/**
 * Amended hours mark the window the venue IS open on an amended day, so they are
 * not "outside hours" — they are the most inside-hours a slot gets. Kept apart
 * from the set above because they answer the two questions differently: staff
 * may place over them (non-occupying) AND doing so warrants no amber note.
 */
const AMENDED_HOURS_BLOCK_TYPES = new Set([
  'amended_hours',
  'venue_amended_hours',
  'calendar_amended_hours',
]);

/** Whether a block should stop staff placing an appointment over it. */
export function isOccupyingBlock(blockType: string | null | undefined): boolean {
  return !NON_OCCUPYING_BLOCK_TYPES.has(blockType ?? '');
}

/**
 * Whether a block means "not normally worked", for the amber outside-hours note.
 * True for breaks and closures; false for amended hours and for anything that
 * occupies (which is refused outright, so it never reaches the amber question).
 */
export function isNonWorkingBlock(blockType: string | null | undefined): boolean {
  return isOccupyingBlock(blockType) === false && !AMENDED_HOURS_BLOCK_TYPES.has(blockType ?? '');
}

export type MinuteRange = { start: number; end: number };

/**
 * Cut the non-working ranges out of the working ranges.
 *
 * This is how a break earns its amber note without touching the drag worklet:
 * `evaluateConflict` flags anything not fully inside a working range as level 1
 * (allowed, amber), so removing the break from those ranges makes a drop over it
 * read amber instead of green. Ranges are half-open `[start, end)` minutes.
 *
 * A cut that splits a working range in two yields two ranges, which is why this
 * cannot be a simple filter.
 */
export function narrowWorkingRanges(
  working: readonly MinuteRange[],
  nonWorking: readonly MinuteRange[],
): MinuteRange[] {
  if (nonWorking.length === 0) return working.map((w) => ({ start: w.start, end: w.end }));

  let out: MinuteRange[] = working.map((w) => ({ start: w.start, end: w.end }));
  for (const cut of nonWorking) {
    if (cut.end <= cut.start) continue;
    const next: MinuteRange[] = [];
    for (const range of out) {
      // No overlap — the range survives whole.
      if (cut.end <= range.start || cut.start >= range.end) {
        next.push(range);
        continue;
      }
      // Head and tail survive; either may be empty when the cut reaches an edge.
      if (cut.start > range.start) next.push({ start: range.start, end: cut.start });
      if (cut.end < range.end) next.push({ start: cut.end, end: range.end });
    }
    out = next;
  }
  return out;
}
