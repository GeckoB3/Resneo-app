/**
 * Layout math for the day calendar grid. Mirrors the web's minute→pixel model
 * (web uses 48px / 15min); we use a slightly taller scale for touch.
 */

/** Vertical scale — pixels per minute. 2 → 120px per hour. */
export const PX_PER_MINUTE = 2;
/** Grid line interval in minutes (hour lines are emphasised). */
export const SLOT_MINUTES = 30;
/** Width of the left time-label gutter. */
export const TIME_GUTTER_WIDTH = 56;
/**
 * Minimum visual height (px) for a block so very short appointments stay
 * tappable AND have room for the guest name plus a compact action row. Visual
 * only — applied AFTER lane assignment so it never inflates a block's extent
 * into a false overlap. Lane packing runs on true minute ranges; this floor is
 * purely cosmetic.
 */
export const MIN_BLOCK_HEIGHT = 40;
/** Default opening when a day has no working hours. */
export const DEFAULT_START_HOUR = 8;
export const DEFAULT_END_HOUR = 20;
/** Snap empty-slot taps to this granularity (minutes). */
export const TAP_SNAP_MINUTES = 15;
/** Snap drag-to-move and resize to this granularity (web snaps to 1 min; 5 suits touch). */
export const DRAG_SNAP_MINUTES = 5;

/** "14:30" or "14:30:00" → minutes since midnight (870). */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':');
  const hours = Number(h);
  const minutes = Number(m ?? 0);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }
  return hours * 60 + minutes;
}

/** Minutes since midnight → "HH:mm". */
export function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export type GridBounds = { startHour: number; endHour: number };

/**
 * A user's visible-window preference (Calendar 02). Hours are 0–24; either side
 * may be null to leave that edge auto-fitted. Mirrors the web's
 * `startHourOverride`/`endHourOverride` persisted per venue.
 */
export type GridWindowOverride = {
  /** Preferred first hour (0–23), or null to auto-fit the start. */
  startHour?: number | null;
  /** Preferred last hour (1–24), or null to auto-fit the end. */
  endHour?: number | null;
};

/**
 * Pick grid start/end hours that contain every supplied minute-range (working
 * hours + bookings), so nothing is clipped. Falls back to the default window.
 *
 * An optional `override` lets the user pin the visible window (web parity:
 * From/Until selects). The override is applied NON-DESTRUCTIVELY: it can only
 * WIDEN the window, never clip content — the resolved window is the union of the
 * content bounds and the override. So pinning 09:00–14:00 forces at least that
 * window even on an empty day, but a booking at 16:00 still expands the end so it
 * can never be hidden off-grid. A null edge leaves that side auto-fitted.
 *
 * When there are no content ranges, a supplied override edge replaces the
 * corresponding default so an empty day honours the user's preferred window.
 */
export function computeGridBounds(
  ranges: { start: number; end: number }[],
  override?: GridWindowOverride | null,
): GridBounds {
  const ovStart = normalizeOverrideHour(override?.startHour, 0, 23);
  const ovEnd = normalizeOverrideHour(override?.endHour, 1, 24);

  let startHour: number;
  let endHour: number;

  if (ranges.length === 0) {
    // No content: the override (when present) defines the window; otherwise the
    // default day window.
    startHour = ovStart ?? DEFAULT_START_HOUR;
    endHour = ovEnd ?? DEFAULT_END_HOUR;
  } else {
    let minStart = Infinity;
    let maxEnd = -Infinity;
    for (const range of ranges) {
      minStart = Math.min(minStart, range.start);
      maxEnd = Math.max(maxEnd, range.end);
    }
    const contentStart = Math.max(0, Math.floor(minStart / 60));
    const contentEnd = Math.min(24, Math.ceil(maxEnd / 60));
    // Override WIDENS only: take the earlier start and the later end so a pinned
    // window can never clip a booking that falls outside it.
    startHour = ovStart != null ? Math.min(ovStart, contentStart) : contentStart;
    endHour = ovEnd != null ? Math.max(ovEnd, contentEnd) : contentEnd;
  }

  // Guarantee a sane, in-grid, at-least-one-hour window.
  startHour = Math.max(0, Math.min(23, startHour));
  endHour = Math.min(24, endHour);
  return { startHour, endHour: Math.max(endHour, startHour + 1) };
}

/** Coerce an override hour to an integer within [min, max], or null if unusable. */
function normalizeOverrideHour(
  value: number | null | undefined,
  min: number,
  max: number,
): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

// ---------------------------------------------------------------------------
// Lane packing — overlapping bookings sit side-by-side, never stacked.
// Port of the web's computeBookingClusterLayouts (PractitionerCalendarView).
// ---------------------------------------------------------------------------

export interface LaneInput {
  id: string;
  /** True extent in px from the grid top (NOT min-height inflated). */
  top: number;
  bottom: number;
}

export interface LaneLayout {
  /** 0-based lane within the overlap cluster. */
  laneIndex: number;
  /** Total lanes in this cluster (1 = no overlap, full width). */
  laneCount: number;
}

/**
 * Assign each block to a lane so blocks whose VISUAL extents overlap render
 * side-by-side. Greedy first-fit on sorted starts; every member of a
 * contiguous overlap cluster shares the cluster's lane count, mirroring the
 * web layout.
 */
export function computeLaneLayouts(items: LaneInput[]): Map<string, LaneLayout> {
  const result = new Map<string, LaneLayout>();
  if (items.length === 0) return result;

  const sorted = [...items].sort((a, b) => a.top - b.top || a.bottom - b.bottom);

  // Partition into clusters of transitively-overlapping blocks.
  let cluster: LaneInput[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    // Greedy lane assignment within the cluster.
    const laneEnds: number[] = [];
    const lanes = new Map<string, number>();
    for (const item of cluster) {
      let lane = laneEnds.findIndex((end) => end <= item.top);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.bottom);
      } else {
        laneEnds[lane] = item.bottom;
      }
      lanes.set(item.id, lane);
    }
    const laneCount = laneEnds.length;
    for (const item of cluster) {
      result.set(item.id, { laneIndex: lanes.get(item.id) ?? 0, laneCount });
    }
    cluster = [];
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.top >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.bottom);
  }
  flush();

  return result;
}
