/**
 * CoverCropperSheet — mobile-native free-form cover-photo cropper.
 *
 * Web parity: `_reference/Resneo/src/lib/booking/booking-page-cover.ts`. The
 * uploaded photo is never altered; we store the region the venue chose to show
 * as FRACTIONS of the natural image — `{ x, y }` top-left, `{ w, h }` size (all
 * 0–1) plus the source aspect ratio `ar` (natural width ÷ height). `null` ⇒ the
 * whole photo (no crop). The final value goes through `sanitizeCoverCropBox`,
 * which clamps + drops a full-frame selection back to `null`.
 *
 * How the editor maps fractions ↔ pixels:
 *   - The whole image is displayed at the measured container width `CW`, height
 *     `CH = CW / ar`, `contentFit="cover"`.
 *   - The crop rect is held on the UI thread in pixels relative to that image:
 *       left = x·CW   top = y·CH   width = w·CW   height = h·CH
 *   - On Apply we invert: x = left/CW, y = top/CH, w = width/CW, h = height/CH,
 *     then `sanitizeCoverCropBox({ x, y, w, h, ar })`.
 *
 * Gestures use react-native-gesture-handler `Gesture.Pan` + Reanimated shared
 * values (`.get()/.set()`), mirroring `components/calendar/DraggableAppointmentBlock`.
 * Dragging the rect body MOVEs it; dragging a corner handle RESIZEs that corner
 * (free aspect). Both clamp so the rect stays inside the image and never inverts
 * or drops below a small minimum.
 *
 * RULES: only consumes `components/ui/*` + `@/lib/booking/bookingPageConfig`.
 */

import { Image, type ImageLoadEventData } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Sheet } from '@/components/ui/Sheet';
import {
  BOOKING_COVER_DEFAULT_ASPECT,
  sanitizeCoverCropBox,
  type BookingPageCoverCropBox,
} from '@/lib/booking/bookingPageConfig';
import { motion, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export type CoverCropperSheetProps = {
  visible: boolean;
  imageUrl: string | null;
  value: BookingPageCoverCropBox | null;
  onClose: () => void;
  /** `null` = whole photo (no crop). */
  onSave: (next: BookingPageCoverCropBox | null) => void;
};

// ---- Constants ---------------------------------------------------------------

/** Smallest crop edge as a fraction of the image — keeps a grabbable rect. */
const MIN_FRACTION = 0.05;
/** Visual size of each corner handle (px); its touch zone is larger via hitSlop. */
const HANDLE = 26;
/** Generous invisible touch padding around each corner handle. */
const HANDLE_HIT_SLOP = 16;

// ---- Worklet helpers ---------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  'worklet';
  // Guard against an inverted range (min > max) collapsing to a NaN/negative box.
  return Math.max(min, Math.min(max, n));
}

// ---- Component ---------------------------------------------------------------

