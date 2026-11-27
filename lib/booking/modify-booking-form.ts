/**
 * Bounds, types and small pure helpers of the appointment modify form
 * (`components/bookings/ModifyBookingSheet.tsx`), moved out of the sheet
 * unchanged (codebase standards P5.2).
 */
import { MIN_CORE_DURATION_MINUTES } from '@/lib/booking/booking-core-duration';
import { formatPence } from '@/lib/format';
import type { AppointmentCatalogAddonGroup } from '@/types/appointment-catalog';

export const MAX_MINUTES = 23 * 60 + 59;
/**
 * Duration bounds. The floor is the ONE shared floor
 * ({@link MIN_CORE_DURATION_MINUTES}, 5) that the API, the calendar drag and the
 * reschedule sheet all use.
 *
 * It was 15 here, justified by the web modify form's `min={15}`. That input is
 * now `min={5}` too: web found eight places carrying their own 15 against an
 * engine floor of 5, so a 5 or 10 minute appointment "could be configured but
 * not booked, dragged but not saved". The last 15 in this app was here, and it
 * also gated the catalogue adoption below — a sub-15 service whose row had no
 * end time never resolved a duration at all, leaving Save disabled for good.
 */
export const MIN_DURATION_MINUTES = MIN_CORE_DURATION_MINUTES;
export const MAX_DURATION_MINUTES = 14 * 60;
/** Web parity: the duration input steps in 5s. */
export const DURATION_STEP_MINUTES = 5;
/** The by-hand start nudge steps in 5s too, onto a clean :00/:05/:10 grid. */
export const START_STEP_MINUTES = 5;
export const VALIDATE_DEBOUNCE_MS = 450;

/**
 * Step the start time by whole 5-minute marks. A start seeded off-grid (a slot
 * at 14:02, an overrun) snaps to the next mark in the direction of travel rather
 * than carrying the offset forward, so the value always lands on :00/:05/:10.
 */
export function stepStartMinutes(current: number, direction: 1 | -1): number {
  const stepped =
    direction === 1
      ? (Math.floor(current / START_STEP_MINUTES) + 1) * START_STEP_MINUTES
      : (Math.ceil(current / START_STEP_MINUTES) - 1) * START_STEP_MINUTES;
  return Math.min(MAX_MINUTES, Math.max(0, stepped));
}

/**
 * Which pane of the sheet is showing. The date/time pickers and the post-save
 * notify prompt are STEPS inside this sheet, not sheets of their own: opening a
 * second modal from a visible one is unreliable on iOS, and a month grid nested
 * in the form's ScrollView would put two same-axis scrollers on screen at once.
 */
export type Mode = 'form' | 'date' | 'time' | 'notify' | 'visitService';

/** One line of a visit's service list, as the form holds it. */
export type VisitServiceLine = {
  /** Stable across edits so React keys survive a swap. */
  key: string;
  /** The row this line keeps, or null for a service being added. */
  bookingId: string | null;
  serviceId: string;
  variantId: string | null;
  /**
   * Who does a service being added (split-visit plan 8.8, G11). A kept line
   * stays with its own person; see `visitServiceLinesRequest`.
   */
  calendarId?: string | null;
};

export type CheckState =
  | { state: 'idle' | 'checking' | 'unknown' }
  /**
   * `outsideHours`: the dry run passed only because of the hours override the
   * sheet always sends (web #186), so the time sits outside the calendar's
   * working or opening hours. Allowed, and said so.
   */
  | { state: 'valid'; outsideHours: boolean }
  | { state: 'invalid'; reason: string };

export function formatDuration(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Short "+£X · +Ymin" badge for an add-on, or null when it adds nothing. */
export function addonExtraLabel(pricePence: number, durationMinutes: number): string | null {
  const parts: string[] = [];
  if (pricePence > 0) {
    const formatted = formatPence(pricePence);
    if (formatted) parts.push(`+${formatted}`);
  }
  if (durationMinutes > 0) parts.push(`+${durationMinutes} min`);
  return parts.length ? parts.join(' · ') : null;
}

/** Per-group selection rule hint (mirrors the wizard's AddonsStep). */
export function addonRequirementLabel(group: AppointmentCatalogAddonGroup['group']): string | null {
  const { selection_type, min_select, max_select } = group;
  if (min_select > 0 && max_select != null && min_select === max_select) {
    return `Choose ${min_select}`;
  }
  if (min_select > 0) return `Choose at least ${min_select}`;
  if (selection_type === 'single') return 'Optional · choose one';
  if (max_select != null) return `Optional · up to ${max_select}`;
  return 'Optional';
}
