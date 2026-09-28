import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, State } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const PAD_HEIGHT = 180;

type Point = { x: number; y: number };

/** Committed strokes + the one currently being drawn. */
type PadInk = { strokes: Point[][]; current: Point[] };

const NO_INK: PadInk = { strokes: [], current: [] };

/** Build an SVG path `d` string from a stroke's points (move + lines). */
export function strokeToPath(points: Point[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  let d = `M ${first!.x.toFixed(1)} ${first!.y.toFixed(1)}`;
  for (const p of rest) d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  // A tap → draw a dot so a quick sign still produces marks. A tap can arrive as
  // several identical points (a move event that did not move), and a
  // zero-length line may not paint its round cap on every renderer.
  const stayedPut = rest.every((p) => p.x === first!.x && p.y === first!.y);
  if (stayedPut) d += ` L ${(first!.x + 0.5).toFixed(1)} ${first!.y.toFixed(1)}`;
  return d;
}

type Props = {
  /**
   * Emits a PNG data URL (`data:image/png;base64,…`) on each completed stroke,
   * or null when cleared. The caller wraps this in `{ method:'drawn', data, signed_at }`.
   */
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/**
 * A draw-with-your-finger signature pad built on react-native-svg +
 * react-native-gesture-handler (both already deps — no new native module). The
 * rendered <Svg> is rasterised to a base64 PNG via react-native-svg's built-in
 * `toDataURL` ref method so the emitted payload matches the server's accepted
 * `data:image/(png|jpeg);base64,…` signature format.
 */
export function SignaturePad({ onChange, disabled, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [ink, setInk] = useState<PadInk>(NO_INK);
  // Points in the touch in progress, counted on the UI thread so the gesture
  // can tell a tap from a touch it lost before it moved (see onFinalize).
  const touchPoints = useSharedValue(0);
  const svgRef = useRef<Svg>(null);

  /**
   * Rasterise the current <Svg> to a PNG and emit a data URL. `toDataURL` is
   * callback-based and returns base64 WITHOUT the data prefix (v15), so we add it
   * back. We wrap it in a Promise so callers can await a settled capture; the
   * rAF defers until the freshly-committed stroke has painted into the view.
   */
  const captureToPng = useCallback((): Promise<string | null> => {
    const node = svgRef.current;
    if (!node || typeof node.toDataURL !== 'function') return Promise.resolve(null);
    return new Promise<string | null>((resolve) => {
      requestAnimationFrame(() => {
        const inner = svgRef.current;
        if (!inner || typeof inner.toDataURL !== 'function') {
          resolve(null);
          return;
        }
        inner.toDataURL((base64) => {
          resolve(base64 ? `data:image/png;base64,${base64}` : null);
        });
      });
    });
  }, []);

  const begin = useCallback((x: number, y: number) => {
    setInk((prev) => ({ ...prev, current: [{ x, y }] }));
  }, []);

  const extend = useCallback((x: number, y: number) => {
    setInk((prev) => ({ ...prev, current: [...prev.current, { x, y }] }));
  }, []);

  const discard = useCallback(() => {
    setInk((prev) => ({ ...prev, current: [] }));
  }, []);

  const commit = useCallback(() => {
    setInk((prev) =>
      prev.current.length > 0 ? { strokes: [...prev.strokes, prev.current], current: [] } : prev,
    );
  }, []);

  // Emit the PNG data URL once each committed stroke has rendered. An effect,
  // not the gesture's callback: the capture reads the Svg ref, which the gesture
  // builder (render-time code) must not reach. `onChange` is an effect event so
  // a parent passing a fresh callback each render never re-emits, and a capture
  // overtaken by the next stroke, or by a switch to "Type name", is dropped.
  const emitDrawing = useEffectEvent((dataUrl: string) => onChange(dataUrl));
  useEffect(() => {
    if (ink.strokes.length === 0) return;
    let live = true;
    void captureToPng().then((dataUrl) => {
      if (live && dataUrl) emitDrawing(dataUrl);
    });
    return () => {
      live = false;
    };
  }, [ink.strokes, captureToPng]);

  const clear = useCallback(() => {
    setInk(NO_INK);
    onChange(null);
  }, [onChange]);

  // Pan gesture is the natural fit for free drawing. minDistance 0 so it
  // activates on the first move, ahead of the sheet's ScrollView (which waits
  // for its touch slop), and holds the touch for the whole stroke: a vertical
  // stroke draws instead of scrolling the sheet. The worklet hops to JS to
  // mutate React state.
  const pan = Gesture.Pan()
    .enabled(!disabled)
    .minDistance(0)
    .onBegin((e) => {
      touchPoints.set(1);
      runOnJS(begin)(e.x, e.y);
    })
    .onUpdate((e) => {
      touchPoints.set(touchPoints.get() + 1);
      runOnJS(extend)(e.x, e.y);
    })
    // Not onEnd: that runs only for a pan that activated, so a tap (which ends
    // FAILED, never having moved) showed its dot but was never emitted, and the
    // next stroke wiped it. A touch CANCELLED before it moved (something else
    // took it) leaves no stray dot; a stroke cancelled part way keeps its ink.
    .onFinalize((e) => {
      const lostBeforeMoving = e.state === State.CANCELLED && touchPoints.get() <= 1;
      touchPoints.set(0);
      if (lostBeforeMoving) {
        runOnJS(discard)();
      } else {
        runOnJS(commit)();
      }
    });

  const allStrokes = ink.current.length > 0 ? [...ink.strokes, ink.current] : ink.strokes;
  const hasInk = allStrokes.some((s) => s.length > 0);

  return (
    <View style={styles.wrap}>
      <GestureDetector gesture={pan}>
        <View
          accessibilityLabel={accessibilityLabel ?? 'Signature pad'}
          accessibilityHint="Draw your signature with your finger"
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={[
            styles.pad,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled ? 0.5 : 1 },
          ]}>
          {width > 0 ? (
            <Svg ref={svgRef} width={width} height={PAD_HEIGHT}>
              {allStrokes.map((s, i) => (
                <Path
                  key={i}
                  d={strokeToPath(s)}
                  fill="none"
                  stroke={colors.text}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </Svg>
          ) : null}
          {!hasInk ? (
            <View pointerEvents="none" style={styles.placeholder}>
              <Text variant="caption" tone="muted">
                Sign here
              </Text>
            </View>
          ) : null}
        </View>
      </GestureDetector>
      <Button
        label="Clear signature"
        variant="ghost"
        size="sm"
        disabled={disabled || !hasInk}
        onPress={clear}
        style={styles.clear}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  pad: {
    height: PAD_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  placeholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clear: {
    alignSelf: 'flex-start',
  },
});
