/**
 * DraggableAppointmentBlock
 *
 * Wraps AppointmentBlock with drag-to-reschedule behaviour:
 *   - Short tap    → opens booking detail (onPress)
 *   - Long-press (hold, no movement) → opens RescheduleSheet (onLongPress)
 *   - Hold + vertical drag → arms on haptic, translates block live, snaps on
 *     release and calls onDragReschedule(bookingId, newTime)
 *
 * Gesture composition:
 *   A Pan gesture with activateAfterLongPress handles the drag. AppointmentBlock's
 *   own Pressable handles the tap — the pan won't activate on a short tap since
 *   it requires both the hold delay AND movement, so tap and drag compose cleanly.
 *
 * Design:
 *   - Reanimated shared values drive translation on the UI thread (no JS bridge).
 *   - useAnimatedReaction bridges shared-value changes to React state for the
 *     live-time badge so it updates in near-real-time without illegal read-during-render.
 *   - Scale + opacity feedback when armed.
 *   - A resize handle at the bottom edge (≥56 px tall blocks) lets the user
 *     drag to change duration (optional, only rendered when onDragResize is provided).
 */

import { useCallback, useState } from 'react';
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
  minutesToTime,
  PX_PER_MINUTE,
  TAP_SNAP_MINUTES,
  timeToMinutes,
} from '@/components/calendar/grid-layout';
import { hapticError, hapticSelect, hapticSuccess } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ComplianceBookingFlag } from '@/lib/queries/useCompliance';

// ---- Constants ---------------------------------------------------------------

/** How long the user must hold before the drag arms (ms). */
const HOLD_MS = 300;
/** Minimum vertical movement (px) that counts as a drag intention. */
const DRAG_THRESHOLD_PX = 4;
/** Spring config for snapping back on cancel. */
const SNAP_SPRING = { damping: 22, stiffness: 280 };
/** Height of the resize handle at the bottom of the block. */
const RESIZE_HANDLE_HEIGHT = 14;
/** Minimum block height to show the resize handle. */
const RESIZE_HANDLE_MIN_BLOCK_HEIGHT = 56;
/** Maximum duration in minutes (14 h). */
const MAX_DURATION_MINUTES = 14 * 60;

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

type DraggableAppointmentBlockProps = {
  id: string;
  guestName: string;
  serviceName: string;
  timeLabel: string;
  status: string;
  clientArrivedAt?: string | null;
  staffAttendanceConfirmedAt?: string | null;
  guestAttendanceConfirmedAt?: string | null;
  top: number;
  height: number;
  /** The booking's start time in "HH:mm" format — used to compute new time. */
  startTime: string;
  /** Duration in minutes — used for duration resize. */
  durationMinutes: number;
  onPress: (id: string) => void;
  onLongPress?: (id: string) => void;
  onStatusChange?: (id: string, status: string) => void;
  onArrivalToggle?: (id: string, arrived: boolean) => void;
  actionPending?: boolean;
  complianceFlag?: ComplianceBookingFlag | null;
  blockLeft?: number;
  /**
   * Called when the user releases after a drag, with the new snapped time.
   * The parent is responsible for committing via useRescheduleBooking.
   */
  onDragReschedule?: (bookingId: string, newTime: string) => void;
  /**
   * Called when the user drags the resize handle to change duration.
   */
  onDragResize?: (bookingId: string, newDurationMinutes: number) => void;
};

// ---- Component ---------------------------------------------------------------

