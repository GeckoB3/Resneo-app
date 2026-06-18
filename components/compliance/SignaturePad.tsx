import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const PAD_HEIGHT = 180;

type Point = { x: number; y: number };

/** Build an SVG path `d` string from a stroke's points (move + lines). */
function strokeToPath(points: Point[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  let d = `M ${first!.x.toFixed(1)} ${first!.y.toFixed(1)}`;
  for (const p of rest) d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  // A single tap → draw a dot so a quick sign still produces marks.
  if (rest.length === 0) d += ` L ${(first!.x + 0.5).toFixed(1)} ${first!.y.toFixed(1)}`;
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
  // Committed strokes + the one currently being drawn.
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [current, setCurrent] = useState<Point[]>([]);
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
    setCurrent([{ x, y }]);
  }, []);

  const extend = useCallback((x: number, y: number) => {
    setCurrent((prev) => [...prev, { x, y }]);
  }, []);

  const commit = useCallback(() => {
    setCurrent((pending) => {
      if (pending.length === 0) return [];
      setStrokes((prevStrokes) => [...prevStrokes, pending]);
      // Capture after the new stroke has painted; emit the PNG data URL.
      void captureToPng().then((dataUrl) => {
        if (dataUrl) onChange(dataUrl);
      });
      return [];
    });
  }, [captureToPng, onChange]);

  const clear = useCallback(() => {
    setStrokes([]);
    setCurrent([]);
    onChange(null);
  }, [onChange]);

  // Pan gesture is the natural fit for free drawing. minDistance 0 so a tap
  // registers; the worklet hops to JS to mutate React state.
  const pan = Gesture.Pan()
    .enabled(!disabled)
    .minDistance(0)
    .onBegin((e) => {
      runOnJS(begin)(e.x, e.y);
    })
    .onUpdate((e) => {
      runOnJS(extend)(e.x, e.y);
    })
    .onEnd(() => {
      runOnJS(commit)();
    });

  const allStrokes = current.length > 0 ? [...strokes, current] : strokes;
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
