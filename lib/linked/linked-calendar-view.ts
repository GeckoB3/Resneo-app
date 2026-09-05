/**
 * Shared, pure mappers that turn a linked venue's redacted calendar feed into
 * the render-ready shapes the SHARED calendar grids consume — so the linked DAY
 * grid ({@link ../../components/linked/LinkedVenueCalendarGrid}) and the linked
 * WEEK grid ({@link ../../components/linked/LinkedVenueWeekGrid}) build their
 * columns identically and can't silently diverge (mirrors how the main calendar
 * and the linked grid already share `schedule-block-view.ts`).
 *
 * Grant gating lives in the calling components; these helpers just translate
 * whatever bookings/hours the API already redacted for our grant.
 */
import type { CalendarTimeBlock } from '@/components/calendar/CalendarDayGrid';
import { minutesToTime } from '@/components/calendar/grid-layout';
import { dedupeScheduleDTOs, toCalendarScheduleBlock } from '@/lib/calendar/schedule-block-view';
import { type MinuteRange, type VenueDayHours } from '@/lib/calendar/venue-closures';
import { hasAnyWorkingHours, openRangesForDate } from '@/lib/linked/working-hours';
import type {
  CalendarGridBooking,
  CalendarGridWorkingHours,
} from '@/types/calendar-grid';
import type { CalendarScheduleBlock } from '@/types/schedule-blocks';
import type { LinkedBooking, LinkedPractitioner, LinkedVenueCalendar } from '@/types/linked-venues';

/** "HH:mm:ss" / "HH:mm" → "HH:mm" (empty string when absent). */
export function fmtTime(t: string | null | undefined): string {
  return (t ?? '').slice(0, 5);
}

/**
 * What to call a linked booking on screen.
 *
 * A link without the PII grant returns `guestName: null` for EVERY booking: the
 * web stopped falling through to the booking's own guest-name snapshot (§5.2),
 * so the client's name is hidden along with their contact details. That makes
 * this fallback the normal case on such a link, not a rare one, and the web
 * labels those cards with the service — which still tells staff what the slot is
 * for, where a bare "Booking" on every row would not.
 */
export function linkedBookingLabel(b: LinkedBooking): string {
  return b.guestName?.trim() || b.serviceName?.trim() || 'Booking';
}

/** Per-grant pill label mirroring the web `VenueCalendarBlock` header. */
export function linkedActionLabel(venue: LinkedVenueCalendar): string | null {
  if (venue.visibility === 'time_only') return 'Time blocks only';
  if (venue.action === 'none') return 'View only';
  if (venue.action === 'edit_existing') return 'Edit existing';
  return null; // create_edit_cancel — the "New booking" button conveys this
}

/**
 * Map a `full_details` linked booking to the shared appointment-bar shape. The
 * service label folds in the practitioner name (when known) the same way the
 * web does.
 */
export function linkedGridBooking(
  b: LinkedBooking,
  practitioners: LinkedPractitioner[],
  options: { practitionerInLabel?: boolean } = {},
): CalendarGridBooking {
  // On a per-calendar column the header already names the practitioner, so
  // the bar keeps the bare service; the merged per-venue grids still fold the
  // name in, since there the column is the venue.
  const pracName =
    options.practitionerInLabel === false
      ? undefined
      : practitioners.find((p) => p.id === b.practitionerId)?.name;
  return {
    id: b.id,
    guestName: linkedBookingLabel(b),
    serviceName: pracName
      ? `${b.serviceName ?? ''}${b.serviceName ? ' · ' : ''}${pracName}`
      : b.serviceName ?? '',
    startTime: fmtTime(b.bookingTime),
    endTime: fmtTime(b.bookingEndTime),
    status: b.status,
    client_arrived_at: b.clientArrivedAt ?? null,
    staff_attendance_confirmed_at: b.staffAttendanceConfirmedAt ?? null,
    guest_attendance_confirmed_at: b.guestAttendanceConfirmedAt ?? null,
    // What the booking is for, so the partner column can read the service's
    // processing gaps. The linked feed carries no snapshot: null means "derive
    // from the pattern in `services[]`" (see `lib/calendar/processing-gaps`).
    appointment_service_id: b.appointmentServiceId ?? null,
    service_item_id: b.serviceItemId ?? null,
    service_variant_id: b.serviceVariantId ?? null,
    processing_time_blocks: null,
  };
}

