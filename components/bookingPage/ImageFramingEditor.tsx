/**
 * ImageFramingEditor — drag-to-reposition + pinch/step-to-zoom editor for a
 * booking-page image inside a fixed frame. Mobile-native counterpart of the
 * web's `BookingPageDraggableImage`/`BookingPageDraggableLogo` framing
 * (`booking-page-image-framing.ts`), built on react-native-gesture-handler +
 * Reanimated. Extracted from LogoFramingSheet so the service-photo and
 * team-photo sheets can reuse it as an in-sheet mode step (a second stacked
 * Sheet is flaky on iOS — see the "no stacked modals" rule).
 *
 * UX
 *   - A 240px frame (circle for logo/team badges, rounded square for service
 *     thumbnails) shows the image (`expo-image`, contentFit="cover") filling it,
 *     with the current framing applied as
 *     `transform:[{translateX},{translateY},{scale}]`.
 *   - Pan gesture: drag to reposition. Each move adds `dpx * 100 / FRAME` to
 *     x/y (clamped 0–100). A Reanimated shared value drives the live transform;
 *     x/y commit to React state on gesture end.
 *   - Pinch gesture + a −/+ Stepper both drive zoom (clamped 0.5–3). The
 *     Stepper gives precise 5% steps; the "Zoom NNN%" read-out tracks both.
 *   - Reset → centred default (x:50, y:50, zoom:1).
 *   - Save → `onSave(normalizeLogoFraming({x,y,zoom}))` (`null` for the centred
 *     default). Cancel → `onCancel`. The host closes/leaves the mode itself.
 *
 * Mapping (mirrors the web math): x,y are 0–100 positions (50 = centred); a
 * drag of `dpx` px over the FRAME moves the position by `dpx * 100 / FRAME`
 * points. zoom is the raw scale factor. The render transform is centre-origin:
 * translate = ((pos-50)/100)*FRAME px, scale = zoom — identical framing to the
 * web's `translate((x-50)%,(y-50)%) scale(zoom)` on a cover image.
 */

import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import {
  LOGO_ZOOM_MAX,
  LOGO_ZOOM_MIN,
  normalizeLogoFraming,
  resolveLogoFraming,
  type BookingPageImageFraming,
} from '@/lib/booking/bookingPageConfig';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export type ImageFramingEditorProps = {
  /**
   * Seed/re-seed the form state while true (a host Sheet keeps this component
   * mounted when closed, so mount alone can't be the seed signal). Hosts that
   * mount the editor per use can omit it.
   */
  active?: boolean;
  imageUrl: string | null;
  value: BookingPageImageFraming | null;
  /** Frame silhouette — matches where the image shows on the public page. */
  frameShape: 'circle' | 'square';
  /** Header title, e.g. "Reposition logo" / "Reposition photo". */
  title: string;
  /** Placeholder copy when there is no image yet. */
  emptyLabel: string;
  /** Accessibility label for the draggable frame. */
  accessibilityLabel: string;
  onCancel: () => void;
  onSave: (next: BookingPageImageFraming | null) => void; // null = centred default
};

/** Side of the preview frame (px). The pan/zoom math scales to this. */
const FRAME = 240;
/** Stepper increment for zoom (matches the web slider's 5% step). */
const ZOOM_STEP = 0.05;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
function clampZoom(n: number): number {
  return clamp(n, LOGO_ZOOM_MIN, LOGO_ZOOM_MAX);
}

