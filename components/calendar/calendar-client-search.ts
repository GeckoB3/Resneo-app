/**
 * The calendar toolbar's client search: port of the web
 * `OperationsToolbarGuestSearchPanel` + `useGuestToolbarSearch` +
 * `guest-search-helpers` (practitioner calendar, `searchAriaLabel="Search
 * contacts"`).
 *
 * The web searches `GET /api/venue/guests` 280 ms after the last keystroke,
 * once the term has 2 characters, for 10 contacts by name, with every identity
 * tier included. The same numbers live here so the app finds the same people.
 */
import { format, parseISO } from 'date-fns';

import { formatGuestDisplayName } from '@/lib/guests/name';
import { formatPhoneForDisplay } from '@/lib/phone/e164';
import type { GuestBookingHistoryRow } from '@/types/guest-detail';
import type { GuestListItem, GuestListParams } from '@/types/guest-list';

export const CLIENT_SEARCH_DEBOUNCE_MS = 280;
export const CLIENT_SEARCH_MIN_LENGTH = 2;
export const CLIENT_SEARCH_RESULT_LIMIT = 10;
/** The web's contact panel asks for this many past and future visits. */
export const CLIENT_SEARCH_HISTORY_LIMIT = 40;

/** The list query the web toolbar sends (`useGuestToolbarSearch`). */
export function clientSearchParams(search: string): GuestListParams {
  return {
    search: search.trim(),
    filter: 'all',
    sort: 'name_asc',
    page: 0,
    limit: CLIENT_SEARCH_RESULT_LIMIT,
  };
}

/** Web `guestSearchResultLabel`. */
export function clientSearchResultLabel(
  row: Pick<GuestListItem, 'first_name' | 'last_name' | 'identifiability_tier'>,
): string {
  if (row.identifiability_tier === 'anonymous') return 'Anonymous';
  return formatGuestDisplayName(row.first_name, row.last_name);
}

/** Web `guestSearchResultSubtitle`, with the phone in its readable form. */
export function clientSearchResultSubtitle(row: Pick<GuestListItem, 'email' | 'phone'>): string {
  const email = row.email?.trim() || null;
  const phone = formatPhoneForDisplay(row.phone) || null;
  if (email && phone) return `${email} · ${phone}`;
  return email ?? phone ?? 'No contact details on file';
}

/** The hint, loading and empty states, worked out as the web hook does. */
export function clientSearchStatus(args: {
  query: string;
  debouncedQuery: string;
  loading: boolean;
  hasError: boolean;
  resultCount: number;
}): { showHint: boolean; showEmpty: boolean; searching: boolean } {
  const typed = args.query.trim().length;
  const debounced = args.debouncedQuery.trim().length;
  const searching = debounced >= CLIENT_SEARCH_MIN_LENGTH;
  return {
    showHint: typed > 0 && typed < CLIENT_SEARCH_MIN_LENGTH,
    showEmpty: searching && !args.loading && !args.hasError && args.resultCount === 0,
    searching,
  };
}

/** Where a picked booking sends the diary. */
export interface CalendarBookingJump {
  bookingId: string;
  /** YYYY-MM-DD */
  date: string;
  /** The diary calendar the booking sits on, when it is one of this venue's. */
  calendarId: string | null;
}

/**
 * The jump for a booking from the client's history. The calendar is the row's
 * `calendar_id`, else its `practitioner_id`, and only when it is one of the
 * diary's own calendars; otherwise the diary keeps the calendars it shows.
 */
export function calendarJumpForBooking(
  row: Pick<GuestBookingHistoryRow, 'id' | 'booking_date' | 'calendar_id' | 'practitioner_id'>,
  calendarIds: readonly string[],
): CalendarBookingJump {
  const candidates = [row.calendar_id, row.practitioner_id];
  const calendarId = candidates.find((id): id is string => Boolean(id) && calendarIds.includes(id as string)) ?? null;
  return { bookingId: row.id, date: row.booking_date, calendarId };
}

/** "Fri 9 Oct 2026" for a history row: a jump can cross years, so the year shows. */
export function formatClientBookingDate(isoDate: string): string {
  try {
    const parsed = parseISO(isoDate);
    if (Number.isNaN(parsed.getTime())) return isoDate;
    return format(parsed, 'EEE d MMM yyyy');
  } catch {
    return isoDate;
  }
}
