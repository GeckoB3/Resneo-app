/**
 * LogoFramingSheet — drag-to-reposition + pinch/step-to-zoom editor for the
 * booking page's circular logo badge. Mobile-native port of the web's
 * "drag + scale" logo framing (`booking-page-image-framing.ts`), rebuilt around
 * react-native-gesture-handler + Reanimated.
 *
 * UX
 *   - A 240px circular frame shows the logo (`expo-image`, contentFit="cover")
 *     filling it, with the current framing applied as
 *     `transform:[{translateX},{translateY},{scale}]` from `logoFramingTransform`.
 *   - Pan gesture: drag the logo to reposition. Each move adds
 *     `framingPanDelta(change, FRAME)` to x/y (clamped 0–100). A Reanimated
 *     shared value drives the live transform; x/y commit to React state on end.
 *   - Pinch gesture + a −/+ Stepper both drive zoom (clamped 0.5–3). The Stepper
 *     gives precise 5% steps; the live "Zoom NNN%" read-out tracks both.
 *   - Reset → centred default (x:50, y:50, zoom:1).
 *   - Save → `onSave(normalizeLogoFraming({x,y,zoom}))` (which yields `null` for
 *     the centred default), then closes. Cancel → `onClose`.
 *
 * Mapping (mirrors the web math):
 *   x,y are 0–100 positions (50 = centred); a drag of `dpx` px over the FRAME
 *   moves the position by `dpx * 100 / FRAME` points, so dragging the logo right
 *   raises x and shifts the image right by the same screen distance. zoom is the
 *   raw scale factor (1 = native fit). The render transform is centre-origin:
 *   translate = ((pos-50)/100)*FRAME px, scale = zoom — identical framing to the
 *   web's `translate((x-50)%,(y-50)%) scale(zoom)` on a cover image.
 *
 * Consumes the shared `components/ui/*` primitives as-is (no edits to them) and
 * the pure framing helpers from `@/lib/booking/bookingPageConfig`.
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
import { Sheet } from '@/components/ui/Sheet';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import {
  framingPanDelta,
  LOGO_ZOOM_MAX,
  LOGO_ZOOM_MIN,
  logoFramingTransform,
  normalizeLogoFraming,
  resolveLogoFraming,
  type BookingPageImageFraming,
} from '@/lib/booking/bookingPageConfig';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export type LogoFramingSheetProps = {
  visible: boolean;
  imageUrl: string | null;
  value: BookingPageImageFraming | null;
  onClose: () => void;
  onSave: (next: BookingPageImageFraming | null) => void; // null = reset to centred default
};

/** Diameter of the circular preview frame (px). The pan/zoom math scales to this. */
const FRAME = 240;
/** Stepper increment for zoom (matches the web slider's 5% step). */
const ZOOM_STEP = 0.05;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
function clampPos(n: number): number {
  return clamp(n, 0, 100);
}
function clampZoom(n: number): number {
  return clamp(n, LOGO_ZOOM_MIN, LOGO_ZOOM_MAX);
}

export function LogoFramingSheet({
  visible,
  imageUrl,
  value,
  onClose,
  onSave,
}: LogoFramingSheetProps): React.JSX.Element {
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
  // the sheet opens (or the source framing changes while open).
  useEffect(() => {
    if (!visible) return;
    const r = resolveLogoFraming(value);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when the sheet opens
    setX(r.x);
    setY(r.y);
    setZoom(r.zoom);
    liveX.set(r.x);
    liveY.set(r.y);
    liveZoom.set(r.zoom);
  }, [visible, value, liveX, liveY, liveZoom]);

  // Keep the shared values in lock-step with React state when it changes from
  // the Stepper / Reset (so the preview reflects taps, not just drags).
  useEffect(() => {
    liveX.set(x);
    liveY.set(y);
    liveZoom.set(zoom);
  }, [x, y, zoom, liveX, liveY, liveZoom]);

  const hasImage = imageUrl != null;

  // ---- Gestures ---------------------------------------------------------------
  // Drag the logo to reposition: convert the per-frame px delta to 0–100 points
  // via `framingPanDelta`, clamp, and write to the shared values for a live
  // transform. Commit to React state on end.
  const panGesture = Gesture.Pan()
    .enabled(hasImage)
    .onChange((e) => {
      'worklet';
      liveX.set(clampPos(liveX.get() + framingPanDelta(e.changeX, FRAME)));
      liveY.set(clampPos(liveY.get() + framingPanDelta(e.changeY, FRAME)));
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
      liveZoom.set(clampZoom(pinchStartZoom.get() * e.scale));
    })
    .onEnd(() => {
      'worklet';
      runOnJS(setZoom)(liveZoom.get());
    });

  // Pan + pinch run together so you can reposition and scale in one motion.
  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture);

  // ---- Live preview transform (UI thread) -------------------------------------
  const imageAnimatedStyle = useAnimatedStyle(() => {
    const t = logoFramingTransform(
      { x: liveX.get(), y: liveY.get(), zoom: liveZoom.get() },
      FRAME,
    );
    return {
      transform: [
        { translateX: t.translateX },
        { translateY: t.translateY },
        { scale: t.scale },
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
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="90%">
      <View style={styles.header}>
        <Text variant="subheading">Reposition logo</Text>
        <Text variant="bodySmall" tone="secondary">
          Drag to reposition · pinch to zoom
        </Text>
      </View>

      {/* Circular preview frame. The image fills it (contentFit="cover") and the
          live framing transform is applied on top. */}
      <View style={styles.previewWrap}>
        <GestureDetector gesture={composedGesture}>
          <View
            style={[
              styles.frame,
              { backgroundColor: colors.surface, borderColor: colors.borderStrong },
            ]}
            accessibilityRole="adjustable"
            accessibilityLabel="Logo position and zoom"
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
                  Add a logo to reposition it
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
        <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.footerButton} />
        <Button
          label="Save"
          variant="primary"
          disabled={!hasImage}
          onPress={handleSave}
          style={styles.footerButton}
        />
      </View>
    </Sheet>
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
    borderRadius: FRAME / 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
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