export function ImageFramingEditor({
  active = true,
  imageUrl,
  value,
  frameShape,
  title,
  emptyLabel,
  accessibilityLabel,
  onCancel,
  onSave,
}: ImageFramingEditorProps): React.JSX.Element {
  const { colors } = useTheme();

  // ---- React form state (the committed framing) -------------------------------
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [zoom, setZoom] = useState(1);

  // ---- UI-thread shared values (buttery live pan/zoom) ------------------------
  // These hold the LIVE framing during a gesture; React state is the source of
  // truth at rest and is committed on gesture end. `.get()/.set()` only.
  const liveX = useSharedValue(50);
  const liveY = useSharedValue(50);
  const liveZoom = useSharedValue(1);
  // Pinch baseline — the zoom captured when fingers land, so the scale factor
  // multiplies from there rather than from the live (already-changing) value.
  const pinchStartZoom = useSharedValue(1);

  // Seed local x/y/zoom + the shared values from the incoming framing whenever
  // the editor becomes active (or the source framing changes while active).
  useEffect(() => {
    if (!active) return;
    const r = resolveLogoFraming(value);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when the editor opens
    setX(r.x);
    setY(r.y);
    setZoom(r.zoom);
    liveX.set(r.x);
    liveY.set(r.y);
    liveZoom.set(r.zoom);
  }, [active, value, liveX, liveY, liveZoom]);

  // Keep the shared values in lock-step with React state when it changes from
  // the Stepper / Reset (so the preview reflects taps, not just drags).
  useEffect(() => {
    liveX.set(x);
    liveY.set(y);
    liveZoom.set(zoom);
  }, [x, y, zoom, liveX, liveY, liveZoom]);

  const hasImage = imageUrl != null;

  // ---- Gestures ---------------------------------------------------------------
  // Drag the image to reposition: convert the per-frame px delta to 0–100 points,
  // clamp, and write to the shared values for a live transform. Commit to React
  // state on end.
  const panGesture = Gesture.Pan()
    .enabled(hasImage)
    .onChange((e) => {
      'worklet';
      // Inlined framingPanDelta (px → 0–100 over FRAME) + clamp to 0–100. A worklet
      // can't call the imported/local helpers under Reanimated 4 ("Object is not a
      // function"); Math.* is available on the UI thread.
      const nx = liveX.get() + e.changeX * (100 / FRAME);
      const ny = liveY.get() + e.changeY * (100 / FRAME);
      liveX.set(Math.min(100, Math.max(0, nx)));
      liveY.set(Math.min(100, Math.max(0, ny)));
    })
    .onEnd(() => {
      'worklet';
      runOnJS(setX)(liveX.get());
      runOnJS(setY)(liveY.get());
    });

  // Pinch to zoom: multiply the captured baseline by the gesture scale, clamp to
  // [0.5, 3], live-update, then commit on end.
  const pinchGesture = Gesture.Pinch()
    .enabled(hasImage)
    .onStart(() => {
      'worklet';
      pinchStartZoom.set(liveZoom.get());
    })
    .onUpdate((e) => {
      'worklet';
      // Inlined clampZoom — clamp to [LOGO_ZOOM_MIN, LOGO_ZOOM_MAX] (number
      // constants are safe to capture in a worklet; the helper call is not).
      const z = pinchStartZoom.get() * e.scale;
      liveZoom.set(Math.min(LOGO_ZOOM_MAX, Math.max(LOGO_ZOOM_MIN, z)));
    })
    .onEnd(() => {
      'worklet';
      runOnJS(setZoom)(liveZoom.get());
    });

  // Pan + pinch run together so you can reposition and scale in one motion.
  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture);

  // ---- Live preview transform (UI thread) -------------------------------------
  const imageAnimatedStyle = useAnimatedStyle(() => {
    // Inlined `framingTransform` — calling the imported (non-worklet) helper
    // from this worklet throws "Object is not a function" on the UI thread under
    // Reanimated 4. liveX/Y are 0–100 (clamped on set); the transform is
    // centre-origin: translate = ((pos-50)/100)*FRAME, scale = zoom.
    return {
      transform: [
        { translateX: ((liveX.get() - 50) / 100) * FRAME },
        { translateY: ((liveY.get() - 50) / 100) * FRAME },
        { scale: liveZoom.get() },
      ],
    };
  });

  // ---- Zoom controls ----------------------------------------------------------
  const zoomPercent = Math.round(zoom * 100);
  const stepZoom = (dir: 1 | -1) => {
    hapticSelect();
    setZoom((z) => Math.round(clampZoom(z + dir * ZOOM_STEP) * 100) / 100);
  };

  const handleReset = () => {
    hapticSelect();
    setX(50);
    setY(50);
    setZoom(1);
  };

  const handleSave = () => {
    onSave(normalizeLogoFraming({ x, y, zoom }));
  };

  return (
    <View>
      <View style={styles.header}>
        <Text variant="subheading">{title}</Text>
        <Text variant="bodySmall" tone="secondary">
          Drag to reposition · pinch to zoom
        </Text>
      </View>

      {/* Preview frame. The image fills it (contentFit="cover") and the live
          framing transform is applied on top. */}
      <View style={styles.previewWrap}>
        <GestureDetector gesture={composedGesture}>
          <View
            style={[
              styles.frame,
              frameShape === 'circle' ? styles.frameCircle : styles.frameSquare,
              { backgroundColor: colors.surface, borderColor: colors.borderStrong },
            ]}
            accessibilityRole="adjustable"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint="Drag to reposition, pinch to zoom">
            {hasImage ? (
              <Animated.View style={[styles.imageFill, imageAnimatedStyle]}>
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.imageFill}
                  contentFit="cover"
                  transition={0}
                />
              </Animated.View>
            ) : (
              <View style={styles.placeholder}>
                <Text variant="caption" tone="muted" style={styles.placeholderText}>
                  {emptyLabel}
                </Text>
              </View>
            )}
          </View>
        </GestureDetector>
      </View>

      {/* Zoom read-out + precise −/+ stepper (works alongside the pinch). */}
      <View style={styles.controls}>
        <Stepper
          label={`Zoom ${zoomPercent}%`}
          value={`${zoomPercent}%`}
          onDecrement={() => stepZoom(-1)}
          onIncrement={() => stepZoom(1)}
        />
        <Button
          label="Reset"
          variant="ghost"
          size="sm"
          disabled={!hasImage}
          onPress={handleReset}
          style={styles.resetButton}
        />
      </View>

      {/* Footer actions. */}
      <View style={styles.footer}>
        <Button label="Cancel" variant="secondary" onPress={onCancel} style={styles.footerButton} />
        <Button
          label="Save"
          variant="primary"
          disabled={!hasImage}
          onPress={handleSave}
          style={styles.footerButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xxs,
  },
  previewWrap: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  frame: {
    width: FRAME,
    height: FRAME,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameCircle: {
    borderRadius: FRAME / 2,
  },
  frameSquare: {
    borderRadius: radius.md,
  },
  imageFill: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  placeholderText: {
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  resetButton: {
    paddingHorizontal: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  footerButton: {
    flex: 1,
  },
});
