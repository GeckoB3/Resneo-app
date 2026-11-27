/**
 * Pure helpers and constants for the diary screen (`app/(app)/(tabs)/index.tsx`),
 * moved out of the screen unchanged (codebase standards P5.2).
 */
import { getDateTimeFormat } from '@/lib/dates/formatters';
import { dedupeScheduleDTOs, toCalendarScheduleBlock } from '@/lib/calendar/schedule-block-view';
import type { CalendarGridBooking } from '@/types/calendar-grid';
import type { CalendarScheduleBlock, ScheduleBlockDTO } from '@/types/schedule-blocks';

/** A row with no usable end reads as this long, as on the grids. */
export const DEFAULT_SERVICE_MINUTES = 30;

export type Scope = 'day' | 'week' | 'month';

export const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

/**
 * Statuses whose bookings may be hold-dragged / resized (web parity:
 * Pending|Booked|Confirmed|Seated — surfaced as "Started" in the UI). A
 * Completed/No-Show/Cancelled booking is never movable; the drag handlers
 * refuse it up front and the block's gesture is disabled to match.
 */
export const MOVABLE_BOOKING_STATUSES = new Set(['Pending', 'Booked', 'Confirmed', 'Seated']);

/**
 * A grid booking is movable when its status is in the movable set and it is not
 * a resource booking. The calendar-grid payload doesn't type a `resource_id`
 * (resource bookings reach the grid as read-only schedule blocks, never as
 * draggable appointment bars), so the resource check is a defensive runtime
 * read that stays correct if the payload ever carries one.
 */
export function isMovableBooking(booking: CalendarGridBooking): boolean {
  if (!MOVABLE_BOOKING_STATUSES.has(booking.status)) return false;
  const resourceId = (booking as { resource_id?: string | null }).resource_id;
  return resourceId == null;
}

/** Minimal horizontal-swipe distance (dp) to step a day/week — web parity feel. */
export const SWIPE_STEP_THRESHOLD = 56;

/**
 * Viewport width (dp) at/above which the DAY view shows every practitioner's
 * column side-by-side (multi-calendar grid) instead of one practitioner at a
 * time. Tablets and landscape phones clear this; phone-portrait stays single.
 */
export const WIDE_DAY_MIN_WIDTH = 700;
/**
 * Landscape phones can be narrower than a tablet but still wide enough for a few
 * columns: treat "landscape AND at least this wide" as a wide viewport too.
 */
export const WIDE_LANDSCAPE_MIN_WIDTH = 600;

/** True on a tablet, or a landscape phone wide enough for multiple columns. */
export function isWideDayViewport(width: number, height: number): boolean {
  return width >= WIDE_DAY_MIN_WIDTH || (width > height && width >= WIDE_LANDSCAPE_MIN_WIDTH);
}

// ---------------------------------------------------------------------------
// Schedule feed -> calendar overlay blocks
//
// GET /api/venue/schedule returns a FLAT, venue-wide ScheduleBlockDTO[] for
// CLASSES, EVENTS and RESOURCE bookings. This feed is DISJOINT from the grid's
// `sessions`/event_sessions (the web draws the calendar's class/event capacity
// blocks from THIS feed), so rendering both never double-counts.
//
// Class sessions arrive denormalised: one `ci-*` block per empty session AND
// one `bk-*` block PER BOOKING for booked sessions (same as useClassSchedule's
// dedupe). We collapse those to ONE block per class_instance so a busy class
// doesn't stack N identical overlays. Events are already one row per event;
// resource bookings are one row per booking (kept as-is).
// ---------------------------------------------------------------------------

// KIND_ACCENT / capacityLabelFor / toCalendarScheduleBlock / dedupeScheduleDTOs
// live in lib/calendar/schedule-block-view.ts (shared with the linked grid).

/** Stable map key for a calendar column + date. */
export function scheduleKey(calendarId: string, date: string): string {
  return `${calendarId} ${date}`;
}

/**
 * Group blocks by `${calendarId} ${date}` (see {@link scheduleKey}) so each
 * calendar column on a given date gets its own normalized list. Class
 * instances are deduped first; events/resources pass through.
 *
 * Blocks with a null/missing `calendar_id` have no column to attach to (the web
 * only renders staff columns), so they're dropped here -- the key never matches
 * a real column. We count + log the omission (dev only) so it's visible during
 * the device-gated QA rather than silent.
 */
export function groupScheduleByCalendarDate(
  blocks: ScheduleBlockDTO[],
): Map<string, CalendarScheduleBlock[]> {
  const map = new Map<string, CalendarScheduleBlock[]>();
  let droppedNoColumn = 0;
  for (const dto of dedupeScheduleDTOs(blocks)) {
    if (!dto.calendar_id) {
      // No staff column to attach to, so it can't render (matches the web,
      // which only shows staff columns). Counted + logged below for device QA.
      droppedNoColumn += 1;
      continue;
    }
    const key = scheduleKey(dto.calendar_id, dto.date);
    const list = map.get(key) ?? [];
    list.push(toCalendarScheduleBlock(dto));
    map.set(key, list);
  }
  if (droppedNoColumn > 0 && __DEV__) {
    console.log(
      `[calendar] skipped ${droppedNoColumn} schedule block(s) with no calendar_id (no column to render on).`,
    );
  }
  return map;
}

/**
 * A YYYY-MM-DD calendar date as LOCAL noon. Parsing it as UTC noon and then
 * reading local weekday / day-number fields shifts a day at UTC+13 and +14,
 * which mislabelled the week header there.
 */
export function localNoon(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

/** Current wall-clock time (minutes since midnight) in the venue timezone. */
export function nowMinutesInTz(timeZone: string): number {
  const parts = getDateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}
