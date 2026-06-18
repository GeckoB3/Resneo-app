import { useCallback, useState } from 'react';
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

/**
 * Serialise the captured strokes to a self-contained SVG data URL. The server
 * stores `SignatureResponse.data` as an opaque string (and, for drawn
 * signatures captured via the public form, uploads it to the compliance-files
 * bucket), so an `image/svg+xml` data URL is a valid, dependency-free payload —
 * no native rasterisation module required.
 */
function strokesToDataUrl(strokes: Point[][], width: number): string {
  const w = Math.max(1, Math.round(width));
  const paths = strokes
    .map((s) => strokeToPath(s))
    .filter(Boolean)
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${PAD_HEIGHT}" ` +
    `viewBox="0 0 ${w} ${PAD_HEIGHT}">${paths}</svg>`;
  // encodeURIComponent keeps the URL valid without a base64 dependency.
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

type Props = {
  /** Emits an SVG data URL on each completed stroke, or null when cleared. */
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/**
 * A draw-with-your-finger signature pad built on react-native-svg +
 * react-native-gesture-handler (both already deps — no new native module). The
 * caller wraps the emitted data URL in `{ method:'drawn', data, signed_at }`.
 */
export function SignaturePad({ onChange, disabled, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  // Committed strokes + the one currently being drawn.
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [current, setCurrent] = useState<Point[]>([]);

  const begin = useCallback((x: number, y: number) => {
    setCurrent([{ x, y }]);
  }, []);

  const extend = useCallback((x: number, y: number) => {
    setCurrent((prev) => [...prev, { x, y }]);
  }, []);

  const commit = useCallback(() => {
    setCurrent((pending) => {
      if (pending.length === 0) return [];
      setStrokes((prevStrokes) => {
        const next = [...prevStrokes, pending];
        onChange(strokesToDataUrl(next, width || 1));
        return next;
      });
      return [];
    });
  }, [onChange, width]);

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
            <Svg width={width} height={PAD_HEIGHT}>
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
