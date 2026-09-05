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
): CalendarGridBooking {
  const pracName = practitioners.find((p) => p.id === b.practitionerId)?.name;
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