export function CoverCropperSheet({
  visible,
  imageUrl,
  value,
  onClose,
  onSave,
}: CoverCropperSheetProps): React.JSX.Element {
  const { colors } = useTheme();

  // Source aspect ratio (natural width ÷ height). Seed optimistically from the
  // stored value so the box doesn't jump, but confirm from the real onLoad.
  const [ar, setAr] = useState<number | null>(value?.ar && value.ar > 0 ? value.ar : null);
  const [loaded, setLoaded] = useState(false);
  // True once the crop rect has been seeded for the current image — gates a
  // gentle fade-in so the overlay never flashes at the wrong position first.
  const [seeded, setSeeded] = useState(false);
  // Measured container width; the displayed image is CW × (CW / ar).
  const [containerW, setContainerW] = useState(0);

  // Reset transient state each time the sheet (re)opens so a previous image's
  // dimensions never bleed into the next one.
  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when the sheet opens
    setLoaded(false);
    setSeeded(false);
    setAr(value?.ar && value.ar > 0 ? value.ar : null);
  }, [visible, imageUrl, value?.ar]);

  // Displayed image box in px. Only valid once measured AND the aspect is known.
  const imgW = containerW;
  const imgH = ar && ar > 0 && containerW > 0 ? containerW / ar : 0;
  const ready = loaded && imgW > 0 && imgH > 0;

  // ---- Crop rect (UI thread, px relative to the displayed image) ----
  const left = useSharedValue(0);
  const top = useSharedValue(0);
  const boxW = useSharedValue(0);
  const boxH = useSharedValue(0);
  // Mirror the image dimensions onto the UI thread so the pan worklets can clamp
  // against the live size (CW/CH change with layout, so plain captures won't do).
  const imgWsv = useSharedValue(0);
  const imgHsv = useSharedValue(0);
  // 0→1 fade for the whole crop overlay once the rect is seeded.
  const fade = useSharedValue(0);

  useEffect(() => {
    fade.set(withTiming(seeded ? 1 : 0, { duration: seeded ? motion.normal : 0 }));
  }, [seeded, fade]);

  useEffect(() => {
    imgWsv.set(imgW);
    imgHsv.set(imgH);
  }, [imgW, imgH, imgWsv, imgHsv]);

  // Seed the rect from `value` (or full-frame) once the image is measured/loaded.
  // Runs on open and whenever the measured box changes (rotation / first layout).
  useEffect(() => {
    if (!ready) return;
    const v = value;
    if (v && v.w > 0 && v.h > 0) {
      // Size first (clamped to a valid ≥min, ≤image span), THEN clamp the
      // top-left so the box always fits inside the image — no edge overflow even
      // for an extreme stored crop hugging a far edge.
      const wPx = clamp(v.w * imgW, MIN_FRACTION * imgW, imgW);
      const hPx = clamp(v.h * imgH, MIN_FRACTION * imgH, imgH);
      left.set(clamp(v.x * imgW, 0, imgW - wPx));
      top.set(clamp(v.y * imgH, 0, imgH - hPx));
      boxW.set(wPx);
      boxH.set(hPx);
    } else {
      // No crop → start as the whole frame.
      left.set(0);
      top.set(0);
      boxW.set(imgW);
      boxH.set(imgH);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when the sheet opens
    setSeeded(true);
    // Re-seed when the sheet opens, the measured image changes, or value swaps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, imgW, imgH, visible, value]);

  // ---- onLoad: read NATURAL dimensions for the true aspect ratio ----
  const handleLoad = useCallback((e: ImageLoadEventData) => {
    const w = e.source?.width ?? 0;
    const h = e.source?.height ?? 0;
    if (w > 0 && h > 0) setAr(w / h);
    setLoaded(true);
  }, []);

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setContainerW(w);
  }, []);

  // ---- Move gesture (drag the rect body) ----
  const startLeft = useSharedValue(0);
  const startTop = useSharedValue(0);

  const moveGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      startLeft.set(left.get());
      startTop.set(top.get());
    })
    .onUpdate((e) => {
      'worklet';
      const w = imgWsv.get();
      const h = imgHsv.get();
      left.set(clamp(startLeft.get() + e.translationX, 0, w - boxW.get()));
      top.set(clamp(startTop.get() + e.translationY, 0, h - boxH.get()));
    });

  // ---- Resize gestures (one per corner) ----
  // Each corner keeps the OPPOSITE edges fixed, so the rect can never invert and
  // always stays in bounds: we only move the dragged edges, clamped between 0 /
  // the image edge and the opposite edge minus the minimum size.
  //
  // `movesLeft`/`movesTop` say whether THIS corner drags the left / top edge
  // (true) or the right / bottom edge (false). The math is shared; only those two
  // booleans differ per corner — so the four gestures stay identical in logic.
  const startL = useSharedValue(0);
  const startT = useSharedValue(0);
  const startR = useSharedValue(0); // right edge (left + width)
  const startB = useSharedValue(0); // bottom edge (top + height)

  const resizeUpdate = useCallback(
    (tx: number, ty: number, movesLeft: boolean, movesTop: boolean) => {
      'worklet';
      const w = imgWsv.get();
      const h = imgHsv.get();
      const minW = MIN_FRACTION * w;
      const minH = MIN_FRACTION * h;
      const r = startR.get();
      const b = startB.get();
      const l0 = startL.get();
      const t0 = startT.get();

      if (movesLeft) {
        // Left edge moves; right edge `r` fixed.
        const nl = clamp(l0 + tx, 0, r - minW);
        left.set(nl);
        boxW.set(r - nl);
      } else {
        // Right edge moves; left edge `l0` fixed.
        const nr = clamp(r + tx, l0 + minW, w);
        boxW.set(nr - l0);
      }

      if (movesTop) {
        // Top edge moves; bottom edge `b` fixed.
        const nt = clamp(t0 + ty, 0, b - minH);
        top.set(nt);
        boxH.set(b - nt);
      } else {
        // Bottom edge moves; top edge `t0` fixed.
        const nb = clamp(b + ty, t0 + minH, h);
        boxH.set(nb - t0);
      }
    },
    [imgWsv, imgHsv, startL, startT, startR, startB, left, top, boxW, boxH],
  );

  const captureResizeStart = useCallback(() => {
    'worklet';
    startL.set(left.get());
    startT.set(top.get());
    startR.set(left.get() + boxW.get());
    startB.set(top.get() + boxH.get());
  }, [startL, startT, startR, startB, left, top, boxW, boxH]);

  // Four gestures, declared unconditionally (Rules of Hooks — no loops/conditions).
  const tlGesture = Gesture.Pan()
    .onStart(captureResizeStart)
    .onUpdate((e) => {
      'worklet';
      resizeUpdate(e.translationX, e.translationY, true, true);
    });
  const trGesture = Gesture.Pan()
    .onStart(captureResizeStart)
    .onUpdate((e) => {
      'worklet';
      resizeUpdate(e.translationX, e.translationY, false, true);
    });
  const blGesture = Gesture.Pan()
    .onStart(captureResizeStart)
    .onUpdate((e) => {
      'worklet';
      resizeUpdate(e.translationX, e.translationY, true, false);
    });
  const brGesture = Gesture.Pan()
    .onStart(captureResizeStart)
    .onUpdate((e) => {
      'worklet';
      resizeUpdate(e.translationX, e.translationY, false, false);
    });

  // ---- Animated styles ----
  const rectStyle = useAnimatedStyle(() => ({
    left: left.get(),
    top: top.get(),
    width: boxW.get(),
    height: boxH.get(),
  }));

  // Dim mask: four views covering the image OUTSIDE the rect (top / bottom /
  // left-band / right-band). Derived from the same shared values so the mask
  // tracks the rect live without re-rendering.
  const maskTop = useAnimatedStyle(() => ({ height: top.get() }));
  const maskBottom = useAnimatedStyle(() => ({ top: top.get() + boxH.get() }));
  const maskLeft = useAnimatedStyle(() => ({
    top: top.get(),
    height: boxH.get(),
    width: left.get(),
  }));
  const maskRight = useAnimatedStyle(() => ({
    top: top.get(),
    height: boxH.get(),
    left: left.get() + boxW.get(),
  }));
  const overlayFade = useAnimatedStyle(() => ({ opacity: fade.get() }));

  // Corner handle positions — each centred on its corner of the rect. Declared
  // unconditionally (one useAnimatedStyle per corner).
  const tlHandle = useAnimatedStyle(() => ({ left: left.get() - HANDLE / 2, top: top.get() - HANDLE / 2 }));
  const trHandle = useAnimatedStyle(() => ({
    left: left.get() + boxW.get() - HANDLE / 2,
    top: top.get() - HANDLE / 2,
  }));
  const blHandle = useAnimatedStyle(() => ({
    left: left.get() - HANDLE / 2,
    top: top.get() + boxH.get() - HANDLE / 2,
  }));
  const brHandle = useAnimatedStyle(() => ({
    left: left.get() + boxW.get() - HANDLE / 2,
    top: top.get() + boxH.get() - HANDLE / 2,
  }));

  // Render one corner handle: an absolutely-positioned, gesture-wrapped dot. A
  // plain render function (no hooks inside) so it can be called 4× in JSX while
  // keeping each animated style a directly-typed reference.
  const renderHandle = (
    gesture: ReturnType<typeof Gesture.Pan>,
    handleAnim: typeof tlHandle,
    label: string,
  ): React.JSX.Element => (
    <GestureDetector gesture={gesture}>
      <Animated.View
        hitSlop={HANDLE_HIT_SLOP}
        style={[styles.handle, handleAnim]}
        accessibilityLabel={`Resize ${label} corner`}>
        <View
          style={[styles.handleDot, { backgroundColor: colors.onColor, borderColor: colors.brand }]}
        />
      </Animated.View>
    </GestureDetector>
  );

  // ---- Apply: px → fractions → sanitize ----
  const handleApply = useCallback(() => {
    if (!ready) return;
    const x = left.get() / imgW;
    const y = top.get() / imgH;
    const w = boxW.get() / imgW;
    const h = boxH.get() / imgH;
    const box = sanitizeCoverCropBox({ x, y, w, h, ar: ar ?? imgW / Math.max(imgH, 1) });
    onSave(box);
    onClose();
  }, [ready, left, top, boxW, boxH, imgW, imgH, ar, onSave, onClose]);

  const handleResetFull = useCallback(() => {
    onSave(null);
    onClose();
  }, [onSave, onClose]);

  const dim = colors.overlay;
  const hasImage = imageUrl != null;
  // Aspect for the framed area before the real one is known — keeps layout stable.
  const frameAspect = ar && ar > 0 ? ar : BOOKING_COVER_DEFAULT_ASPECT;

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="92%">
      <View style={styles.header}>
        <Text variant="subheading">Crop cover photo</Text>
      </View>
      <Text variant="caption" tone="muted" style={styles.hint}>
        Drag to move · drag a corner to resize
      </Text>

      <View style={styles.stage}>
        {hasImage ? (
          <View
            onLayout={onContainerLayout}
            style={[
              styles.frame,
              { aspectRatio: frameAspect, borderColor: colors.border },
            ]}>
            <Image
              source={{ uri: imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              onLoad={handleLoad}
              accessibilityIgnoresInvertColors
            />

            {!ready ? (
              <View style={styles.spinner} pointerEvents="none">
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : (
              <Animated.View style={[styles.overlayFill, overlayFade]}>
                {/* Dim mask outside the crop rect (4 slabs). */}
                <Animated.View
                  pointerEvents="none"
                  style={[styles.maskH, { backgroundColor: dim }, maskTop]}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[styles.maskBottom, { backgroundColor: dim }, maskBottom]}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[styles.maskSide, { backgroundColor: dim }, maskLeft]}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[styles.maskSide, { backgroundColor: dim }, maskRight]}
                />

                {/* The crop rectangle — drag its body to move. */}
                <GestureDetector gesture={moveGesture}>
                  <Animated.View
                    style={[styles.rect, { borderColor: colors.onColor }, rectStyle]}
                    accessibilityLabel="Crop area — drag to move">
                    {/* Rule-of-thirds guides for nicer framing. */}
                    <View style={[styles.thirdV, { left: '33.33%', borderColor: colors.onColor }]} />
                    <View style={[styles.thirdV, { left: '66.66%', borderColor: colors.onColor }]} />
                    <View style={[styles.thirdH, { top: '33.33%', borderColor: colors.onColor }]} />
                    <View style={[styles.thirdH, { top: '66.66%', borderColor: colors.onColor }]} />
                  </Animated.View>
                </GestureDetector>

                {/* Corner handles — drag to resize that corner (free aspect).
                    Rendered explicitly (not mapped) so each animated style is a
                    direct, precisely-typed reference. */}
                {renderHandle(tlGesture, tlHandle, 'top-left')}
                {renderHandle(trGesture, trHandle, 'top-right')}
                {renderHandle(blGesture, blHandle, 'bottom-left')}
                {renderHandle(brGesture, brHandle, 'bottom-right')}
              </Animated.View>
            )}
          </View>
        ) : (
          <View style={[styles.placeholder, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text variant="bodySmall" tone="muted">
              No cover photo yet
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button label="Apply" onPress={handleApply} disabled={!hasImage || !ready} style={styles.flex1} />
        </View>
        <Button
          label="Reset to full photo"
          variant="ghost"
          onPress={handleResetFull}
          disabled={!hasImage}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hint: {
    marginTop: spacing.xxs,
  },
  stage: {
    marginTop: spacing.sm,
    justifyContent: 'center',
  },
  frame: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  spinner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Top slab spans full width from y=0; height animated.
  maskH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  // Bottom slab spans full width; `top` animated, stretches to the frame floor.
  maskBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Left/right slabs fill the vertical band of the rect; geometry animated.
  maskSide: {
    position: 'absolute',
    left: 0,
  },
  rect: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  thirdV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    opacity: 0.5,
  },
  thirdH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    opacity: 0.5,
  },
  handle: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleDot: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  placeholder: {
    width: '100%',
    aspectRatio: BOOKING_COVER_DEFAULT_ASPECT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  footer: {
    marginTop: spacing.base,
    gap: spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
});
