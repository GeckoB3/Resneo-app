import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type ScrollView as ScrollViewType,
} from 'react-native';

import { DraggableAppointmentBlock } from '@/components/calendar/DraggableAppointmentBlock';
import {
  COMPACT_MIN_BLOCK_HEIGHT,
  computeBlockHeights,
  computeCompactPxPerMinute,
  computeGridBounds,
  computeRangeHeights,
  hourLabel,
  MIN_BLOCK_HEIGHT,
  minutesToTime,
  PX_PER_MINUTE,
  TAP_SNAP_MINUTES,
  TIME_GUTTER_WIDTH,
  timeToMinutes,
  type GridWindowOverride,
  type LaneInput,
} from '@/components/calendar/grid-layout';
import { Text } from '@/components/ui/Text';

import { arrivalToggleTargets, statusChangeTargets } from '@/lib/calendar/bar-actions';
import { visitChipLabel, visitTouchingEdges } from '@/lib/calendar/visit-siblings';
import {
  hostRegionsAroundNested,
  layoutOverlapClusters,
  type BookingClusterLayout,
  type MinuteRange,
} from '@/lib/calendar/booking-cluster-layout';
import {
  clusterCalendarBookings,
  type CalendarBookingCluster,
} from '@/lib/calendar/cluster-bookings';
import { isNonWorkingBlock, isOccupyingBlock, narrowWorkingRanges } from '@/lib/calendar/occupying-blocks';
import { closureBandLook } from '@/components/calendar/closure-band';
import { IconButton } from '@/components/ui/IconButton';
import { workingHoursLabel } from '@/lib/calendar/column-hours-label';
import {
  clampClosureBlocksToWindow,
  isScheduleClosureBlockType,
  partitionClosureBands,
} from '@/lib/calendar/schedule-closures';
import {
  bookingProcessingBlocks,
  clusterPaintRegions,
  clusterProcessingGaps,
  occupiedRangesMinusGaps,
  processingGapRanges,
  type ProcessingPatternLookup,
} from '@/lib/calendar/processing-gaps';
import { venueClosedRanges, type VenueDayHours } from '@/lib/calendar/venue-closures';
import { hexToRgba } from '@/lib/color';
import type { ComplianceBookingFlag } from '@/lib/queries/useCompliance';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  CalendarGridBooking,
  CalendarGridSession,
  CalendarGridWorkingHours,
} from '@/types/calendar-grid';
import type { CalendarScheduleBlock } from '@/types/schedule-blocks';

/** Indigo accent for class/event capacity blocks — distinct from booking hues. */
const SESSION_ACCENT = '#6366F1';

type PositionedBooking = {
  /** One visit — a standalone booking, or every service/person sharing a group id. */
  cluster: CalendarBookingCluster;
  top: number;
  height: number;
  laneIndex: number;
  laneCount: number;
  durationMinutes: number;
  timeLabel: string;
  /**
   * One service of a multi-service visit (web #187): the chip's label, whether
   * a sibling meets this bar edge to edge above / below, and the status whose
   * colour the whole visit wears (its earliest service's).
   */
  visitChip: string | null;
  spineTop: boolean;
  spineBottom: boolean;
  paletteStatus: string | null;
  /** Rows the drag's conflict check ignores: the bar's own, plus its visit's siblings here. */
  conflictIds: string[];
  /**
   * Set when this bar rides inside another bar's processing gap (web #177):
   * drawn above its host in the host's lane, `nestDepth` levels down a chain.
   */
  nestedInKey?: string;
  nestDepth?: number;
  /**
   * The lozenges the bar paints (web #185), as px bands from its own top: its
   * span less the middle processing gaps, the free foot where processing runs
   * to the end, and the wait between a visit's services. The grid shows
   * through between them and every lozenge end is rounded like a bar end.
   */
  pieces: { top: number; height: number }[];
  /** A visit's later services, each labelled on its own block of service time. */
  segments: { top: number; height: number; serviceName: string; timeLabel: string }[];
  /** The bookable parts of the holes, with the wall-clock minutes they span. */
  freeTaps: { top: number; height: number; startMinute: number; endMinute: number }[];
  /** The turnover band under the bar (px from its top), or null without a buffer. */
  bufferBand: { top: number; height: number } | null;
  /**
   * When nested bars or the bar's own holes cover parts of this bar, the px
   * region (from its own top) its text and buttons keep to.
   */
  contentInset?: { top: number; height: number };
};

/** Blocked-out time (break / leave / manual block) rendered as a grey overlay. */
export type CalendarTimeBlock = {
  id: string;
  /** HH:mm[:ss] */
  start: string;
  end: string;
  label?: string | null;
  /** When set, tapping the block calls onBlockTimeBlockPress instead of swallowing. */
  isEditable?: boolean;
  /**
   * `calendar_blocks.block_type` — decides whether the drag treats this as a
   * wall or as advice (see `lib/calendar/occupying-blocks`). Omitted means
   * "unknown", which occupies, so a caller that doesn't set it is unchanged.
   */
  blockType?: string | null;
};

type PositionedTimeBlock = {
  block: CalendarTimeBlock;
  top: number;
  height: number;
  timeLabel: string;
};

type PositionedSession = {
  session: CalendarGridSession;
  top: number;
  height: number;
  timeLabel: string;
};

type PositionedScheduleBlock = {
  block: CalendarScheduleBlock;
  top: number;
  height: number;
  timeLabel: string;
};

/** Half-open minute range used for drag-conflict detection. */
export type BusyRange = { start: number; end: number };

/** Statuses that occupy the practitioner's wall for conflict math (web parity:
 *  Cancelled/No-Show bookings are excluded). Mutability (which bookings may be
 *  dragged) is a stricter set — see MOVABLE_STATUSES. */
export const CONFLICT_IGNORED_STATUSES = new Set(['Cancelled', 'No-Show']);

