/**
 * A booking dropped on a calendar that belongs to another ResNeo account
 * (web #190, `PractitionerCalendarView` `crossVenueMove`).
 *
 * A booking cannot be transferred between accounts: every row belongs to one
 * venue and the database refuses a change of venue. The grid used to answer
 * the drop with a toast ("A booking can only be moved within the same
 * venue."). Now it explains, and offers the two steps that do the job: book
 * the client afresh on the target calendar, prefilled from the booking that
 * was dragged (the service is chosen anew, the target venue has its own
 * catalogue), then cancel the original through the ordinary cancel path so
 * the client is told and any deposit follows the venue's rules.
 *
 * The pure parts live here: the words the two sheets use, the slot rounding,
 * and the one-shot record that carries "which booking to offer to cancel"
 * across the wizard (a route) and back to the calendar tab.
 */

export interface CrossVenueMoveWords {
  guestName: string;
  sourceCalendarName: string;
  /** Null when the dragged booking is on this venue. */
  sourceVenueName: string | null;
  targetCalendarName: string;
  /** Null when the drop column is this venue's own. */
  targetVenueName: string | null;
}

/** The first sheet: why the drop was refused and what to do instead. */
export function crossVenueMoveCopy(w: CrossVenueMoveWords): {
  title: string;
  message: string;
  confirmLabel: string;
} {
  const target = `${w.targetCalendarName}${w.targetVenueName ? ` (${w.targetVenueName})` : ' (your venue)'}`;
  const source = `${w.sourceCalendarName}${w.sourceVenueName ? ` (${w.sourceVenueName})` : ' (your venue)'}`;
  return {
    title: `${w.guestName}'s booking can't move to ${w.targetCalendarName}'s calendar`,
    message:
      `${target} and ${source} are on different ResNeo accounts, and a booking cannot be ` +
      `transferred between accounts.\n\nTo move it, make a new booking on ${w.targetCalendarName}'s ` +
      `calendar and cancel this one. The button below opens the booking form for ` +
      `${w.targetCalendarName}. Choose the service, confirm, and you will be offered to cancel the original.`,
    confirmLabel: `Book on ${w.targetCalendarName}'s calendar`,
  };
}

/** The booking form offers whole slots, so a dropped minute rounds to five. */
export function roundTimeToFiveMinutes(hhmm: string): string {
  const [h, m] = hhmm.split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const total = Math.round((h * 60 + m) / 5) * 5;
  const clamped = Math.min(Math.max(total, 0), 23 * 60 + 55);
  const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
  const mm = String(clamped % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** "10:30 on Tue 8 Sep with Kate" */
export function crossVenueOriginalLabel(
  bookingTime: string,
  bookingDate: string,
  sourceCalendarName: string,
): string {
  const d = new Date(`${bookingDate}T12:00:00`);
  // Fixed tables rather than toLocaleDateString: the ICU on the device may say
  // "Sept", and the label should read the same everywhere.
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = Number.isNaN(d.getTime())
    ? bookingDate
    : `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  return `${bookingTime.slice(0, 5)} on ${day} with ${sourceCalendarName}`;
}

/** The second sheet: after the new booking is made, offer to cancel the original. */
export function cancelOriginalCopy(rec: { guestName: string; originalLabel: string; targetLabel: string }): {
  title: string;
  message: string;
} {
  return {
    title: 'Cancel the original booking?',
    message:
      `The new booking is on ${rec.targetLabel}. ${rec.guestName} still has the original at ` +
      `${rec.originalLabel}.\n\nThis cancels it the usual way, so the client is told and any deposit ` +
      `follows the venue's cancellation rules.`,
  };
}

/**
 * The record that rides across the wizard. Written when the first sheet is
 * confirmed, marked `created` by the wizard's created callback, and taken by
 * the calendar tab when it regains focus. Left pending (the wizard was
 * abandoned) it is dropped on that focus, so a later booking never inherits it.
 */
export interface PendingCrossVenueRebook {
  originalBookingId: string;
  /** The partner venue the original belongs to, or null for this venue's own booking. */
  originalOwnerVenueId: string | null;
  guestName: string;
  originalLabel: string;
  targetLabel: string;
  created: boolean;
}

let pending: PendingCrossVenueRebook | null = null;

export function setPendingCrossVenueRebook(rec: Omit<PendingCrossVenueRebook, 'created'>): void {
  pending = { ...rec, created: false };
}

/** The wizard made a booking: if a cross-account rebook was pending, it is done. */
export function markCrossVenueRebookCreated(): void {
  if (pending) pending = { ...pending, created: true };
}

/**
 * Take the record if its booking was made, clearing it either way. Called when
 * the calendar tab regains focus; a record the wizard never completed is
 * dropped here.
 */
export function takeCrossVenueRebookIfCreated(): PendingCrossVenueRebook | null {
  const rec = pending;
  pending = null;
  return rec && rec.created ? rec : null;
}

export function clearPendingCrossVenueRebook(): void {
  pending = null;
}

/** For tests. */
export function peekPendingCrossVenueRebook(): PendingCrossVenueRebook | null {
  return pending;
}