/** `time_only` → a grey, non-interactive "{venue} — busy" overlay block. */
export function linkedBusyBlock(b: LinkedBooking, venueName: string): CalendarTimeBlock {
  return {
    id: b.id,
    start: fmtTime(b.bookingTime),
    end: fmtTime(b.bookingEndTime) || fmtTime(b.bookingTime),
    label: `${venueName} — busy`,
    isEditable: false,
  };
}

/**
 * The linked venue's available hours for a date, unioned across its
 * practitioners' working-hours templates. Drives both the grid's visible window
 * and the "Closed" shading (web parity: per-linked-column closure derives from
 * the linked column's own working hours, not the viewing venue's).
 */
export function linkedOpenRanges(venue: LinkedVenueCalendar, date: string): MinuteRange[] {
  const all: MinuteRange[] = [];
  for (const p of venue.practitioners) all.push(...openRangesForDate(p.workingHours, date));
  return all;
}

/** True when any of the venue's practitioners publishes a working-hours template. */
export function linkedHasTemplate(venue: LinkedVenueCalendar): boolean {
  return venue.practitioners.some((p) => hasAnyWorkingHours(p.workingHours));
}

/**
 * Closed-shading state for a date: explicit open periods when the venue works
 * that day, fully closed when it has a template but no hours, and unknown (no
 * shading) when no template is available at all.
 */
export function linkedVenueDayHours(
  openRanges: MinuteRange[],
  hasTemplate: boolean,
): VenueDayHours {
  if (openRanges.length > 0) return { kind: 'open', periods: openRanges };
  return hasTemplate ? { kind: 'closed' } : { kind: 'unknown' };
}

/** Convert open minute-ranges into the grid's working-hours window. */
export function rangesToWorkingHours(openRanges: MinuteRange[]): CalendarGridWorkingHours[] {
  return openRanges.map((r) => ({ start: minutesToTime(r.start), end: minutesToTime(r.end) }));
}

/**
 * The venue's classes / ticketed events / resource bookings for a date as
 * read-only overlays (class instances deduped), via the same mapper the main
 * calendar uses. `time_only` never carries these.
 */
export function linkedScheduleBlocksForDate(
  venue: LinkedVenueCalendar,
  date: string,
): CalendarScheduleBlock[] {
  const dtos = (venue.scheduleBlocks ?? []).filter((b) => b.date === date);
  return dedupeScheduleDTOs(dtos).map(toCalendarScheduleBlock);
}

/**
 * The combined grid's column key for a linked calendar (web `linkedColumnKey`,
 * §8.2): `linked:<venueId>:<practitionerId>`. Without a practitioner it is the
 * venue-level key `linked:<venueId>`, which the wide-day filter prefs still
 * store per venue and which the grid keeps for bookings naming no calendar.
 */
export function linkedColumnKey(venueId: string, practitionerId?: string | null): string {
  return practitionerId ? `linked:${venueId}:${practitionerId}` : `linked:${venueId}`;
}

/** The venue (and calendar, when the key names one) behind a linked column key; null for any other id. */
export function parseLinkedColumnKey(
  key: string,
): { venueId: string; practitionerId: string | null } | null {
  if (!key.startsWith('linked:')) return null;
  const rest = key.slice('linked:'.length);
  const sep = rest.indexOf(':');
  if (sep === -1) return rest ? { venueId: rest, practitionerId: null } : null;
  const venueId = rest.slice(0, sep);
  const practitionerId = rest.slice(sep + 1);
  return venueId ? { venueId, practitionerId: practitionerId || null } : null;
}

