/**
 * DraggableAppointmentBlock
 *
 * Wraps AppointmentBlock with touch-and-hold drag behaviour (web parity:
 * BOOKING_RESIZE_HOLD_MS — movement never starts from a plain swipe):
 *
 *   - Tap            → opens booking detail (onPress)
 *   - Hold 500 ms    → arms the gesture (haptic + lift), then:
 *       · started anywhere on the card  → vertical drag MOVES the booking
 *       · started on the bottom edge    → vertical drag RESIZES (duration)
 *   - Release        → snaps to 5-minute grid and commits via the parent
 *
 * A plain swipe over the card scrolls the grid (the pan only activates after
 * the hold), so scrolling never accidentally moves an appointment.
 *
 * After a successful drop the card STAYS at the new position/size; the
 * translation resets only once fresh data re-renders it at the committed spot
 * (or the mutation fails and it snaps home). No bounce-back-then-jump.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppointmentBlock } from '@/components/calendar/AppointmentBlock';
import {
  DRAG_SNAP_MINUTES,
  minutesToTime,
  PX_PER_MINUTE,
  timeToMinutes,
} from '@/components/calendar/grid-layout';
import { hapticError, hapticSelect, hapticSuccess } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ComplianceBookingFlag } from '@/lib/queries/useCompliance';

// ---- Constants ---------------------------------------------------------------

/** Hold duration before the drag arms (ms) — guards against accidental moves. */
const HOLD_MS = 500;
/** Pointer drift allowed during the hold before it cancels (px) — web parity. */
const HOLD_TOLERANCE_PX = 10;
/** Spring config for snapping back on cancel/error. */
const SNAP_SPRING = { damping: 22, stiffness: 280 };
/** Max touch zone at the bottom edge that resizes instead of moves (px). */
const RESIZE_ZONE_HEIGHT = 22;
/** Tiny safety floor — the grid's MIN_BLOCK_HEIGHT (36) means every real block
 *  clears this, so the duration grip shows on all bookings. */
const RESIZE_MIN_BLOCK_HEIGHT = 28;
/** Duration bounds (minutes). */
const MIN_DURATION_MINUTES = DRAG_SNAP_MINUTES;
const MAX_DURATION_MINUTES = 14 * 60;

/** Stable empty-array defaults so the props don't churn identity each render. */
const EMPTY_BUSY: { id: string; start: number; end: number }[] = [];
const EMPTY_WORKING: { start: number; end: number }[] = [];

// ---- Worklet helpers ---------------------------------------------------------

function snapToGrid(minutes: number, snapInterval: number): number {
  'worklet';
  return Math.round(minutes / snapInterval) * snapInterval;
}

function clampMinutes(minutes: number): number {
  'worklet';
  return Math.max(0, Math.min(24 * 60 - 1, minutes));
}

