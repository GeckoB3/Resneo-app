/**
 * SvgLineChart — interactive line/area chart using react-native-svg.
 *
 * Designed for time-series data (e.g. no-show rate trend, daily series).
 *
 * Features:
 * - Tap a data point to reveal its value (selected-state readout + enlarged dot).
 * - Filled area under the line for visual weight.
 * - Axis labels (x: date labels; y: value labels).
 * - Theme-aware: axis/grid use colors.border/textMuted; line uses caller-supplied color.
 * - Responsive width via onLayout.
 * - Light + dark both correct.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Svg, Text as SvgText } from 'react-native-svg';

import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface LineDatum {
  /** X-axis label (short, e.g. "06-01"). */
  label: string;
  /** Numeric Y value. */
  value: number;
  /** Unique key; defaults to label. */
  key?: string;
}

export interface SvgLineChartProps {
  data: LineDatum[];
  /** Line/dot colour (from theme colors). */
  color: string;
  /** Optional secondary threshold line (e.g. 10% no-show warning). */
  thresholdValue?: number;
  /** Threshold line colour. */
  thresholdColor?: string;
  /** Override max Y value; defaults to max(data[].value) with 10% headroom. */
  maxValue?: number;
  /** Format function for point values in readout. */
  formatValue?: (value: number) => string;
  /** Chart height in px (default 160). */
  chartHeight?: number;
  /** How many x-axis labels to show (default: up to 7, auto-thinned). */
  maxXLabels?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const PADDING_LEFT = 32; // y-axis label space
const PADDING_RIGHT = 8;
const PADDING_TOP = 8;
const X_AXIS_HEIGHT = 18;
const DOT_RADIUS = 4;
const DOT_RADIUS_SELECTED = 6;
const Y_GRID_LINES = 4;
const TOUCH_AREA_WIDTH = 32; // invisible tap zone around each point

// ─── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Build a smooth (mid-point cubic) SVG path through the given points. Exported so
 * the compact `MiniSparkline` (StatTile) can reuse the exact same curve drawing
 * without duplicating it — read-only reuse, behaviour unchanged for this chart.
 */
export function buildLinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;

  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpX = (prev.x + curr.x) / 2;
    d += ` C${cpX},${prev.y} ${cpX},${curr.y} ${curr.x},${curr.y}`;
  }
  return d;
}

/** Close a line path down to `chartBottom` to form a fillable area. Exported for MiniSparkline reuse. */
export function buildAreaPath(
  points: { x: number; y: number }[],
  chartBottom: number,
): string {
  if (points.length === 0) return '';
  const line = buildLinePath(points);
  return `${line} L${points[points.length - 1].x},${chartBottom} L${points[0].x},${chartBottom} Z`;
}

