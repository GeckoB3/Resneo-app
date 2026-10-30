/**
 * What the host is told once a service has gone on the collective page (web
 * `src/lib/linked-accounts/replicas/offer-summary.ts`, CQ-05), word for word.
 *
 * Putting a service on the page sets it up at every venue, but a venue's guests can only book it
 * once one of that venue's calendars offers it. The message says where it is set up, which venues
 * offer it on no calendar yet, which are still being set up, and when no calendar anywhere offers it.
 *
 * Pure: it reads the offerings route's answer (`useOfferServiceOnPage`), so the grid's sheet and
 * the Services screen say the same.
 */
import { areaCopy, formatVenueList } from '@/lib/collective-area/copy';

export interface OfferSummaryVenue {
  venue_id: string;
  venue_name: string;
}

export interface OfferSummaryLink extends OfferSummaryVenue {
  /** How the venue's copy stands after the offer: 'current' once it is set up, else 'behind' or 'failing'. */
  status: string;
  /** Active calendars at that venue that offer it. Absent from servers before 2026-10-29. */
  calendar_count?: number | null;
}

export interface OfferSummaryInput {
  collectiveName: string;
  /** One per member venue, from the offerings route's `links`. */
  links: OfferSummaryLink[];
  /** Venues whose chosen calendars could not be given it yet (`calendars.not_ready`). */
  notReady?: OfferSummaryVenue[];
  /** Venues asked whether to use their own same-named service first (`pending`). */
  awaiting?: OfferSummaryVenue[];
  /** Active calendars at the host that offer it (`host_calendar_count`); without it, "nowhere" is not guessed. */
  hostCalendarCount?: number | null;
}

export interface OfferSummary {
  /** The sentences, in the order they are read. */
  lines: string[];
  /** Some venue does not offer it yet, so choosing calendars has something to do. */
  chooseCalendars: boolean;
}

const names = (venues: OfferSummaryVenue[]) => formatVenueList(venues.map((v) => v.venue_name));

export function offerDoneSummary(input: OfferSummaryInput): OfferSummary {
  // A venue still deciding about its own same-named service has its own sentence, and nothing else.
  const awaiting = dedupe(input.awaiting ?? []);
  const awaitingIds = new Set(awaiting.map((v) => v.venue_id));
  // Behind, failing, or its chosen calendars could not be given it yet: still being set up.
  const settingUp = dedupe([...input.links.filter((l) => l.status !== 'current'), ...(input.notReady ?? [])]).filter(
    (v) => !awaitingIds.has(v.venue_id),
  );
  const settingUpIds = new Set(settingUp.map((v) => v.venue_id));
  const current = input.links.filter(
    (l) => l.status === 'current' && !awaitingIds.has(l.venue_id) && !settingUpIds.has(l.venue_id),
  );
  // Only a count the server gave: an older server's silence is not "no calendars".
  const noCalendars = current.filter((l) => l.calendar_count === 0);

  const lines: string[] = [];
  lines.push(
    current.length > 0
      ? areaCopy('svc.offer.done', { collective: input.collectiveName, venueList: names(current) })
      : areaCopy('svc.offer.doneAlone', { collective: input.collectiveName }),
  );
  if (noCalendars.length === 1) {
    lines.push(areaCopy('svc.offer.doneNoCalendarsOne', { venue: noCalendars[0]!.venue_name }));
  } else if (noCalendars.length > 1) {
    lines.push(areaCopy('svc.offer.doneNoCalendars', { venueList: names(noCalendars) }));
  }
  if (settingUp.length > 0) lines.push(areaCopy('svc.offer.doneSettingUp', { venueList: names(settingUp) }));
  if (awaiting.length > 0) lines.push(areaCopy('svc.offer.awaiting', { venueList: names(awaiting) }));
  const offeredSomewhere =
    (input.hostCalendarCount ?? 0) > 0 || input.links.some((l) => (l.calendar_count ?? 0) > 0);
  const nowhere = typeof input.hostCalendarCount === 'number' && !offeredSomewhere;
  if (nowhere) lines.push(areaCopy('svc.offer.doneNowhere'));

  return { lines, chooseCalendars: noCalendars.length > 0 || settingUp.length > 0 || nowhere };
}

function dedupe(venues: OfferSummaryVenue[]): OfferSummaryVenue[] {
  const seen = new Map<string, OfferSummaryVenue>();
  for (const v of venues) {
    if (!seen.has(v.venue_id)) seen.set(v.venue_id, { venue_id: v.venue_id, venue_name: v.venue_name });
  }
  return [...seen.values()];
}