/**
 * Statuses whose blocks may be hold-dragged / resized (web parity:
 * Pending|Booked|Confirmed|Seated — the app shows "Seated" as "Started"). A
 * Completed/No-Show/Cancelled block is rendered but its gesture is disabled, so
 * the move can't even start. The parent ALSO refuses these in its drag handlers.
 */
export const MOVABLE_STATUSES = new Set(['Pending', 'Booked', 'Confirmed', 'Seated']);

type CalendarDayGridProps = {
  bookings: CalendarGridBooking[];
  /**
   * UNFILTERED booking set for drag-conflict detection only. The visible
   * `bookings` may be narrowed by the status filter, but the overlap guard must
   * still see hidden bookings (web parity: conflict uses the full grid set).
   * Falls back to `bookings` when not supplied. Sessions + scheduleBlocks are
   * also folded into the busy ranges, so the guard sees classes/events/resources
   * too — not just appointments + manual blocks.
   */
  conflictBookings?: CalendarGridBooking[];
  workingHours: CalendarGridWorkingHours[];
  /** Breaks/blocks for this practitioner+day — render as non-bookable overlays. */
  timeBlocks?: CalendarTimeBlock[];
  /** Class/event capacity blocks from the grid payload (rendered as indigo). */
  sessions?: CalendarGridSession[];
  /**
   * CLASS / EVENT / RESOURCE blocks from the /api/venue/schedule feed for this
   * calendar+day — read-only, named, accent-coloured. Disjoint from `sessions`
   * (different feed) so they never double-render.
   */
  scheduleBlocks?: CalendarScheduleBlock[];
  /** Venue open/closed state for this date → shades the closed (out-of-hours) time. */
  venueHours?: VenueDayHours;
  /**
   * The calendar this column shows. Draws a header row over the canvas — the
   * name with the day's working hours under it (web: the column header) —
   * and names the calendar on its "unavailable" stripes.
   */
  calendarName?: string;
  /**
   * The clock button in the header's top-left corner, where the header row
   * meets the time column (web: the toolbar's "Amend hours"). Opens the
   * amend-hours chooser; the host decides what it offers.
   */
  onAmendHours?: () => void;
  /**
   * Extra minute ranges this day must span whatever the viewed calendar works
   * (web `calendarWorkingBoundsForDates`: the diary widens to every active
   * calendar's hours, so the scale does not change with the column filter).
   */
  boundsRanges?: { start: number; end: number }[];
  /**
   * User's visible-window override (web parity: From/Until). Widens the grid to
   * the pinned window without ever clipping a booking outside it. Null/omitted →
   * auto-fit only.
   */
  windowOverride?: GridWindowOverride | null;
  /** Current time in minutes-since-midnight, or null when not viewing today. */
  nowMinutes: number | null;
  onBlockPress: (bookingId: string) => void;
  /** Called when a quick-status tray button is tapped on an appointment block. */
  onStatusChange?: (bookingIds: string[], status: string) => void;
  /** Called when the arrived toggle is tapped on an appointment block. */
  onArrivalToggle?: (bookingIds: string[], arrived: boolean) => void;
  /** Set of booking ids currently in flight for status/arrival changes. */
  pendingActionIds?: Set<string>;
  /** Per-booking compliance flags (bookingId → flag) for the corner dot. */
  complianceFlags?: Record<string, ComplianceBookingFlag>;
  onEmptyPress: (time: string) => void;
  /** Called when a user taps an editable time block (for edit/delete). */
  onBlockTimeBlockPress?: (blockId: string) => void;
  /** Called when the user completes a hold-drag-to-reschedule on a block. */
  onDragReschedule?: (bookingId: string, newTime: string) => void;
  /** Called when the user hold-drags the bottom edge to change duration. */
  onDragResize?: (bookingId: string, newDurationMinutes: number) => void;
  /** Called when a drag/resize is refused for overlapping another block. */
  onDragConflictReject?: () => void;
  /** Pull-to-refresh — true while the grid query is refetching. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /**
   * Render at full intrinsic height inside a plain View instead of the grid's
   * own vertical ScrollView, letting a PARENT scroll container own the vertical
   * scroll. Stacking this grid's same-axis ScrollView inside another vertical
   * ScrollView (the calendar's "All incl. linked" view, the linked-calendar
   * screen) makes the parent unscrollable and hides the grids below it.
   * `refreshing`/`onRefresh` are then owned by the parent and ignored here.
   */
  embedded?: boolean;
  /**
   * Compact day rows (web parity: the toolbar "Compact" toggle) — shrink the
   * vertical scale so the whole day fits the measured viewport (floored at the
   * web's 16px/15min legibility scale), for an at-a-glance busy-ness read.
   * Blocks shrink with the scale (their density rules drop text rows/actions),
   * and the resize affordance is hidden. Embedded grids can't measure a
   * viewport, so compact there renders at the floor scale.
   */
  compact?: boolean;
  /**
   * Finds a service's processing pattern by id, for bookings that carry no
   * snapshot of their own (see `lib/calendar/processing-gaps`). Omitted: only
   * snapshots draw gaps, and nothing nests where a pattern would have applied.
   */
  processingPatternFor?: ProcessingPatternLookup | null;
};

const DEFAULT_DURATION_MINUTES = 30;
/** Bottom gutter reserved by the compact fit so the day ends just above the fold. */
const COMPACT_BOTTOM_GUTTER = 16;
/** The header row over the canvas: the calendar's name and hours, the clock corner. */
const HEADER_HEIGHT = 40;

/**
 * What a screen reader says for a closure stripe. A partitioned stripe's words
 * already end in its minutes ("Venue closed 18:00 to 20:00"), so appending the
 * range again would read them twice.
 */
