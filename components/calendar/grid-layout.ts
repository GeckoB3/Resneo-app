/**
 * Layout math for the day calendar grid. Mirrors the web's minute→pixel model
 * (web uses 48px / 15min); we use a slightly taller scale for touch.
 */

/** Vertical scale — pixels per minute. 2 → 120px per hour. */
export const PX_PER_MINUTE = 2;
/**
 * Compact-day floor for the vertical scale — the web's MIN_SLOT_PX legibility
 * floor (16px per 15-minute slot). Compact mode fits the whole day into the
 * viewport but never squeezes tighter than this, so a very long day still
 * scrolls a little rather than becoming unreadable.
 */
export const COMPACT_MIN_PX_PER_MINUTE = 16 / 15;
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
/**
 * Compact-day visual floor for a block — one name row (12/15 text) plus the
 * card's vertical padding. Deliberately smaller than {@link MIN_BLOCK_HEIGHT}:
 * compact mode trades tap comfort for a glanceable whole-day overview (web
 * parity: bars shrink to the slot scale), and a squeezed bar still opens its
 * detail on tap.
 */
export const COMPACT_MIN_BLOCK_HEIGHT = 20;

/**
 * Compact-day vertical scale: fit the WHOLE visible window into the measured
 * grid viewport (web parity: the measured slot height, clamped between the
 * 16px/15min legibility floor and the comfortable scale — compact never zooms
 * IN past comfortable). `chromePx` is the vertical chrome inside the viewport
 * that the time canvas can't use (top padding, column headers, bottom gutter).
 * Until the viewport is measured (0), returns the floor so the first painted
 * frame is at most too small, never a jump-down.
 */
export function computeCompactPxPerMinute(
  viewportHeight: number,
  startHour: number,
  endHour: number,
  chromePx = 0,
): number {
  const totalMinutes = Math.max(60, (endHour - startHour) * 60);
  if (viewportHeight <= 0) return COMPACT_MIN_PX_PER_MINUTE;
  const fit = (viewportHeight - chromePx) / totalMinutes;
  return Math.min(PX_PER_MINUTE, Math.max(COMPACT_MIN_PX_PER_MINUTE, fit));
}
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

/**
 * Web-parity breakpoint for the multi-calendar column floor: Tailwind's `sm`
 * (640px window width), where the web switches from the phone column model to
 * the desktop 240px floor.
 */
const COLUMN_FLOOR_BREAKPOINT = 640;
/** Desktop column floor (web: `sm:min-w-[240px]`). */
const COLUMN_MIN_WIDTH_WIDE = 240;
/** Phone column cap (web: `min-w-[min(16rem, calc(100vw - 5.5rem))]` → 16rem). */
const COLUMN_MIN_WIDTH_PHONE_CAP = 256;
/**
 * Phone: how much narrower than the columns viewport a column floors at (web's
 * `100vw - 5.5rem` = viewport − gutter − 32px), leaving a peek of the next
 * column so the horizontal scroll affords itself.
 */
const COLUMN_PHONE_PEEK = 32;
/** Absolute floor so a degenerate viewport can't produce unusably thin columns. */
const COLUMN_MIN_WIDTH_FLOOR = 160;

/**
 * Minimum column width for the multi-calendar day grid (web parity).
 *
 * The web's columns are `min-w-[min(16rem, calc(100vw - 5.5rem))] flex-1` on
 * phones — one nearly full-screen column (capped at 256px) with a sliver of the
 * next peeking in, swiped horizontally — and `sm:min-w-[240px]` on wider
 * viewports. Wide columns are what give the guest name and the quick actions
 * room to render side by side.
 *
 * @param columnsViewportWidth Width available to the columns (excludes the gutter).
 */
export function computeColumnMinWidth(columnsViewportWidth: number): number {
  const windowWidth = columnsViewportWidth + TIME_GUTTER_WIDTH;
  if (windowWidth >= COLUMN_FLOOR_BREAKPOINT) return COLUMN_MIN_WIDTH_WIDE;
  return Math.max(
    COLUMN_MIN_WIDTH_FLOOR,
    Math.min(COLUMN_MIN_WIDTH_PHONE_CAP, columnsViewportWidth - COLUMN_PHONE_PEEK),
  );
}

/**
 * Width for each column in the multi-calendar day grid so the columns FILL the
 * available width when they fit, and fall back to a fixed minimum (the grid then
 * scrolls horizontally) when there are too many to fit. Mirrors the web's
 * `flex-1` + `min-w` columns. Each column reserves a trailing `gap`, so N columns
 * occupy `N * (width + gap)`; solving for "content == viewport" gives the fill
 * width. Below `minWidth` we stop shrinking and let the grid scroll instead.
 *
 * @param viewportWidth Width available to the columns (excludes the time gutter).
 * @param columnCount   Number of columns to lay out.
 * @param gap           Trailing gap reserved per column (dp).
 * @param minWidth      Floor width; columns never shrink below this.
 */
export function computeFillColumnWidth(
  viewportWidth: number,
  columnCount: number,
  gap: number,
  minWidth: number,
): number {
  if (columnCount <= 0 || viewportWidth <= 0) return minWidth;
  const fill = Math.floor((viewportWidth - gap * columnCount) / columnCount);
  return Math.max(minWidth, fill);
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