// ─── Component ───────────────────────────────────────────────────────────────
export function SvgLineChart({
  data,
  color,
  thresholdValue,
  thresholdColor,
  maxValue,
  formatValue,
  chartHeight = 160,
  maxXLabels = 7,
}: SvgLineChartProps) {
  const { colors } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const fmt = formatValue ?? ((v: number) => String(v));

  if (data.length === 0) return null;

  const rawMax = Math.max(...data.map((d) => d.value), thresholdValue ?? 0, 1);
  // Add 10% headroom so top point doesn't clip
  const max = maxValue ?? rawMax * 1.1;

  const drawWidth = Math.max(0, containerWidth - PADDING_LEFT - PADDING_RIGHT);
  const drawHeight = chartHeight - PADDING_TOP - X_AXIS_HEIGHT;
  const svgHeight = chartHeight;
  const chartBottom = PADDING_TOP + drawHeight;

  // Map data to pixel coords
  const points = data.map((d, i) => ({
    x: PADDING_LEFT + (data.length === 1 ? drawWidth / 2 : (i / (data.length - 1)) * drawWidth),
    y: PADDING_TOP + drawHeight - Math.max(0, Math.min(1, d.value / max)) * drawHeight,
    datum: d,
    key: d.key ?? d.label,
  }));

  // Y grid lines
  const yGridPositions = Array.from({ length: Y_GRID_LINES + 1 }, (_, i) => {
    const pct = i / Y_GRID_LINES;
    return {
      y: PADDING_TOP + drawHeight * (1 - pct),
      value: max * pct,
    };
  });

  // X-axis label thinning
  const step = Math.max(1, Math.ceil(data.length / maxXLabels));
  const xLabelIndices = new Set<number>();
  for (let i = 0; i < data.length; i += step) xLabelIndices.add(i);
  xLabelIndices.add(data.length - 1);

  // Threshold y-position
  const thresholdY =
    thresholdValue != null
      ? PADDING_TOP + drawHeight - Math.max(0, Math.min(1, thresholdValue / max)) * drawHeight
      : null;

  const linePath = buildLinePath(points);
  const areaPath = buildAreaPath(points, chartBottom);

  const selectedPoint = points.find((p) => p.key === selectedKey);
  const selectedDatum = selectedPoint?.datum;

  function handlePointPress(key: string) {
    hapticSelect();
    setSelectedKey((prev) => (prev === key ? null : key));
  }

  return (
    <View>
      {/* Selected value readout */}
      {selectedDatum ? (
        <View
          style={[
            styles.readout,
            { backgroundColor: colors.brandSubtle, borderColor: colors.brandBorder },
          ]}>
          <Text variant="caption" tone="brand" style={styles.readoutLabel} numberOfLines={1}>
            {selectedDatum.label}
          </Text>
          <Text variant="label" tone="brand" style={styles.readoutValue}>
            {fmt(selectedDatum.value)}
          </Text>
        </View>
      ) : null}

      <View
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        style={styles.container}>
        {containerWidth > 0 ? (
          <Svg width={containerWidth} height={svgHeight}>
            <Defs>
              <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity="0.25" />
                <Stop offset="1" stopColor={color} stopOpacity="0.02" />
              </LinearGradient>
            </Defs>

            {/* Y-axis grid lines + labels */}
            {yGridPositions.map((row, i) => (
              <G key={`ygrid-${i}`}>
                <Line
                  x1={PADDING_LEFT}
                  y1={row.y}
                  x2={PADDING_LEFT + drawWidth}
                  y2={row.y}
                  stroke={colors.border}
                  strokeWidth={1}
                  strokeDasharray={i === 0 ? undefined : '2,3'}
                />
                <SvgText
                  x={PADDING_LEFT - 4}
                  y={row.y + 4}
                  fill={colors.textMuted}
                  fontSize={9}
                  fontFamily={fonts.regular}
                  textAnchor="end">
                  {fmt(Math.round(row.value))}
                </SvgText>
              </G>
            ))}

            {/* Threshold line */}
            {thresholdY != null ? (
              <G>
                <Line
                  x1={PADDING_LEFT}
                  y1={thresholdY}
                  x2={PADDING_LEFT + drawWidth}
                  y2={thresholdY}
                  stroke={thresholdColor ?? colors.danger}
                  strokeWidth={1.5}
                  strokeDasharray="4,3"
                />
                <SvgText
                  x={PADDING_LEFT + drawWidth - 2}
                  y={thresholdY - 3}
                  fill={thresholdColor ?? colors.danger}
                  fontSize={9}
                  fontFamily={fonts.semibold}
                  textAnchor="end">
                  {fmt(thresholdValue!)}
                </SvgText>
              </G>
            ) : null}

            {/* Area fill */}
            {areaPath ? (
              <Path d={areaPath} fill="url(#areaGrad)" />
            ) : null}

            {/* Line */}
            {linePath ? (
              <Path
                d={linePath}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {/* Data points + invisible tap targets */}
            {points.map((pt) => {
              const isSelected = pt.key === selectedKey;
              return (
                <G key={pt.key}>
                  {/* Dot */}
                  <Circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected ? DOT_RADIUS_SELECTED : DOT_RADIUS}
                    fill={isSelected ? colors.brand : colors.surfaceRaised}
                    stroke={color}
                    strokeWidth={2}
                  />
                  {/* Invisible wide tap target */}
                  <Rect
                    x={pt.x - TOUCH_AREA_WIDTH / 2}
                    y={PADDING_TOP}
                    width={TOUCH_AREA_WIDTH}
                    height={drawHeight}
                    fill="transparent"
                    onPress={() => handlePointPress(pt.key)}
                    accessibilityLabel={`${pt.datum.label}: ${fmt(pt.datum.value)}`}
                  />
                  {/* Tooltip above selected dot */}
                  {isSelected ? (
                    <G>
                      {/* Bubble */}
                      <Rect
                        x={pt.x - 22}
                        y={pt.y - 22}
                        width={44}
                        height={16}
                        rx={4}
                        ry={4}
                        fill={colors.brand}
                      />
                      <SvgText
                        x={pt.x}
                        y={pt.y - 10}
                        fill={colors.onBrand}
                        fontSize={10}
                        fontFamily={fonts.semibold}
                        textAnchor="middle">
                        {fmt(pt.datum.value)}
                      </SvgText>
                    </G>
                  ) : null}
                </G>
              );
            })}

            {/* X-axis labels */}
            {points.map((pt, i) =>
              xLabelIndices.has(i) ? (
                <SvgText
                  key={`xlabel-${pt.key}`}
                  x={pt.x}
                  y={svgHeight - 2}
                  fill={colors.textMuted}
                  fontSize={9}
                  fontFamily={fonts.regular}
                  textAnchor="middle">
                  {pt.datum.label}
                </SvgText>
              ) : null,
            )}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  readout: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  readoutLabel: {
    flex: 1,
  },
  readoutValue: {
    fontVariant: ['tabular-nums'],
  },
});