function closureStripeA11yLabel(label: string | null | undefined, timeLabel: string): string {
  const text = label?.trim() || 'Closed';
  return /\d{1,2}:\d{2} to \d{1,2}:\d{2}$/.test(text) ? text : `${text} ${timeLabel}`;
}

/** Scrollable single-day, single-practitioner time grid. */
export function CalendarDayGrid({
  bookings,
  conflictBookings,
  workingHours,
  timeBlocks = [],
  sessions = [],
  scheduleBlocks = [],
  venueHours,
  calendarName,
  onAmendHours,
  boundsRanges,
  windowOverride,
  nowMinutes,
  onBlockPress,
  onStatusChange,
  onArrivalToggle,
  pendingActionIds,
  complianceFlags,
  onEmptyPress,
  onBlockTimeBlockPress,
  onDragReschedule,
  onDragResize,
  onDragConflictReject,
  refreshing = false,
  onRefresh,
  embedded = false,
  compact = false,
  processingPatternFor,
}: CalendarDayGridProps) {
  const { colors, isDark } = useTheme();
  const scrollRef = useRef<ScrollViewType | null>(null);
  // The header row (name + hours, the clock corner) sits above the canvas
  // whenever the host names the column or offers the clock.
  const showHeader = Boolean(calendarName) || Boolean(onAmendHours);
  const headerHeight = showHeader ? HEADER_HEIGHT : 0;

  // Measured size of the grid's scroll viewport. Height: compact mode fits the
  // whole day into it (0 until the first layout → compact uses its floor
  // scale). Width: budgets how many quick actions fit a block's overlap lane
  // (web parity: buttons show where space allows — a phone-width column split
  // three ways gets a clean name-only bar, not a crammed button).
  const [viewportHeight, setViewportHeight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  // The blocks layer is inset from the grid edges (time gutter + margins).
  const blocksLayerWidth = Math.max(
    0,
    viewportWidth - TIME_GUTTER_WIDTH - spacing.xs - spacing.sm,
  );

  // Parse times + resolve the day's bounds FIRST (minute space, scale-free); the
  // pixel scale below depends on the bounds, and the px positioning memo depends
  // on both.
  const { bounds, rawBlocks, rawTimeBlocks, rawSessions, rawScheduleBlocks, workingRanges } =
    useMemo(() => {
      const ranges: { start: number; end: number }[] = [];
      const working: BusyRange[] = [];
      for (const wh of workingHours) {
        const r = { start: timeToMinutes(wh.start), end: timeToMinutes(wh.end) };
        ranges.push(r);
        working.push(r);
      }
      // The grid always shows the widest span anything is scheduled open: the
      // venue's hours OR the calendar's own (web 2026-09-10). A calendar working
      // 08:00–20:00 in a venue open 09:00–18:00 draws 08:00–20:00, and a venue
      // open past the calendar's day draws to the venue's close, with the
      // stripes saying which side is closed in each hour.
      if (venueHours?.kind === 'open') {
        for (const period of venueHours.periods) ranges.push({ start: period.start, end: period.end });
      }
      // Every active calendar's hours on the date, so one column's day spans
      // the same window as the side-by-side view (web parity).
      for (const r of boundsRanges ?? []) ranges.push({ start: r.start, end: r.end });

      // One bar per booking row (web #187: a visit's services are independent
      // bars, each knowing its place in the visit; see `clusterCalendarBookings`).
      const blocks = clusterCalendarBookings(
        bookings.map((booking) => {
          const start = timeToMinutes(booking.startTime);
          let end = booking.endTime
            ? timeToMinutes(booking.endTime)
            : start + DEFAULT_DURATION_MINUTES;
          if (end <= start) {
            end = start + DEFAULT_DURATION_MINUTES;
          }
          return { booking, start, end };
        }),
      );
      for (const { start, end } of blocks) {
        ranges.push({ start, end });
      }

      const allTimeBlocks = timeBlocks
        .map((block) => {
          const start = timeToMinutes(block.start);
          const end = timeToMinutes(block.end);
          return { block, start, end };
        })
        .filter(({ start, end }) => end > start);
      /**
       * Closure bands (venue/calendar closed, leave, amended hours) are DRAWN in
       * the day but must not define it. A full-day band is emitted 00:00–23:59
       * and would otherwise drag the visible window out to midnight — an output
       * of the day's bounds cannot also be an input to them.
       */
      for (const { block, start, end } of allTimeBlocks) {
        if (isScheduleClosureBlockType(block.blockType)) continue;
        ranges.push({ start, end });
      }

      const sess = sessions
        .map((session) => {
          const start = timeToMinutes(session.startTime);
          const end = timeToMinutes(session.endTime);
          return { session, start, end };
        })
        .filter(({ start, end }) => end > start);
      for (const { start, end } of sess) {
        ranges.push({ start, end });
      }

      const schedBlocks = scheduleBlocks
        .map((block) => {
          const start = timeToMinutes(block.startTime);
          const end = timeToMinutes(block.endTime);
          return { block, start, end };
        })
        .filter(({ start, end }) => end > start);
      for (const { start, end } of schedBlocks) {
        ranges.push({ start, end });
      }

      // R17-2: a break sits INSIDE working hours, so without cutting it out a
      // drop over it would read green. Cutting it makes `evaluateConflict` fall
      // through to level 1 — allowed, amber — which is what web's note does.
      // Amended hours are excluded from the cut: that window is the venue open.
      const nonWorking = allTimeBlocks
        .filter(({ block }) => isNonWorkingBlock(block.blockType))
        .map(({ start, end }) => ({ start, end }));

      const gridBounds = computeGridBounds(ranges, windowOverride);
      const tBlocks = clampClosureBlocksToWindow(
        allTimeBlocks,
        gridBounds.startHour * 60,
        gridBounds.endHour * 60,
      );

      return {
        bounds: gridBounds,
        rawBlocks: blocks,
        rawTimeBlocks: tBlocks,
        rawSessions: sess,
        rawScheduleBlocks: schedBlocks,
        workingRanges: narrowWorkingRanges(working, nonWorking),
      };
    }, [bookings, workingHours, timeBlocks, sessions, scheduleBlocks, windowOverride, venueHours, boundsRanges]);

  // Vertical scale: comfortable 2px/min, or compact fit-the-day-to-the-viewport
  // (web parity: measured slot height, floored at 16px/15min). The fit subtracts
  // the scroll padding above the canvas, the header row and a small bottom gutter.
  const pxPerMinute = compact
    ? computeCompactPxPerMinute(
        viewportHeight,
        bounds.startHour,
        bounds.endHour,
        spacing.sm + headerHeight + COMPACT_BOTTOM_GUTTER,
      )
    : PX_PER_MINUTE;
  const minBlockHeight = compact ? COMPACT_MIN_BLOCK_HEIGHT : MIN_BLOCK_HEIGHT;

  const {
    startHour,
    endHour,
    totalHeight,
    positioned,
    positionedBlocks,
    positionedSessions,
    positionedScheduleBlocks,
  } = useMemo(() => {
    const gridStartMin = bounds.startHour * 60;
    const total = (bounds.endHour - bounds.startHour) * 60 * pxPerMinute;

    // Lanes AND nesting on TRUE minute ranges (web `layoutOverlapClusters`,
    // #177): a booking that starts inside another's processing gap and keeps to
    // it for as long as the host lasts rides in the host's lane, drawn over the
    // host's band, so neither bar loses half the column. Anything that still
    // overlaps is split into side-by-side lanes. The visual min-height is
    // applied AFTER lane assignment so it never inflates extents into false
    // overlaps, and lanes are packed on the CLUSTER's extent, so a merged visit
    // occupies the column for its whole length.
    const gapsByLead = new Map<string, MinuteRange[]>();
    const spanById = new Map<string, number>();
    for (const cluster of rawBlocks) {
      gapsByLead.set(
        cluster.lead.id,
        clusterProcessingGaps(cluster.bookings, processingPatternFor, DEFAULT_DURATION_MINUTES),
      );
      spanById.set(cluster.lead.id, cluster.end - cluster.start);
    }
    const lanes = layoutOverlapClusters(
      rawBlocks.map(({ lead, start, end }) => ({
        key: lead.id,
        start,
        end,
        gaps: gapsByLead.get(lead.id),
      })),
    );
    const laneInputs: LaneInput[] = rawBlocks.map(({ lead, start, end }) => ({
      id: lead.id,
      top: (start - gridStartMin) * pxPerMinute,
      bottom: (end - gridStartMin) * pxPerMinute,
    }));
    // Heights are the TRUE extents; the degenerate floor may only grow a block
    // into free space, so a bar never runs past the next booking's start.
    const heights = computeBlockHeights(
      laneInputs.map((input) => ({
        ...input,
        laneIndex: lanes.get(input.id)?.laneIndex ?? 0,
      })),
      minBlockHeight,
    );

    const blocks: PositionedBooking[] = rawBlocks.map((cluster) => {
      const { lead, start, end } = cluster;
      const lane: BookingClusterLayout = lanes.get(lead.id) ?? { laneIndex: 0, laneCount: 1 };
      const top = (start - gridStartMin) * pxPerMinute;
      const height = heights.get(lead.id) ?? (end - start) * pxPerMinute;
      // What the bar paints and leaves open (web #185): middle gaps and the
      // free foot are holes the grid shows through, the wait between a visit's
      // services too; the bookable parts take taps; the buffer hangs under it.
      const paint = clusterPaintRegions(cluster.bookings, processingPatternFor, DEFAULT_DURATION_MINUTES);
      // A host keeps its text (and its buttons, which share the region on the
      // app's bars) off the bars nested in it AND off its own free time, above
      // the first band or below one at its top edge. On a visit the main text
      // also stops where the FIRST service's busy stretch ends, so the later
      // services' own labels never sit under it.
      const firstSegment = paint.segments[0];
      const laterSegments = paint.segments.slice(1);
      const covered = [
        ...(lane.nestedRanges ?? []),
        ...paint.holes,
        ...(laterSegments.length > 0 && firstSegment
          ? [{ start: firstSegment.activeEnd, end }]
          : []),
      ];
      const regions = covered.length > 0 ? hostRegionsAroundNested({ start, end }, covered, 0) : null;
      const lastBuffer = paint.bufferBands[paint.bufferBands.length - 1] ?? null;
      // One service of a visit (web #187): its chip, the seams with its
      // siblings in this column, and the colour of the visit's earliest service.
      const visitEdges = cluster.visit
        ? visitTouchingEdges({
            row: lead,
            rows: bookings,
            columnIdOf: () => 'column',
            spanMinutesOf: (row) => spanById.get(row.id) ?? DEFAULT_DURATION_MINUTES,
            toMinutes: timeToMinutes,
          })
        : null;
      return {
        cluster,
        top,
        height,
        laneIndex: lane.laneIndex,
        laneCount: lane.laneCount,
        durationMinutes: Math.max(end - start, TAP_SNAP_MINUTES),
        timeLabel: `${minutesToTime(start)}–${minutesToTime(end)}`,
        visitChip: cluster.visit ? visitChipLabel(cluster.visit) : null,
        spineTop: visitEdges?.top ?? false,
        spineBottom: visitEdges?.bottom ?? false,
        // Each service wears ITS OWN status colour. The web tints every bar of
        // a visit with the earliest service's status, but Start and Complete
        // are per service, and that tint hid the very state a press changes:
        // starting the first service recoloured all of them, starting the
        // second changed nothing on screen. The chip and the spine still say
        // the bars belong together.
        paletteStatus: null,
        conflictIds: cluster.visit
          ? bookings
              .filter(
                (b) =>
                  b.group_booking_id?.trim() === cluster.visit!.groupId &&
                  !CONFLICT_IGNORED_STATUSES.has(b.status),
              )
              .map((b) => b.id)
          : cluster.ids,
        nestedInKey: lane.nestedInKey,
        nestDepth: lane.nestDepth,
        pieces: paint.pieces.map((piece) => ({
          top: (piece.start - start) * pxPerMinute,
          height: (piece.end - piece.start) * pxPerMinute,
        })),
        segments: laterSegments.map((segment) => ({
          top: (segment.start - start) * pxPerMinute,
          height: (segment.activeEnd - segment.start) * pxPerMinute,
          serviceName: segment.booking.serviceName ?? '',
          timeLabel: `${minutesToTime(segment.start)}–${minutesToTime(segment.end)}`,
        })),
        freeTaps: paint.freeTaps.map((tap) => ({
          top: (tap.start - start) * pxPerMinute,
          height: (Math.min(tap.end, end) - tap.start) * pxPerMinute,
          startMinute: tap.start,
          endMinute: Math.min(tap.end, end),
        })),
        // One band per bar: the visit's LAST segment's turnover (an inner
        // segment's sits inside the wait hole, which already reads as free).
        bufferBand: lastBuffer
          ? {
              top: (lastBuffer.start - start) * pxPerMinute,
              height: (lastBuffer.end - lastBuffer.start) * pxPerMinute,
            }
          : null,
        contentInset: regions
          ? {
              top: (regions.textStart - start) * pxPerMinute,
              height: Math.max(0, (regions.textEnd - regions.textStart) * pxPerMinute),
            }
          : undefined,
      };
    });

    // Each overlay layer stacks on its own, so its heights are gap-clamped
    // within that layer — same rule as bookings, same guarantee.
    // One explanation per minute (web 2026-09-10): the venue's closed minutes
    // and the calendar's own are partitioned into venue-only, calendar-only and
    // both, each its own stripe with its own words and tint.
    const bands = partitionClosureBands<CalendarTimeBlock>({
      venueClosed: venueClosedRanges(venueHours, gridStartMin, bounds.endHour * 60),
      entries: rawTimeBlocks,
      columnName: calendarName,
      keyPrefix: 'day',
    });
    const overlayH = computeRangeHeights(
      bands.map(({ block, start, end }) => ({ id: block.id, start, end })),
      gridStartMin,
      pxPerMinute,
      minBlockHeight,
    );
    const overlayBlocks: PositionedTimeBlock[] = bands.map(({ block, start, end }) => ({
      block,
      top: (start - gridStartMin) * pxPerMinute,
      height: overlayH.get(block.id) ?? (end - start) * pxPerMinute,
      timeLabel: `${minutesToTime(start)}–${minutesToTime(end)}`,
    }));

    const sessionH = computeRangeHeights(
      rawSessions.map(({ session, start, end }) => ({ id: session.id, start, end })),
      gridStartMin,
      pxPerMinute,
      minBlockHeight,
    );
    const sessionItems: PositionedSession[] = rawSessions.map(({ session, start, end }) => ({
      session,
      top: (start - gridStartMin) * pxPerMinute,
      height: sessionH.get(session.id) ?? (end - start) * pxPerMinute,
      timeLabel: `${minutesToTime(start)}–${minutesToTime(end)}`,
    }));

    const scheduleH = computeRangeHeights(
      rawScheduleBlocks.map(({ block, start, end }) => ({ id: block.id, start, end })),
      gridStartMin,
      pxPerMinute,
      minBlockHeight,
    );
    const scheduleItems: PositionedScheduleBlock[] = rawScheduleBlocks.map(
      ({ block, start, end }) => ({
        block,
        top: (start - gridStartMin) * pxPerMinute,
        height: scheduleH.get(block.id) ?? (end - start) * pxPerMinute,
        timeLabel: `${minutesToTime(start)}–${minutesToTime(end)}`,
      }),
    );

    return {
      startHour: bounds.startHour,
      endHour: bounds.endHour,
      totalHeight: total,
      positioned: blocks,
      positionedBlocks: overlayBlocks,
      positionedSessions: sessionItems,
      positionedScheduleBlocks: scheduleItems,
    };
  }, [processingPatternFor, bounds, rawBlocks, rawTimeBlocks, rawSessions, rawScheduleBlocks, pxPerMinute, minBlockHeight, venueHours, calendarName]);

  /**
   * A quick action on a bar writes that bar's booking (web #187: Start and
   * Complete belong to one service; the server cascades the visit-wide facts).
   * A row already in the target state is skipped.
   *
   * One stable handler per grid rather than a closure per bar: the block is not
   * memoised, so per-bar closures would be pure allocation on a busy column.
   */
  const clusterByLeadId = useMemo(() => {
    const map = new Map<string, CalendarBookingCluster>();
    for (const item of positioned) map.set(item.cluster.lead.id, item.cluster);
    return map;
  }, [positioned]);

  const handleBarStatusChange = useMemo(
    () =>
      onStatusChange
        ? (leadId: string, status: string) => {
            const cluster = clusterByLeadId.get(leadId);
            // No cluster means the grid re-rendered between press and handler;
            // fall back to the id we were given rather than dropping the action.
            const ids = cluster ? statusChangeTargets(cluster, status) : [leadId];
            if (ids.length > 0) onStatusChange(ids, status);
          }
        : undefined,
    [clusterByLeadId, onStatusChange],
  );

  const handleBarArrivalToggle = useMemo(
    () =>
      onArrivalToggle
        ? (leadId: string, arrived: boolean) => {
            const cluster = clusterByLeadId.get(leadId);
            const ids = cluster ? arrivalToggleTargets(cluster, arrived) : [leadId];
            if (ids.length > 0) onArrivalToggle(ids, arrived);
          }
        : undefined,
    [clusterByLeadId, onArrivalToggle],
  );

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour],
  );

  const nowTop =
    nowMinutes != null && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60
      ? (nowMinutes - startHour * 60) * pxPerMinute
      : null;

  // Scroll to the current time once per grid instance (web parity:
  // scroll-to-now). The parent keys this grid on `${calendar}:${day}`, so it
  // remounts — and this ref resets — when you switch calendar or return to
  // today, re-running the scroll. The guard only blocks a repeat within the
  // same instance (e.g. the 60s now-line tick nudging `nowTop`).
  const didAutoScroll = useRef(false);
  useEffect(() => {
    if (didAutoScroll.current || nowTop == null) return;
    didAutoScroll.current = true;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, nowTop - 140), animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [nowTop]);

  const handleBackgroundPress = useCallback(
    (event: GestureResponderEvent) => {
      // locationY is relative to the inner grid View (which already sits below the
      // scroll padding) — the same space the hour lines use, so no padding offset.
      const y = event.nativeEvent.locationY;
      const minutes = startHour * 60 + y / pxPerMinute;
      const snapped = Math.round(minutes / TAP_SNAP_MINUTES) * TAP_SNAP_MINUTES;
      // Clamp to the visible window so a tap below the last hour line doesn't map
      // past endHour (minutesToTime would otherwise silently cap it at 23:59).
      const clamped = Math.min(Math.max(snapped, startHour * 60), endHour * 60);
      onEmptyPress(minutesToTime(clamped));
    },
    [startHour, endHour, pxPerMinute, onEmptyPress],
  );

  // Busy minute-ranges for drag-conflict detection, keyed by id so a dragged
  // block can exclude itself. Built from the FULL picture — NOT the visible
  // (status-filtered) `positioned` list — so the overlap guard sees:
  //   · every booking on the day (conflictBookings, unfiltered; falls back to
  //     the visible set when the parent doesn't supply it), minus Cancelled/
  //     No-Show which don't hold the wall (web parity),
  //   · manual time blocks (breaks/leave),
  //   · class/event capacity sessions, and
  //   · class/event/resource schedule blocks.
  // The status filter therefore stays PURELY visual — it hides blocks from view
  // without hiding them from conflict math.
  const busyRanges = useMemo<(BusyRange & { id: string })[]>(() => {
    const out: (BusyRange & { id: string })[] = [];
    const conflictSource = conflictBookings ?? bookings;
    for (const booking of conflictSource) {
      if (CONFLICT_IGNORED_STATUSES.has(booking.status)) continue;
      const start = timeToMinutes(booking.startTime);
      let end = booking.endTime ? timeToMinutes(booking.endTime) : start + DEFAULT_DURATION_MINUTES;
      if (end <= start) end = start + DEFAULT_DURATION_MINUTES;
      // A processing gap is free time for the drag check too (web parity): the
      // server takes a booking inside another's gap, so the guard must not
      // refuse a drop the server would accept.
      const gaps = processingGapRanges(
        start,
        end,
        bookingProcessingBlocks(booking, processingPatternFor, end - start),
      );
      out.push(...occupiedRangesMinusGaps(booking.id, start, end, gaps));
    }
    // R17-2: breaks and closures are advice, not walls — staff routinely work
    // past closing and over a break, and the server now accepts both overrides.
    // They stay DRAWN; they just stop refusing the drop.
    for (const block of timeBlocks) {
      if (!isOccupyingBlock(block.blockType)) continue;
      const start = timeToMinutes(block.start);
      const end = timeToMinutes(block.end);
      if (end > start) out.push({ id: block.id, start, end });
    }
    for (const session of sessions) {
      const start = timeToMinutes(session.startTime);
      const end = timeToMinutes(session.endTime);
      if (end > start) out.push({ id: session.id, start, end });
    }
    for (const block of scheduleBlocks) {
      const start = timeToMinutes(block.startTime);
      const end = timeToMinutes(block.endTime);
      if (end > start) out.push({ id: block.id, start, end });
    }
    return out;
  }, [conflictBookings, bookings, timeBlocks, sessions, scheduleBlocks, processingPatternFor]);

  // The header row: the clock button in the corner where the header meets the
  // time column (web: the toolbar's "Amend hours"), then the calendar's name
  // with the hours it works today under it.
  const header = showHeader ? (
    <View
      testID="day-grid-header"
      style={[styles.headerRow, { height: HEADER_HEIGHT, borderBottomColor: colors.border }]}>
      <View style={styles.headerCorner}>
        {onAmendHours ? (
          <IconButton
            icon={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
            accessibilityLabel="Amend hours"
            variant="bordered"
            size={30}
            iconSize={16}
            onPress={onAmendHours}
          />
        ) : null}
      </View>
      {calendarName ? (
        <View style={styles.headerCell}>
          <Text variant="label" numberOfLines={1}>
            {calendarName}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1} style={styles.headerHours}>
            {workingHoursLabel(workingHours)}
          </Text>
        </View>
      ) : null}
    </View>
  ) : null;

  // The time grid itself: one full-day-height layer holding the hour lines,
  // closed-time shading, the now-line and the positioned appointment blocks.
  const grid = (
      <View style={{ height: totalHeight }}>
        {/* Empty-area tap layer (blocks render above and capture their own taps). */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleBackgroundPress}
          accessibilityLabel="Tap an empty slot to add a booking or block"
        />

        {/* Hour rows: label + line + alternating shading + half-hour line. */}
        {hours.map((hour, index) => {
          const top = (hour - startHour) * 60 * pxPerMinute;
          const isLast = hour === endHour;
          return (
            <View
              key={hour}
              style={[styles.hourRow, { top, height: 60 * pxPerMinute }]}
              pointerEvents="none">
              <View style={styles.hourLineRow}>
                <Text variant="caption" tone="muted" style={styles.hourLabel}>
                  {hourLabel(hour)}
                </Text>
                {/* One step darker than before (web #185: "a grid staff can
                    see"): the hour line reads as a rule, the half hour as a
                    clear division, the band as something to count by. */}
                <View style={[styles.hourLine, { backgroundColor: colors.borderStrong }]} />
              </View>
              {!isLast ? (
                <>
                  {/* Alternate-hour banding (web parity). */}
                  {index % 2 === 1 ? (
                    <View
                      style={[
                        styles.hourBand,
                        { backgroundColor: colors.text, opacity: 0.045 },
                      ]}
                    />
                  ) : null}
                  {/* Half-hour line. */}
                  <View
                    style={[
                      styles.halfHourLine,
                      { top: 30 * pxPerMinute, backgroundColor: colors.border },
                    ]}
                  />
                </>
              ) : null}
            </View>
          );
        })}

        {/* Blocked-time overlays, and the closure stripes that say why the day
            is empty — venue closed (rose), this calendar unavailable (sky),
            both (slate), on leave (violet) — each labelled with its cause and
            its minutes (web 2026-09-10). pointerEvents stay on so an empty
            slot under a stripe can still be tapped to book anyway. */}
        {positionedBlocks.map((item) => {
          const look = closureBandLook(item.block.blockType, isDark);
          return (
            <Pressable
              key={item.block.id}
              accessibilityLabel={
                look
                  ? closureStripeA11yLabel(item.block.label, item.timeLabel)
                  : `Blocked ${item.timeLabel}`
              }
              onPress={() => {
                if (item.block.isEditable && onBlockTimeBlockPress) {
                  onBlockTimeBlockPress(item.block.id);
                }
              }}
              style={[
                look ? styles.closureBand : styles.blockedOverlay,
                {
                  top: item.top,
                  height: item.height,
                  backgroundColor: look?.backgroundColor,
                  borderColor: look ? look.borderColor : colors.border,
                },
              ]}>
              {/* A short band has no room for a label; the tint alone still
                  says "not available". */}
              {!look || item.height >= 26 ? (
                <Text
                  variant="caption"
                  tone={look ? undefined : 'muted'}
                  numberOfLines={1}
                  style={look ? { color: look.labelColor } : undefined}>
                  {look
                    ? item.block.label?.trim() || 'Closed'
                    : `${item.block.label?.trim() || 'Time blocked'} · ${item.timeLabel}`}
                </Text>
              ) : null}
              {!look && item.block.isEditable && item.height >= 40 ? (
                <Text variant="caption" tone="muted" numberOfLines={1} style={styles.editHint}>
                  Tap to edit
                </Text>
              ) : null}
            </Pressable>
          );
        })}

        {/* Class / event capacity blocks (indigo) — read-only, distinct from
            appointment bars. Render below the now-line and appointment layer. */}
        {positionedSessions.map((item) => (
          <View
            key={item.session.id}
            pointerEvents="none"
            accessibilityLabel={`Class ${item.timeLabel}, ${item.session.bookedCount} of ${item.session.capacity} booked`}
            style={[
              styles.sessionBlock,
              {
                top: item.top,
                height: item.height,
                backgroundColor: `${SESSION_ACCENT}1F`,
                borderColor: SESSION_ACCENT,
              },
            ]}>
            <View style={[styles.sessionAccent, { backgroundColor: SESSION_ACCENT }]} />
            <View style={styles.sessionBody}>
              <Text variant="caption" numberOfLines={1} style={[styles.sessionLabel, { color: SESSION_ACCENT }]}>
                {item.session.bookedCount}/{item.session.capacity} booked
              </Text>
              {item.height >= 40 ? (
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {item.timeLabel}
                </Text>
              ) : null}
            </View>
          </View>
        ))}

        {/* Class / event / resource blocks from the schedule feed — read-only,
            named, accent-coloured, with the capacity/uptake line when known.
            Disjoint from `sessions` above (different feed), so both render
            without double-counting. */}
        {positionedScheduleBlocks.map((item) => (
          <View
            key={item.block.id}
            pointerEvents="none"
            accessibilityLabel={`${item.block.title}${
              item.block.capacityLabel ? `, ${item.block.capacityLabel}` : ''
            }, ${item.timeLabel}`}
            style={[
              styles.sessionBlock,
              {
                top: item.top,
                height: item.height,
                backgroundColor: hexToRgba(item.block.accent, 0.12),
                borderColor: item.block.accent,
              },
            ]}>
            <View style={[styles.sessionAccent, { backgroundColor: item.block.accent }]} />
            <View style={styles.sessionBody}>
              <Text
                variant="caption"
                numberOfLines={1}
                style={[styles.sessionLabel, { color: item.block.accent }]}>
                {item.block.title}
              </Text>
              {item.height >= 40 && item.block.capacityLabel ? (
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {item.block.capacityLabel}
                </Text>
              ) : item.height >= 40 ? (
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {item.timeLabel}
                </Text>
              ) : null}
            </View>
          </View>
        ))}

        {/* Now indicator */}
        {nowTop != null ? (
          <View style={[styles.nowLine, { top: nowTop }]} pointerEvents="none">
            <View style={[styles.nowDot, { backgroundColor: colors.danger }]} />
            <View style={[styles.nowBar, { backgroundColor: colors.danger }]} />
          </View>
        ) : null}

        {/* Appointment blocks — positioned within the content layer so lane
            percentages are relative to the bookable column, not the gutter. */}
        <View style={styles.blocksLayer} pointerEvents="box-none">
          {positioned.map((item) => (
            <DraggableAppointmentBlock
              key={item.cluster.lead.id}
              id={item.cluster.lead.id}
              guestName={item.cluster.lead.guestName}
              serviceName={item.cluster.serviceLabel}
              timeLabel={item.timeLabel}
              status={item.cluster.status}
              visitChip={item.visitChip}
              spineTop={item.spineTop}
              spineBottom={item.spineBottom}
              paletteStatus={item.paletteStatus}
              // One service of a visit drags and resizes on its own (web #187);
              // the commit names that row alone on the visit endpoint.
              draggable={MOVABLE_STATUSES.has(item.cluster.status)
              }
              // Every row this bar owns, so the drag's conflict check does not
              // see the visit's own services as occupying the space it is moving
              // into, and so a resize cannot go below the services' own floors.
              segmentIds={item.conflictIds}
              clientArrivedAt={item.cluster.lead.client_arrived_at}
              staffAttendanceConfirmedAt={item.cluster.lead.staff_attendance_confirmed_at}
              guestAttendanceConfirmedAt={item.cluster.lead.guest_attendance_confirmed_at}
              top={item.top}
              height={item.height}
              laneWidthPx={
                blocksLayerWidth > 0
                  ? Math.floor(blocksLayerWidth / item.laneCount)
                  : undefined
              }
              laneIndex={item.laneIndex}
              laneCount={item.laneCount}
              nested={item.nestedInKey != null}
              nestDepth={item.nestDepth}
              pieces={item.pieces}
              segments={item.segments}
              freeTaps={item.freeTaps}
              // A tap on the bar's free time books someone else in, the same
              // gesture as tapping empty grid (web #185).
              onFreePress={(minute) => onEmptyPress(minutesToTime(minute))}
              bufferBand={item.bufferBand}
              contentInset={item.contentInset}
              pxPerMinute={pxPerMinute}
              startTime={item.cluster.lead.startTime}
              durationMinutes={item.durationMinutes}
              onPress={onBlockPress}
              onStatusChange={handleBarStatusChange}
              onArrivalToggle={handleBarArrivalToggle}
              // Busy while ANY segment's action is in flight, so the whole bar
              // shows one spinner rather than looking idle mid-fan-out.
              actionPending={item.cluster.ids.some((id) => pendingActionIds?.has(id) === true)}
              complianceFlag={item.cluster.ids
                .map((id) => complianceFlags?.[id])
                .find((flag) => flag != null)}
              paid={item.cluster.paid}
              onDragReschedule={onDragReschedule}
              // Compact rows are too short for a usable resize grip — hide the
              // affordance and disable the resize gesture (web parity: no
              // resize affordances in compact day mode). Hold-drag MOVE stays.
              onDragResize={compact ? undefined : onDragResize}
              onDragConflictReject={onDragConflictReject}
              busyRanges={busyRanges}
              workingRanges={workingRanges}
            />
          ))}
        </View>
      </View>
  );

  // Embedded: hand vertical scrolling to the parent. A grid that keeps its own
  // vertical ScrollView when stacked inside another vertical ScrollView swallows
  // the parent's pan, leaving the grids below it unreachable. Horizontal column
  // scrolling, where present, is orthogonal and unaffected.
  if (embedded) {
    return (
      <View
        style={styles.embeddedContent}
        // Width still budgets the per-block quick actions; height is unused
        // (compact fit needs a scroll viewport, which the parent owns here).
        onLayout={(e) => setViewportWidth(e.nativeEvent.layout.width)}>
        {header}
        {grid}
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      // Compact mode fits the day to this viewport's height; the width budgets
      // the per-block quick actions. Re-measures on rotation / window resize.
      onLayout={(e) => {
        setViewportHeight(e.nativeEvent.layout.height);
        setViewportWidth(e.nativeEvent.layout.width);
      }}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        ) : undefined
      }>
      {header}
      {grid}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing['3xl'] + spacing.xl,
  },
  embeddedContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.xs,
  },
  headerCorner: {
    width: TIME_GUTTER_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCell: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  headerHours: {
    fontVariant: ['tabular-nums'],
  },
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    // height is set dynamically (60 * pxPerMinute) on the element.
  },
  hourLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hourLabel: {
    width: TIME_GUTTER_WIDTH,
    paddingRight: spacing.sm,
    textAlign: 'right',
    marginTop: -7,
    fontVariant: ['tabular-nums'],
  },
  hourLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  hourBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: TIME_GUTTER_WIDTH,
    right: 0,
  },
  halfHourLine: {
    position: 'absolute',
    left: TIME_GUTTER_WIDTH,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  /**
   * A closure band fills its span exactly, so abutting bands (closed → on leave
   * → closed) read as one continuous state rather than a stack of boxes.
   *
   * This grid's canvas INCLUDES the time gutter — unlike the column grids,
   * where a band is already inside its column — so it carries the same
   * `TIME_GUTTER_WIDTH` offset every other overlay here does. Without it the
   * band ran underneath the hour labels.
   */
  closureBand: {
    position: 'absolute',
    left: TIME_GUTTER_WIDTH + spacing.xs,
    right: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xs,
    paddingTop: 1,
    overflow: 'hidden',
  },
  blockedOverlay: {
    position: 'absolute',
    left: TIME_GUTTER_WIDTH + spacing.xs,
    right: spacing.sm,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(148, 163, 184, 0.22)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    justifyContent: 'flex-start',
  },
  editHint: {
    marginTop: 1,
    opacity: 0.6,
  },
  sessionBlock: {
    position: 'absolute',
    left: TIME_GUTTER_WIDTH + spacing.xs,
    right: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  sessionAccent: {
    width: 3,
  },
  sessionBody: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    justifyContent: 'center',
  },
  sessionLabel: {
    fontVariant: ['tabular-nums'],
  },
  nowLine: {
    position: 'absolute',
    left: TIME_GUTTER_WIDTH - 4,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 20,
  },
  nowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  nowBar: {
    flex: 1,
    height: 2,
  },
  blocksLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: TIME_GUTTER_WIDTH + spacing.xs,
    right: spacing.sm,
  },
});
