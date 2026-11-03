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
  /** Every booking this prompt stands for, once each; Undo restores them all. */
  changes: MoveNoticeChange<P>[];
}

export type MoveNoticeInput<P> = Omit<MoveNotice<P>, 'changes'>;

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
    startMoved: pending.startMoved || next.startMoved,
    reassigned: pending.reassigned || next.reassigned,
    lengthChanged: pending.lengthChanged || next.lengthChanged,
    changes,
  };
}
