import { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Defs, LinearGradient, Path, Stop, Svg } from 'react-native-svg';

import { buildAreaPath, buildLinePath } from '@/components/reports/SvgLineChart';
import { useTheme } from '@/theme/useTheme';

type MiniSparklineProps = {
  /** Series of numeric values, oldest → newest. */
  data: number[];
  /** Line/fill colour; defaults to the brand colour. */
  color?: string;
  /** Drawing height in px (default 36). */
  height?: number;
  /** Explicit width; if omitted the chart measures its container via onLayout. */
  width?: number;
  /** Stroke width (default 2). */
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

const PAD_Y = 3; // vertical breathing room so the stroke isn't clipped

/**
 * MiniSparkline — a compact, axis-less trend line for KPI tiles. Reuses the exact
 * smooth-curve drawing logic from `SvgLineChart` (`buildLinePath`/`buildAreaPath`)
 * with a soft area fill, but drops the axes, grid, labels and touch targets so it
 * reads as inline chrome inside a `StatTile`.
 */
export function MiniSparkline({
  data,
  color,
  height = 36,
  width,
  strokeWidth = 2,
  style,
}: MiniSparklineProps) {
  const { colors } = useTheme();
  const stroke = color ?? colors.brand;
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const w = width ?? measuredWidth;

  // Need at least two points and a known width to draw a line.
  const drawable = data.length >= 2 && w > 0;

  let linePath = '';
  let areaPath = '';
  if (drawable) {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1; // flat series → centre the line
    const drawH = height - PAD_Y * 2;
    const points = data.map((value, i) => ({
      x: (i / (data.length - 1)) * w,
      // Invert: higher value → smaller y (closer to top).
      y: PAD_Y + drawH - ((value - min) / range) * drawH,
    }));
    linePath = buildLinePath(points);
    areaPath = buildAreaPath(points, height);
  }

  const gradId = 'miniSparkGrad';

  return (
    <View
      onLayout={width == null ? (e) => setMeasuredWidth(e.nativeEvent.layout.width) : undefined}
      style={[{ width: width ?? '100%', height }, style]}>
      {drawable ? (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity="0.22" />
              <Stop offset="1" stopColor={stroke} stopOpacity="0.02" />
            </LinearGradient>
          </Defs>
          {areaPath ? <Path d={areaPath} fill={`url(#${gradId})`} /> : null}
          {linePath ? (
            <Path
              d={linePath}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}