/** One column of a linked venue on the combined day grid. */
export interface LinkedVenueColumn {
  key: string;
  venue: LinkedVenueCalendar;
  /** Null for the venue-level column, which holds the bookings naming no listed calendar. */
  practitionerId: string | null;
  /** The header: the calendar's name (web parity), or the venue's on the venue-level column. */
  name: string;
  /** This calendar's open ranges for the date (the venue's union on the venue-level column). */
  openRanges: MinuteRange[];
  /** Whether a working-hours template exists at all, for the closed-versus-unknown shading. */
  hasTemplate: boolean;
  /** The date's bookings that belong to this column. */
  bookings: LinkedBooking[];
}

/**
 * A linked venue's columns for a date: one per calendar the partner shares,
 * named after the calendar, as the web diary draws them (`linkedColumns` in
 * `PractitionerCalendarView.tsx`: "Jenny", not "light2"). Each carries its own
 * weekly template, so its closed shading and the working-today filter answer
 * for that calendar rather than for the venue's union.
 *
 * An inactive calendar earns a column only for bookings it still holds. Bookings
 * that name no listed calendar (a scoped link, a legacy row, a feed without
 * calendar ids) keep a venue-level column so nothing the feed shares drops off
 * the grid, and a venue that lists no calendars keeps that column too.
 */
export function linkedVenueColumns(venue: LinkedVenueCalendar, date: string): LinkedVenueColumn[] {
  const known = new Set(venue.practitioners.map((p) => p.id));
  const byPractitioner = new Map<string, LinkedBooking[]>();
  const unassigned: LinkedBooking[] = [];
  for (const b of venue.bookings) {
    if (b.bookingDate !== date) continue;
    if (b.practitionerId && known.has(b.practitionerId)) {
      const list = byPractitioner.get(b.practitionerId) ?? [];
      list.push(b);
      byPractitioner.set(b.practitionerId, list);
    } else {
      unassigned.push(b);
    }
  }
  const out: LinkedVenueColumn[] = [];
  for (const p of venue.practitioners) {
    const bookings = byPractitioner.get(p.id) ?? [];
    if (p.isActive === false && bookings.length === 0) continue;
    out.push({
      key: linkedColumnKey(venue.venueId, p.id),
      venue,
      practitionerId: p.id,
      name: p.name,
      openRanges: openRangesForDate(p.workingHours, date),
      hasTemplate: hasAnyWorkingHours(p.workingHours),
      bookings,
    });
  }
  if (unassigned.length > 0 || out.length === 0) {
    out.push({
      key: linkedColumnKey(venue.venueId),
      venue,
      practitionerId: null,
      name: venue.venueName,
      openRanges: linkedOpenRanges(venue, date),
      hasTemplate: linkedHasTemplate(venue),
      bookings: unassigned,
    });
  }
  return out;
}

/**
 * The column's classes, events and resource bookings for the date (web
 * `linkedVenueScheduleBlocksForColumn`): the blocks on this calendar, or, on
 * the venue-level column, the ones naming no listed calendar.
 */
export function linkedScheduleBlocksForColumn(
  venue: LinkedVenueCalendar,
  column: Pick<LinkedVenueColumn, 'practitionerId'>,
  date: string,
): CalendarScheduleBlock[] {
  const known = new Set(venue.practitioners.map((p) => p.id));
  const dtos = (venue.scheduleBlocks ?? []).filter((b) => {
    if (b.date !== date) return false;
    const calendarId = b.calendar_id ?? null;
    return column.practitionerId
      ? calendarId === column.practitionerId
      : !(calendarId && known.has(calendarId));
  });
  return dedupeScheduleDTOs(dtos).map(toCalendarScheduleBlock);
}
