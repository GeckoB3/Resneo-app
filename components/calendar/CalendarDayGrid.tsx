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
import { minimumVisitFloorMinutes } from '@/lib/booking/appointment-visit';
import { arrivalToggleTargets, statusChangeTargets } from '@/lib/calendar/bar-actions';
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
import {
  clampClosureBlocksToWindow,
  isScheduleClosureBlockType,
} from '@/lib/calendar/schedule-closures';
import {
  bookingProcessingBlocks,
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
   * Set when this bar rides inside another bar's processing gap (web #177):
   * drawn indented and above its host, in the host's lane.
   */
  nestedInKey?: string;
  /**
   * This bar's processing gaps as px bands from its own top: the client is
   * under the colour and the column is free. Drawn as a lighter band.
   */
  processingBands: { top: number; height: number }[];
  /**
   * When this bar hosts nested bars, the px region (from its own top) its text
   * and buttons keep to, so a nested bar never covers them.
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

/** Scrollable single-day, single-practitioner time grid. */
export function CalendarDayGrid({
  bookings,
  conflictBookings,
  workingHours,
  timeBlocks = [],
  sessions = [],
  scheduleBlocks = [],
  venueHours,
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
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollViewType | null>(null);

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

      // One entry per VISIT, not per booking: a multi-service visit or a group
      // booked together shares a group id and draws as one bar spanning the lot.
      // Clustering happens before the grid bounds are measured so a merged bar
      // can extend them, exactly as its segments used to.
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
    }, [bookings, workingHours, timeBlocks, sessions, scheduleBlocks, windowOverride]);

  // Vertical scale: comfortable 2px/min, or compact fit-the-day-to-the-viewport
  // (web parity: measured slot height, floored at 16px/15min). The fit subtracts
  // the scroll padding above the canvas and a small bottom gutter.
  const pxPerMinute = compact
    ? computeCompactPxPerMinute(
        viewportHeight,
        bounds.startHour,
        bounds.endHour,
        spacing.sm + COMPACT_BOTTOM_GUTTER,
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
    for (const cluster of rawBlocks) {
      gapsByLead.set(
        cluster.lead.id,
        clusterProcessingGaps(cluster.bookings, processingPatternFor, DEFAULT_DURATION_MINUTES),
      );
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
      const gaps = gapsByLead.get(lead.id) ?? [];
      // A host keeps its text (and its buttons, which share the region on the
      // app's bars) above the first nested bar, or below one at its top edge.
      const regions = lane.nestedRanges
        ? hostRegionsAroundNested({ start, end }, lane.nestedRanges, 0)
        : null;
      return {
        cluster,
        top,
        height,
        laneIndex: lane.laneIndex,
        laneCount: lane.laneCount,
        durationMinutes: Math.max(end - start, TAP_SNAP_MINUTES),
        timeLabel: `${minutesToTime(start)}–${minutesToTime(end)}`,
        nestedInKey: lane.nestedInKey,
        processingBands: gaps.map((gap) => ({
          top: (gap.start - start) * pxPerMinute,
          height: (gap.end - gap.start) * pxPerMinute,
        })),
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
    const overlayH = computeRangeHeights(
      rawTimeBlocks.map(({ block, start, end }) => ({ id: block.id, start, end })),
      gridStartMin,
      pxPerMinute,
      minBlockHeight,
    );
    const overlayBlocks: PositionedTimeBlock[] = rawTimeBlocks.map(({ block, start, end }) => ({
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
  }, [processingPatternFor, bounds, rawBlocks, rawTimeBlocks, rawSessions, rawScheduleBlocks, pxPerMinute, minBlockHeight]);

  /**
   * A quick action on a merged bar applies to the WHOLE visit — web parity with
   * `quickPatchBookingCluster`, which patches every booking in the cluster.
   * Doing otherwise would advance one service and leave its siblings behind.
   *
   * Segments already in the target state are skipped, so a part-completed visit
   * fires only the mutations it needs (and, since each failure raises its own
   * toast upstream, does not multiply the noise).
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

  // Venue-closed minute-ranges within the visible window (out-of-hours / closed day).
  const closedRanges = useMemo(
    () => venueClosedRanges(venueHours, startHour * 60, endHour * 60),
    [venueHours, startHour, endHour],
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
        bookingProcessingBlocks(booking, processingPatternFor),
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
                <View style={[styles.hourLine, { backgroundColor: colors.border }]} />
              </View>
              {!isLast ? (
                <>
                  {/* Subtle alternate-hour banding (web parity). */}
                  {index % 2 === 1 ? (
                    <View
                      style={[
                        styles.hourBand,
                        { backgroundColor: colors.text, opacity: 0.025 },
                      ]}
                    />
                  ) : null}
                  {/* Lighter half-hour line. */}
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

        {/* Venue-closed shading — out-of-hours / closed-day time. A faint band
            behind everything; pointerEvents none so a slot can still be tapped
            to book anyway. */}
        {closedRanges.map((r) => {
          const top = (r.start - startHour * 60) * pxPerMinute;
          const height = (r.end - r.start) * pxPerMinute;
          return (
            <View
              key={`closed-${r.start}-${r.end}`}
              pointerEvents="none"
              accessibilityLabel={`Closed ${minutesToTime(r.start)}–${minutesToTime(r.end)}`}
              style={[styles.closedBand, { top, height, backgroundColor: hexToRgba(colors.text, 0.06) }]}>
              {height >= 26 ? (
                <Text variant="caption" tone="muted" style={styles.closedLabel}>
                  Closed
                </Text>
              ) : null}
            </View>
          );
        })}

        {/* Blocked-time overlays, and the closure bands that say why the day is
            empty (closed / on leave / amended hours). */}
        {positionedBlocks.map((item) => {
          const look = closureBandLook(item.block.blockType, colors);
          return (
            <Pressable
              key={item.block.id}
              accessibilityLabel={
                look
                  ? `${item.block.label?.trim() || 'Closed'} ${item.timeLabel}`
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
                    : `${item.block.label?.trim() || 'Blocked'} · ${item.timeLabel}`}
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
              status={item.cluster.lead.status}
              // A merged VISIT drags and resizes as one booking: the commit goes
              // through the visit endpoint, which plans every service before
              // writing any. A merged PARTY does not — several people booked at
              // one time are not a thing to re-sequence — and that is why the
              // gate is `isVisit` rather than `isMultiSegment`.
              draggable={
                (!item.cluster.isMultiSegment || item.cluster.isVisit) &&
                MOVABLE_STATUSES.has(item.cluster.lead.status)
              }
              // Every row this bar owns, so the drag's conflict check does not
              // see the visit's own services as occupying the space it is moving
              // into, and so a resize cannot go below the services' own floors.
              segmentIds={item.cluster.ids}
              minDurationMinutes={
                item.cluster.isVisit
                  ? minimumVisitFloorMinutes(item.cluster.bookings.length)
                  : undefined
              }
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
              processingBands={item.processingBands}
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
    opacity: 0.55,
  },
  closedBand: {
    position: 'absolute',
    left: TIME_GUTTER_WIDTH,
    right: 0,
  },
  closedLabel: {
    marginTop: 4,
    marginLeft: spacing.sm,
    opacity: 0.7,
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