export function DraggableAppointmentBlock({
  id,
  guestName,
  serviceName,
  timeLabel,
  status,
  clientArrivedAt,
  staffAttendanceConfirmedAt,
  guestAttendanceConfirmedAt,
  top,
  height,
  startTime,
  durationMinutes,
  onPress,
  onLongPress,
  onStatusChange,
  onArrivalToggle,
  actionPending = false,
  complianceFlag,
  blockLeft,
  onDragReschedule,
  onDragResize,
}: DraggableAppointmentBlockProps) {
  const { colors } = useTheme();

  // ---- Shared animated values (UI thread) ----
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const isDragging = useSharedValue(false);
  const isResizing = useSharedValue(false);
  const liveMinutes = useSharedValue(timeToMinutes(startTime));
  const liveDurationMins = useSharedValue(durationMinutes);

  // ---- React state for live labels (JS thread, fed by useAnimatedReaction) ----
  const [liveTimeLabel, setLiveTimeLabel] = useState(startTime.slice(0, 5));
  const [liveDurLabel, setLiveDurLabel] = useState('');
  const [showDragLabel, setShowDragLabel] = useState(false);
  const [showResizeLabel, setShowResizeLabel] = useState(false);

  // Bridge shared-value changes to state for the live badges.
  useAnimatedReaction(
    () => ({ mins: liveMinutes.value, dragging: isDragging.value }),
    ({ mins, dragging }) => {
      runOnJS(setLiveTimeLabel)(formatMinutesLabel(mins));
      runOnJS(setShowDragLabel)(dragging);
    },
  );

  useAnimatedReaction(
    () => ({ dur: liveDurationMins.value, resizing: isResizing.value }),
    ({ dur, resizing }) => {
      runOnJS(setLiveDurLabel)(formatDurationLabel(dur));
      runOnJS(setShowResizeLabel)(resizing);
    },
  );

  // ---- Stable JS callbacks (called via runOnJS from worklets) ----
  const jsHapticSelect = useCallback(() => hapticSelect(), []);
  const jsHapticSuccess = useCallback(() => hapticSuccess(), []);
  const jsHapticError = useCallback(() => hapticError(), []);

  const jsCommitDrag = useCallback(
    (newTime: string) => {
      onDragReschedule?.(id, newTime);
    },
    [id, onDragReschedule],
  );

  const jsCommitResize = useCallback(
    (newDuration: number) => {
      onDragResize?.(id, newDuration);
    },
    [id, onDragResize],
  );

  // ---- Drag gesture (hold + pan to reschedule) ----
  const originalMinutes = timeToMinutes(startTime);

  /* eslint-disable react-hooks/immutability -- worklet callbacks execute asynchronously
     on the Reanimated UI thread and are not called during React render. Mutating
     SharedValue.value here is the correct and only pattern Reanimated supports. */

  const dragGesture = Gesture.Pan()
    .activateAfterLongPress(HOLD_MS)
    .minDistance(DRAG_THRESHOLD_PX)
    .onStart(() => {
      'worklet';
      isDragging.value = true;
      liveMinutes.value = originalMinutes;
      scale.value = withSpring(1.04, SNAP_SPRING);
      opacity.value = withTiming(0.88, { duration: 120 });
      runOnJS(jsHapticSelect)();
    })
    .onUpdate((event) => {
      'worklet';
      if (!isDragging.value) return;
      const deltaMinutes = event.translationY / PX_PER_MINUTE;
      const rawMinutes = originalMinutes + deltaMinutes;
      const snapped = snapToGrid(rawMinutes, TAP_SNAP_MINUTES);
      const clamped = clampMinutes(snapped);
      liveMinutes.value = clamped;
      translateY.value = (clamped - originalMinutes) * PX_PER_MINUTE;
    })
    .onEnd(() => {
      'worklet';
      if (!isDragging.value) return;
      isDragging.value = false;
      const snappedMinutes = liveMinutes.value;
      const newTime = minutesToTime(snappedMinutes);
      scale.value = withSpring(1, SNAP_SPRING);
      opacity.value = withTiming(1, { duration: 120 });
      translateY.value = withSpring(0, SNAP_SPRING);
      runOnJS(jsHapticSuccess)();
      runOnJS(jsCommitDrag)(newTime);
    })
    .onFinalize((_event, success) => {
      'worklet';
      if (!success && isDragging.value) {
        isDragging.value = false;
        scale.value = withSpring(1, SNAP_SPRING);
        opacity.value = withTiming(1, { duration: 120 });
        translateY.value = withSpring(0, SNAP_SPRING);
        runOnJS(jsHapticError)();
      }
    });

  // ---- Resize gesture (drag the bottom handle to change duration) ----
  const resizeGesture = Gesture.Pan()
    .minDistance(DRAG_THRESHOLD_PX)
    .onStart(() => {
      'worklet';
      isResizing.value = true;
      liveDurationMins.value = durationMinutes;
      runOnJS(jsHapticSelect)();
    })
    .onUpdate((event) => {
      'worklet';
      if (!isResizing.value) return;
      const deltaMins = event.translationY / PX_PER_MINUTE;
      const rawDuration = durationMinutes + deltaMins;
      const snapped = snapToGrid(rawDuration, TAP_SNAP_MINUTES);
      const clamped = Math.max(TAP_SNAP_MINUTES, Math.min(MAX_DURATION_MINUTES, snapped));
      liveDurationMins.value = clamped;
    })
    .onEnd(() => {
      'worklet';
      if (!isResizing.value) return;
      isResizing.value = false;
      const newDuration = liveDurationMins.value;
      runOnJS(jsHapticSuccess)();
      runOnJS(jsCommitResize)(newDuration);
    })
    .onFinalize((_event, success) => {
      'worklet';
      if (!success && isResizing.value) {
        isResizing.value = false;
        liveDurationMins.value = durationMinutes;
        runOnJS(jsHapticError)();
      }
    });

  /* eslint-enable react-hooks/immutability */

  // ---- Animated styles ----
  const animatedBlockStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    opacity: opacity.value,
    zIndex: isDragging.value ? 999 : 1,
    elevation: isDragging.value ? 12 : 0,
  }));

  const animatedHeightStyle = useAnimatedStyle(() => ({
    height: isResizing.value
      ? Math.max(TAP_SNAP_MINUTES, liveDurationMins.value) * PX_PER_MINUTE
      : height,
  }));

  const showResizeHandle = height >= RESIZE_HANDLE_MIN_BLOCK_HEIGHT && onDragResize != null;

  return (
    <GestureDetector gesture={onDragReschedule != null ? dragGesture : Gesture.Pan().enabled(false)}>
      <Animated.View
        style={[
          styles.root,
          animatedBlockStyle,
          { top, left: 0, right: 0 },
        ]}>
        {/* Live time badge — shown above the block while dragging */}
        {showDragLabel ? (
          <View
            style={[styles.liveLabel, { backgroundColor: colors.brand }]}
            pointerEvents="none">
            <Animated.Text style={[styles.liveLabelText, { color: colors.surface }]}>
              {liveTimeLabel}
            </Animated.Text>
          </View>
        ) : null}

        <Animated.View style={animatedHeightStyle}>
          <AppointmentBlock
            id={id}
            guestName={guestName}
            serviceName={serviceName}
            timeLabel={timeLabel}
            status={status}
            clientArrivedAt={clientArrivedAt}
            staffAttendanceConfirmedAt={staffAttendanceConfirmedAt}
            guestAttendanceConfirmedAt={guestAttendanceConfirmedAt}
            // top=0 because the outer Animated.View owns the vertical position
            top={0}
            height={height}
            onPress={onPress}
            onLongPress={onLongPress}
            onStatusChange={onStatusChange}
            onArrivalToggle={onArrivalToggle}
            actionPending={actionPending}
            complianceFlag={complianceFlag}
            blockLeft={blockLeft}
          />

          {/* Resize handle — bottom edge, only when onDragResize is provided */}
          {showResizeHandle ? (
            <GestureDetector gesture={resizeGesture}>
              <Animated.View
                style={[styles.resizeHandle, { backgroundColor: colors.brand }]}
                accessibilityLabel="Drag to resize appointment duration">
                <View style={[styles.resizeGrip, { backgroundColor: colors.surface }]} />
              </Animated.View>
            </GestureDetector>
          ) : null}
        </Animated.View>

        {/* Live duration badge — shown below the block while resizing */}
        {showResizeHandle && showResizeLabel ? (
          <View
            style={[styles.liveDurationLabel, { backgroundColor: colors.brand }]}
            pointerEvents="none">
            <Animated.Text style={[styles.liveDurationLabelText, { color: colors.surface }]}>
              {liveDurLabel}
            </Animated.Text>
          </View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

// ---- Styles ------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
  },
  liveLabel: {
    position: 'absolute',
    top: -24,
    left: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    zIndex: 1000,
  },
  liveLabelText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  resizeHandle: {
    position: 'absolute',
    bottom: 0,
    left: 8,
    right: 8,
    height: RESIZE_HANDLE_HEIGHT,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.75,
  },
  resizeGrip: {
    width: 24,
    height: 3,
    borderRadius: 2,
    opacity: 0.7,
  },
  liveDurationLabel: {
    position: 'absolute',
    bottom: -22,
    left: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    zIndex: 1000,
  },
  liveDurationLabelText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
});
