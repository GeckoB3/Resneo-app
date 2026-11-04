/**
 * The "Let the client know?" prompt after a drag, keyed by VISIT (split-visit plan 8.6 and 8.8,
 * G7).
 *
 * Moving two services of one visit one after the other used to raise a prompt for each, and the
 * second replaced the first: two notices if staff tapped Notify on both, and the first move's
 * Undo lost. The client should get one notice once the edits settle, listing the whole visit (the
 * server's notice for any service of a visit describes all of it). So a change to a service of the
 * visit a pending prompt already stands for joins that prompt: it offers Notify once, and Undo puts
 * back every service it covers, each where it was before the first change to it.
 *
 * A change to anything else (an ordinary booking, another visit) starts a prompt of its own, as
 * before.
 */

export interface MoveNoticeChange<P> {
  bookingId: string;
  /** Where the booking was before the FIRST change this prompt stands for. */
  previous: P;
  lengthChanged: boolean;
}

export interface MoveNotice<P> {
  /** The booking the latest change was to: the one Notify is sent against. */
  bookingId: string;
  guestName: string;
  /** Where the latest change started from. */
  previous: P;
  /** Some change this prompt stands for moved a start, so the client may need telling. */
  startMoved: boolean;
  /** Some change moved a service to another person's column. */
  reassigned: boolean;
  lengthChanged: boolean;
  /** The visit the change belongs to (`groupBookingId`), or null for an ordinary booking. */
  visitKey: string | null;
  /**
   * Where the latest change left the service against its own visit (G13): "Beard Trim with
   * Sophie is at 11:00, so the client would be in two places." A toast would sit behind the
   * prompt's sheet (a sheet is its own native window), so the prompt carries the note itself.
   */
  overlapNote?: string | null;
  /** Every booking this prompt stands for, once each; Undo restores them all. */
  changes: MoveNoticeChange<P>[];
}

export type MoveNoticeInput<P> = Omit<MoveNotice<P>, 'changes'>;

/** Said when a service now overlaps another service of its visit on the same column. */
export const SAME_COLUMN_VISIT_OVERLAP_NOTE = 'This now overlaps another service of the same visit.';

/**
 * The one toast a resize gets (it opens no prompt). The app shows one toast at a time, so a
 * separate note would be replaced at once by this one: the note rides in it.
 */
export function lengthChangeToastMessage(isVisitService: boolean, overlapNote?: string | null): string {
  const done = isVisitService ? 'Service length updated' : 'Duration updated';
  return overlapNote ? `${done}. ${overlapNote}` : done;
}

/** Whether `next` belongs to the visit the pending prompt stands for. */
export function joinsPendingMoveNotice<P>(
  pending: MoveNotice<P> | null,
  next: Pick<MoveNoticeInput<P>, 'visitKey'>,
): boolean {
  return pending != null && next.visitKey != null && pending.visitKey === next.visitKey;
}

/** The prompt to show after `next`: the pending one joined, or a new one. */
export function mergeMoveNotice<P>(pending: MoveNotice<P> | null, next: MoveNoticeInput<P>): MoveNotice<P> {
  const own: MoveNoticeChange<P> = {
    bookingId: next.bookingId,
    previous: next.previous,
    lengthChanged: next.lengthChanged,
  };
  if (!pending || !joinsPendingMoveNotice(pending, next)) return { ...next, changes: [own] };
  const already = pending.changes.find((c) => c.bookingId === next.bookingId);
  const changes = already
    ? pending.changes.map((c) =>
        // A second change to the same service: Undo still goes back to before the first.
        c.bookingId === next.bookingId ? { ...c, lengthChanged: c.lengthChanged || next.lengthChanged } : c,
      )
    : [...pending.changes, own];
  return {
    ...next,
    // The latest change's reading of the visit, or none: an earlier note may no longer be true.
    overlapNote: next.overlapNote ?? null,
    startMoved: pending.startMoved || next.startMoved,
    reassigned: pending.reassigned || next.reassigned,
    lengthChanged: pending.lengthChanged || next.lengthChanged,
    changes,
  };
}