function formatMinutesLabel(totalMinutes: number): string {
  'worklet';
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDurationLabel(totalMins: number): string {
  'worklet';
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ---- Types -------------------------------------------------------------------

type DragMode = 0 | 1 | 2; // 0 = idle, 1 = move, 2 = resize

type DraggableAppointmentBlockProps = {
  id: string;
  guestName: string;
  serviceName: string;
  timeLabel: string;
  status: string;
  /**
   * Whether this block may be hold-dragged / resized at all. When false the
   * gesture is disabled outright (not merely rejected on release), so a
   * Completed/No-Show/Cancelled or resource booking can't start a move. Defaults
   * to true to preserve behaviour for callers that don't gate it.
   */
  draggable?: boolean;
  clientArrivedAt?: string | null;
  staffAttendanceConfirmedAt?: string | null;
  guestAttendanceConfirmedAt?: string | null;
  /** Pixel offset from the grid top. */
  top: number;
  /** Visual height in px. */
  height: number;
  /** Overlap lane — drives percentage left/width within the blocks layer. */
  laneIndex: number;
  laneCount: number;
  /** The booking's start time "HH:mm[:ss]" — used to compute the new time. */
  startTime: string;
  /** True duration in minutes — used for duration resize. */
  durationMinutes: number;
  onPress: (id: string) => void;
  onStatusChange?: (id: string, status: string) => void;
  onArrivalToggle?: (id: string, arrived: boolean) => void;
  actionPending?: boolean;
  complianceFlag?: ComplianceBookingFlag | null;
  /** Called on drag release with the new snapped "HH:mm". Parent commits. */
  onDragReschedule?: (bookingId: string, newTime: string) => void;
  /** Called on resize release with the new snapped duration (minutes). */
  onDragResize?: (bookingId: string, newDurationMinutes: number) => void;
  /** Called when a drag/resize is refused for overlapping another block. */
  onDragConflictReject?: () => void;
  /** Other busy minute-ranges (bookings + blocks) for conflict detection. */
  busyRanges?: { id: string; start: number; end: number }[];
  /** The day's working-hour minute-ranges — a drop outside these is amber. */
  workingRanges?: { start: number; end: number }[];
};

/** 0 = valid, 1 = outside working hours (allowed/amber), 2 = conflict (red). */
type ConflictLevel = 0 | 1 | 2;

/**
 * Worklet conflict check for a proposed [start,end) minute-range. Overlapping
 * another booking/block → 2 (red, refused). Fully inside working hours → 0.
 * Otherwise → 1 (amber, allowed but flagged). Runs on the UI thread during drag.
 */
function evaluateConflict(
  start: number,
  end: number,
  selfId: string,
  busy: { id: string; start: number; end: number }[],
  working: { start: number; end: number }[],
): ConflictLevel {
  'worklet';
  for (let i = 0; i < busy.length; i += 1) {
    const r = busy[i];
    if (r == null || r.id === selfId) continue;
    if (start < r.end && end > r.start) return 2;
  }
  if (working.length === 0) return 0;
  for (let i = 0; i < working.length; i += 1) {
    const w = working[i];
    if (w != null && start >= w.start && end <= w.end) return 0;
  }
  return 1;
}

// ---- Component ---------------------------------------------------------------

export function DraggableAppointmentBlock({
  id,
  guestName,
  serviceName,
  timeLabel,
  status,
  draggable = true,
  clientArrivedAt,
  staffAttendanceConfirmedAt,
  guestAttendanceConfirmedAt,
  top,
  height,
  laneIndex,
  laneCount,
  startTime,
  durationMinutes,
  onPress,
  onStatusChange,
  onArrivalToggle,
  actionPending = false,
  complianceFlag,
  onDragReschedule,
  onDragResize,
  onDragConflictReject,
  busyRanges = EMPTY_BUSY,
  workingRanges = EMPTY_WORKING,
}: DraggableAppointmentBlockProps) {
  const { colors } = useTheme();

  // Non-movable blocks (Completed/No-Show/Cancelled/resource) gate out BOTH the
  // move and resize affordances — `draggable` is the single switch.
  const dragEnabled = draggable && onDragReschedule != null;
  const resizeEnabled = draggable && onDragResize != null && height >= RESIZE_MIN_BLOCK_HEIGHT;
  // Keep a usable "move" zone on short blocks: the resize strip is at most 40%
  // of the block height (capped at RESIZE_ZONE_HEIGHT), so even a 36px bar keeps
  // room above to grab for moving and ~14px at the very bottom to resize.
  const resizeZoneHeight = Math.min(RESIZE_ZONE_HEIGHT, Math.round(height * 0.4));

  // ---- Shared animated values (UI thread) ----
  const mode = useSharedValue<DragMode>(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  /** 0→1 across the hold window; drives the arming progress bar. */
  const holdProgress = useSharedValue(0);
  const liveMinutes = useSharedValue(timeToMinutes(startTime));
  const liveDurationMins = useSharedValue(durationMinutes);
  /** -1 = no override; otherwise the held height (px) during/after a resize. */
  const heightOverride = useSharedValue(-1);
  /** True between a successful drop and the data refresh — keeps the new spot. */
  const settled = useSharedValue(false);
  /** Live conflict level for the proposed slot — drives the badge colour. */
  const conflict = useSharedValue<ConflictLevel>(0);

  // ---- React state for live labels (fed from the UI thread) ----
  const [liveTimeLabel, setLiveTimeLabel] = useState(() => startTime.slice(0, 5));
  const [liveDurLabel, setLiveDurLabel] = useState('');
  const [activeMode, setActiveMode] = useState<DragMode>(0);
  const [liveConflict, setLiveConflict] = useState<ConflictLevel>(0);
  // Mirror the UI-thread height override into React so AppointmentBlock's
  // density (which text rows fit) tracks the LIVE size while/after resizing.
  // Without this the block grows but its content stays at the pre-resize row
  // count, so the time line never appears even though there's now room for it.
  const [renderHeightOverride, setRenderHeightOverride] = useState(-1);

  useAnimatedReaction(
    () => ({
      m: mode.value,
      mins: liveMinutes.value,
      dur: liveDurationMins.value,
      c: conflict.value,
      h: heightOverride.value,
    }),
    ({ m, mins, dur, c, h }) => {
      runOnJS(setActiveMode)(m);
      runOnJS(setLiveConflict)(c);
      runOnJS(setRenderHeightOverride)(h);
      if (m === 1) runOnJS(setLiveTimeLabel)(formatMinutesLabel(mins));
      if (m === 2) runOnJS(setLiveDurLabel)(formatDurationLabel(dur));
    },
  );

  // ---- Reset overrides once fresh data re-lays the block out ----
  //
  // After a successful drop the props (top/height/startTime/duration) update
  // when the grid refetches — resetting the visual overrides at that moment is
  // seamless (new layout equals the held position). If the mutation FAILED the
  // props never change, so a fallback timer snaps the block home shortly after
  // the parent's error alert.
  /* eslint-disable react-hooks/immutability -- SharedValue writes inside effects
     are the supported Reanimated pattern; they mutate UI-thread state, not
     React-managed values. */
  const errorResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPendingRef = useRef(false);

  const resetOverrides = useCallback(() => {
    if (errorResetTimer.current) {
      clearTimeout(errorResetTimer.current);
      errorResetTimer.current = null;
    }
    settled.value = false;
    translateY.value = 0;
    heightOverride.value = -1;
    liveMinutes.value = timeToMinutes(startTime);
    liveDurationMins.value = durationMinutes;
  }, [settled, translateY, heightOverride, liveMinutes, liveDurationMins, startTime, durationMinutes]);

  // Layout-defining props changed → the data caught up; drop overrides now.
  useEffect(() => {
    resetOverrides();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync to layout-defining props only
  }, [top, height, startTime, durationMinutes]);

  // Mutation settled without a layout change (error path) → snap home soon.
  useEffect(() => {
    if (actionPending) {
      wasPendingRef.current = true;
      return;
    }
    if (wasPendingRef.current) {
      wasPendingRef.current = false;
      errorResetTimer.current = setTimeout(resetOverrides, 2500);
    }
  }, [actionPending, resetOverrides]);

  useEffect(
    () => () => {
      if (errorResetTimer.current) clearTimeout(errorResetTimer.current);
    },
    [],
  );
  /* eslint-enable react-hooks/immutability */

  // ---- Stable JS callbacks (called via runOnJS from worklets) ----
  const jsHapticArm = useCallback(() => hapticSelect(), []);
  const jsHapticDrop = useCallback(() => hapticSuccess(), []);
  const jsHapticCancel = useCallback(() => hapticError(), []);
  const jsConflictReject = useCallback(() => {
    hapticError();
    onDragConflictReject?.();
  }, [onDragConflictReject]);

  const jsCommitMove = useCallback(
    // minutesToTime is a plain (non-worklet) function, so it MUST run here on
    // the JS thread — calling it inside the gesture worklet crashes the app
    // ("synchronously call a non-worklet function on the UI thread").
    (newMinutes: number) => onDragReschedule?.(id, minutesToTime(newMinutes)),
    [id, onDragReschedule],
  );
  const jsCommitResize = useCallback(
    (newDuration: number) => onDragResize?.(id, newDuration),
    [id, onDragResize],
  );

  const originalMinutes = timeToMinutes(startTime);

  /* eslint-disable react-hooks/immutability -- worklet callbacks run on the
     Reanimated UI thread, not during React render; mutating SharedValue.value
     there is the supported pattern. */

  // ---- The gesture: hold to arm, then pan vertically ----
  const startedInResizeZone = useSharedValue(false);

  const dragGesture = Gesture.Pan()
    .enabled(dragEnabled || resizeEnabled)
    .maxPointers(1)
    .activateAfterLongPress(HOLD_MS)
    // Drift past tolerance before the hold elapses → the pan FAILS (scroll wins).
    .failOffsetX([-HOLD_TOLERANCE_PX, HOLD_TOLERANCE_PX])
    .onTouchesDown((e) => {
      'worklet';
      const touch = e.allTouches[0];
      startedInResizeZone.value =
        resizeEnabled && touch != null && touch.y >= height - resizeZoneHeight;
      // Arming feedback: fill the hold-progress bar across the hold window.
      // It only becomes visible ~90ms in, so taps and scroll-grabs never flash.
      holdProgress.value = 0;
      holdProgress.value = withTiming(1, { duration: HOLD_MS });
    })
    .onStart(() => {
      'worklet';
      holdProgress.value = 0; // armed — the lift + live badge take over
      const resizing = startedInResizeZone.value && resizeEnabled;
      if (!resizing && !dragEnabled) return;
      mode.value = resizing ? 2 : 1;
      settled.value = false;
      conflict.value = 0;
      liveMinutes.value = originalMinutes;
      liveDurationMins.value = durationMinutes;
      if (!resizing) {
        scale.value = withSpring(1.03, SNAP_SPRING);
      }
      runOnJS(jsHapticArm)();
    })
    .onUpdate((event) => {
      'worklet';
      if (mode.value === 1) {
        const deltaMinutes = event.translationY / PX_PER_MINUTE;
        const snapped = clampMinutes(
          snapToGrid(originalMinutes + deltaMinutes, DRAG_SNAP_MINUTES),
        );
        liveMinutes.value = snapped;
        translateY.value = (snapped - originalMinutes) * PX_PER_MINUTE;
        // Proposed slot keeps the duration; flag overlap (red) / off-hours (amber).
        conflict.value = evaluateConflict(
          snapped,
          snapped + durationMinutes,
          id,
          busyRanges,
          workingRanges,
        );
      } else if (mode.value === 2) {
        const deltaMins = event.translationY / PX_PER_MINUTE;
        const snapped = snapToGrid(durationMinutes + deltaMins, DRAG_SNAP_MINUTES);
        const clamped = Math.max(
          MIN_DURATION_MINUTES,
          Math.min(MAX_DURATION_MINUTES, snapped),
        );
        liveDurationMins.value = clamped;
        heightOverride.value = clamped * PX_PER_MINUTE;
        // Resizing keeps the start; flag overlap with the new tail.
        conflict.value = evaluateConflict(
          originalMinutes,
          originalMinutes + clamped,
          id,
          busyRanges,
          workingRanges,
        );
      }
    })
    .onEnd(() => {
      'worklet';
      if (mode.value === 1) {
        const newMinutes = liveMinutes.value;
        scale.value = withSpring(1, SNAP_SPRING);
        if (newMinutes === originalMinutes) {
          // No-op drag — glide home.
          translateY.value = withSpring(0, SNAP_SPRING);
          conflict.value = 0;
          mode.value = 0;
          return;
        }
        if (conflict.value === 2) {
          // Overlaps another block — refuse the drop and snap home.
          translateY.value = withSpring(0, SNAP_SPRING);
          conflict.value = 0;
          mode.value = 0;
          runOnJS(jsConflictReject)();
          return;
        }
        // Keep the dropped position; props re-sync after the mutation settles.
        settled.value = true;
        conflict.value = 0;
        mode.value = 0;
        runOnJS(jsHapticDrop)();
        runOnJS(jsCommitMove)(newMinutes);
      } else if (mode.value === 2) {
        const newDuration = liveDurationMins.value;
        if (newDuration === durationMinutes) {
          heightOverride.value = withTiming(-1, { duration: 0 });
          conflict.value = 0;
          mode.value = 0;
          return;
        }
        if (conflict.value === 2) {
          // New length overlaps the next block — refuse and snap back.
          heightOverride.value = withTiming(-1, { duration: 0 });
          conflict.value = 0;
          mode.value = 0;
          runOnJS(jsConflictReject)();
          return;
        }
        settled.value = true;
        conflict.value = 0;
        mode.value = 0;
        runOnJS(jsHapticDrop)();
        runOnJS(jsCommitResize)(newDuration);
      }
    })
    .onFinalize((_event, success) => {
      'worklet';
      // Touch ended before (or without) activation — clear the arming bar.
      holdProgress.value = withTiming(0, { duration: 120 });
      if (!success && mode.value !== 0) {
        // Cancelled mid-drag (e.g. another gesture took over).
        mode.value = 0;
        conflict.value = 0;
        scale.value = withSpring(1, SNAP_SPRING);
        translateY.value = withSpring(0, SNAP_SPRING);
        heightOverride.value = -1;
        runOnJS(jsHapticCancel)();
      }
    });

  /* eslint-enable react-hooks/immutability */

  // ---- Animated styles ----
  const animatedWrapperStyle = useAnimatedStyle(() => {
    const dragging = mode.value !== 0;
    return {
      transform: [{ translateY: translateY.value }, { scale: scale.value }],
      height: heightOverride.value >= 0 ? heightOverride.value : height,
      zIndex: dragging ? 999 : settled.value ? 50 : 10 + laneIndex,
      elevation: dragging ? 12 : 0,
      shadowOpacity: dragging ? 0.25 : 0,
    };
  }, [height, laneIndex]);

  // Arming progress — fades in ~90ms into the hold, fills left→right.
  const holdBarStyle = useAnimatedStyle(() => {
    const p = holdProgress.value;
    return {
      width: `${p * 100}%`,
      opacity: p < 0.18 ? 0 : Math.min(1, (p - 0.18) / 0.15),
    };
  });

  const widthPct = 100 / laneCount;
  const leftPct = laneIndex * widthPct;
  // The block is rendered at the override height while/after a resize; feed that
  // same height to the content so its row density matches the visible size.
  const densityHeight = renderHeightOverride >= 0 ? renderHeightOverride : height;

  return (
    <GestureDetector gesture={dragGesture}>
      <Animated.View
        style={[
          styles.root,
          {
            top,
            left: `${leftPct}%`,
            width: `${widthPct}%`,
          },
          animatedWrapperStyle,
        ]}>
        {/* Live badge — time while moving, duration while resizing. Tints amber
            when the slot is outside working hours, red on an overlap conflict. */}
        {activeMode !== 0 ? (
          <View
            style={[
              styles.liveLabel,
              {
                backgroundColor:
                  liveConflict === 2
                    ? colors.danger
                    : liveConflict === 1
                      ? colors.warning
                      : colors.brand,
              },
            ]}
            pointerEvents="none">
            <Animated.Text style={[styles.liveLabelText, { color: '#FFFFFF' }]}>
              {activeMode === 1 ? liveTimeLabel : liveDurLabel}
            </Animated.Text>
          </View>
        ) : null}

        <AppointmentBlock
          id={id}
          guestName={guestName}
          serviceName={serviceName}
          timeLabel={timeLabel}
          status={status}
          clientArrivedAt={clientArrivedAt}
          staffAttendanceConfirmedAt={staffAttendanceConfirmedAt}
          guestAttendanceConfirmedAt={guestAttendanceConfirmedAt}
          height={densityHeight}
          laneIndex={laneIndex}
          laneCount={laneCount}
          onPress={onPress}
          onStatusChange={onStatusChange}
          onArrivalToggle={onArrivalToggle}
          actionPending={actionPending}
          complianceFlag={complianceFlag}
        />

        {/* Resize affordance — a grip on the bottom edge (hold it to resize). */}
        {resizeEnabled ? (
          <View
            style={styles.resizeGripWrap}
            pointerEvents="none"
            accessibilityLabel="Touch and hold the bottom edge to change duration">
            <View style={[styles.resizeGrip, { backgroundColor: colors.surface }]} />
          </View>
        ) : null}

        {/* Hold-to-arm progress — fills along the bottom edge during the hold. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.holdBar, { backgroundColor: colors.accent }, holdBarStyle]}
        />
      </Animated.View>
    </GestureDetector>
  );
}

// ---- Styles ------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    paddingHorizontal: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  liveLabel: {
    position: 'absolute',
    top: -26,
    left: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    zIndex: 1000,
  },
  liveLabelText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  resizeGripWrap: {
    position: 'absolute',
    bottom: 2,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  resizeGrip: {
    width: 28,
    height: 3,
    borderRadius: 2,
    opacity: 0.65,
  },
  holdBar: {
    position: 'absolute',
    bottom: 0,
    left: 1,
    height: 3,
    borderRadius: 2,
    maxWidth: '100%',
  },
});
