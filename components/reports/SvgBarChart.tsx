/**
 * SvgBarChart — interactive horizontal bar chart using react-native-svg.
 *
 * Features:
 * - Tap a bar to reveal its value in a selected-state readout / tooltip.
 * - Theme-aware (axis/grid use colors.border/textMuted; bars use caller-supplied color).
 * - Responsive width via onLayout.
 * - Accessible via accessibilityLabel on each bar.
 * - Light + dark both correct (no hardcoded hex).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { G, Line, Rect, Svg, Text as SvgText } from 'react-native-svg';

import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface BarDatum {
  /** Row label shown on the left. */
  label: string;
  /** Numeric value for this bar. */
  value: number;
  /** Optional secondary value shown in tooltip (e.g. rate of a sub-metric). */
  subValue?: string;
  /** Unique key; falls back to label if omitted. */
  key?: string;
}

export interface SvgBarChartProps {
  data: BarDatum[];
  /** Bar fill colour (from theme colors). */
  color: string;
  /** Override max value; defaults to max(data[].value). */
  maxValue?: number;
  /** Format function for the readout when a bar is selected. */
  formatValue?: (value: number) => string;
  /** Height of each bar row in px (default 28). */
  rowHeight?: number;
  /** Width of the label column in px (default 100). */
  labelWidth?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const CHART_PADDING_RIGHT = 8;
const BAR_RADIUS = 4;
const GRID_LINES = 4;

// ─── Component ───────────────────────────────────────────────────────────────
export function SvgBarChart({
  data,
  color,
  maxValue,
  formatValue,
  rowHeight = 28,
  labelWidth = 100,
}: SvgBarChartProps) {
  const { colors } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const max = maxValue ?? Math.max(...data.map((d) => d.value), 1);
  const fmt = formatValue ?? ((v: number) => String(v));

  // Chart draw area (excludes label column)
  const chartWidth = Math.max(0, containerWidth - labelWidth - CHART_PADDING_RIGHT);

  // Total SVG height: rows + a small value axis at bottom
  const axisHeight = 18;
  const svgHeight = data.length * rowHeight + axisHeight;

  // Grid line x-positions
  const gridXPositions = Array.from({ length: GRID_LINES + 1 }, (_, i) =>
    Math.round((i / GRID_LINES) * chartWidth),
  );

  const selectedDatum = data.find((d) => (d.key ?? d.label) === selectedKey);

  function handleBarPress(key: string) {
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
            {selectedDatum.subValue ? (
              <Text variant="caption" tone="muted">
                {' '}
                {selectedDatum.subValue}
              </Text>
            ) : null}
          </Text>
        </View>
      ) : null}

      <View
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        style={styles.container}>
        {containerWidth > 0 ? (
          <>
            {/* Labels column */}
            <View style={[styles.labelsCol, { width: labelWidth }]}>
              {data.map((d) => {
                const key = d.key ?? d.label;
                const isSelected = selectedKey === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => handleBarPress(key)}
                    hitSlop={4}
                    style={[styles.labelRow, { height: rowHeight }]}>
                    <Text
                      variant="bodySmall"
                      numberOfLines={1}
                      style={[
                        styles.labelText,
                        { color: isSelected ? colors.brand : colors.textSecondary },
                      ]}>
                      {d.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* SVG chart area */}
            <Svg
              width={chartWidth + CHART_PADDING_RIGHT}
              height={svgHeight}
              style={styles.svg}>
              {/* Grid lines */}
              {gridXPositions.map((x, i) => (
                <Line
                  key={`grid-${i}`}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={svgHeight - axisHeight}
                  stroke={colors.border}
                  strokeWidth={1}
                  strokeDasharray={i === 0 ? undefined : '2,3'}
                />
              ))}

              {/* Bars */}
              {data.map((d, idx) => {
                const key = d.key ?? d.label;
                const isSelected = selectedKey === key;
                const pct = max > 0 ? Math.max(0, Math.min(1, d.value / max)) : 0;
                const barWidth = Math.max(0, Math.round(pct * chartWidth));
                const y = idx * rowHeight + Math.round((rowHeight - 12) / 2);
                const barHeight = 12;

                return (
                  <G key={key}>
                    {/* Track (background) */}
                    <Rect
                      x={0}
                      y={y}
                      width={chartWidth}
                      height={barHeight}
                      rx={BAR_RADIUS}
                      ry={BAR_RADIUS}
                      fill={colors.border}
                    />
                    {/* Fill */}
                    {barWidth > 0 ? (
                      <Rect
                        x={0}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        rx={BAR_RADIUS}
                        ry={BAR_RADIUS}
                        fill={isSelected ? colors.brandPressed : color}
                        opacity={isSelected ? 1 : 0.85}
                      />
                    ) : null}
                    {/* Tap target (invisible full-row rect) */}
                    <Rect
                      x={0}
                      y={idx * rowHeight}
                      width={chartWidth}
                      height={rowHeight}
                      fill="transparent"
                      onPress={() => handleBarPress(key)}
                      accessibilityLabel={`${d.label}: ${fmt(d.value)}`}
                    />
                    {/* Value label shown when selected */}
                    {isSelected && barWidth > 0 ? (
                      <SvgText
                        x={Math.min(barWidth + 4, chartWidth - 4)}
                        y={y + barHeight / 2 + 4}
                        fill={colors.brand}
                        fontSize={10}
                        fontFamily={fonts.semibold}
                        textAnchor="start">
                        {fmt(d.value)}
                      </SvgText>
                    ) : null}
                  </G>
                );
              })}

              {/* X-axis value labels */}
              {gridXPositions.map((x, i) => {
                const val = Math.round((i / GRID_LINES) * max);
                return (
                  <SvgText
                    key={`axis-${i}`}
                    x={x}
                    y={svgHeight - 2}
                    fill={colors.textMuted}
                    fontSize={9}
                    fontFamily={fonts.regular}
                    textAnchor={i === 0 ? 'start' : i === GRID_LINES ? 'end' : 'middle'}>
                    {fmt(val)}
                  </SvgText>
                );
              })}
            </Svg>
          </>
        ) : null}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  labelsCol: {
    flexShrink: 0,
  },
  labelRow: {
    justifyContent: 'center',
    paddingRight: spacing.sm,
  },
  labelText: {
    fontVariant: ['tabular-nums'],
  },
  svg: {
    flex: 1,
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
