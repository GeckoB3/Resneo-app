/**
 * One client in two places (web `src/lib/booking/visit-overlaps.ts`, split-visit plan 7.4, 8.8,
 * G13 and G16).
 *
 * Two services of one visit may overlap on purpose (a manicure while a colour develops), but never
 * silently. On the same calendar the slot checks refuse it, as they refuse any clash. On different
 * calendars the client would be in two chairs at once, so:
 *
 * - the visit routes' dry run lists such overlaps as `visit_overlaps`, and a save that makes one
 *   needs `acknowledge_visit_overlap: true`, else 409 with code `visit_overlap`;
 * - Modify shows the note before saving and the save keeps it; a 409 shows it and the next Save
 *   acknowledges; Undo always acknowledges (the rows go back to where they were);
 * - a drag or resize saves, then shows the note.
 */
import { ApiError, apiErrorCode } from '@/lib/api/client';

/** One overlap, as the server describes it. */
export interface VisitOverlap {
  /** The changed service that now overlaps. */
  booking_id: string;
  /** The service it overlaps. */
  other_id: string;
  /** "Gel Manicure with Steph", or the service name alone when the calendar has no name. */
  other_name: string;
  /** The other service's business, when it is not the caller's; null for one's own. */
  venue_name: string | null;
  /** The other service's start, "HH:MM". */
  start: string;
}

/** The 409 code a save gets when it did not acknowledge the overlap. */
export const VISIT_OVERLAP_CODE = 'visit_overlap';

/** The server's refusal, for when the body carries none. */
export const VISIT_OVERLAP_MESSAGE =
  'This overlaps another service in the same visit, so the client would be in two places. Save again to keep it.';

/** "Gel Manicure with Steph is at 10:45, so the client would be in two places." */
export function visitTwoPlacesNote(params: {
  serviceName: string | null | undefined;
  personName?: string | null;
  venueName?: string | null;
  /** HH:mm or HH:mm:ss */
  start: string;
}): string {
  const service = params.serviceName?.trim() || 'Another service';
  const person = params.personName?.trim();
  const where = params.venueName?.trim() ? ` at ${params.venueName.trim()}` : '';
  return `${service}${person ? ` with ${person}` : ''}${where} is at ${params.start.slice(0, 5)}, so the client would be in two places.`;
}

/** The note staff read, for the first overlap the server listed; null when there is none. */
export function visitOverlapNote(overlaps: readonly VisitOverlap[] | null | undefined): string | null {
  const first = overlaps?.[0];
  if (!first) return null;
  const where = first.venue_name ? ` at ${first.venue_name}` : '';
  return `${first.other_name}${where} is at ${first.start.slice(0, 5)}, so the client would be in two places.`;
}

/**
 * A save refused because it puts the client in two places, with what to show: the server's
 * overlap note when it listed one, else its message. Null for any other error.
 */
export function visitOverlapRefusal(error: unknown): { note: string; message: string } | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  if (apiErrorCode(error) !== VISIT_OVERLAP_CODE) return null;
  const body = (error.body ?? {}) as { visit_overlaps?: VisitOverlap[] };
  const message = error.message?.trim() || VISIT_OVERLAP_MESSAGE;
  return { note: visitOverlapNote(body.visit_overlaps) ?? message, message };
}
