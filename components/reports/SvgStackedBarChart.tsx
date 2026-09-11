/**
 * SvgStackedBarChart — horizontal stacked bars, one row per period and one
 * segment per series (the web's Revenue tab draws vertical stacked bars; on a
 * phone the rows read better and scroll with the page).
 *
 * - Tap a row to reveal its total and each series' share in a readout.
 * - Theme-aware axis/grid; segment colours are the caller's (one per series).
 * - Responsive width via onLayout; accessible via a label per row.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { G, Line, Rect, Svg, Text as SvgText } from 'react-native-svg';

import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export interface StackedSeries {
  key: string;
  label: string;
  color: string;
}

export interface StackedRow {
  key: string;
  /** Row label shown on the left. */
  label: string;
  /** Fuller label for the readout when the row is selected. */
  fullLabel?: string;
  /** Series key → value. Missing series count as 0. */
  values: Record<string, number>;
  /** Highlight this row (the period holding today). */
  highlighted?: boolean;
}

interface Props {
  rows: StackedRow[];
  series: StackedSeries[];
  /** Formats a value for the readout and the axis. */
  formatValue: (value: number) => string;
  rowHeight?: number;
  labelWidth?: number;
}

const CHART_PADDING_RIGHT = 8;
const BAR_HEIGHT = 12;
const GRID_LINES = 4;

export function SvgStackedBarChart({
  rows,
  series,
  formatValue,
  rowHeight = 28,
  labelWidth = 84,
}: Props) {
  const { colors } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const rowTotal = (row: StackedRow) => series.reduce((sum, s) => sum + (row.values[s.key] ?? 0), 0);
  const max = Math.max(...rows.map(rowTotal), 1);
  const chartWidth = Math.max(0, containerWidth - labelWidth - CHART_PADDING_RIGHT);
  const axisHeight = 18;
  const svgHeight = rows.length * rowHeight + axisHeight;
  const gridXPositions = Array.from({ length: GRID_LINES + 1 }, (_, i) =>
    Math.round((i / GRID_LINES) * chartWidth),
  );
  const selected = rows.find((r) => r.key === selectedKey) ?? null;

  function handleRowPress(key: string) {
    hapticSelect();
    setSelectedKey((prev) => (prev === key ? null : key));
  }

  return (
    <View>
      {selected ? (
        <View
          style={[styles.readout, { backgroundColor: colors.brandSubtle, borderColor: colors.brandBorder }]}>
          <View style={styles.readoutHead}>
            <Text variant="caption" tone="brand" numberOfLines={1} style={styles.readoutLabel}>
              {selected.fullLabel ?? selected.label}
            </Text>
            <Text variant="label" tone="brand" style={styles.tabular}>
              {formatValue(rowTotal(selected))}
            </Text>
          </View>
          {series.length > 1
            ? series
                .filter((s) => (selected.values[s.key] ?? 0) > 0)
                .map((s) => (
                  <View key={s.key} style={styles.readoutRow}>
                    <View style={[styles.swatch, { backgroundColor: s.color }]} />
                    <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.readoutLabel}>
                      {s.label}
                    </Text>
                    <Text variant="caption" tone="secondary" style={styles.tabular}>
                      {formatValue(selected.values[s.key] ?? 0)}
                    </Text>
                  </View>
                ))
            : null}
        </View>
      ) : null}

      <View onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)} style={styles.container}>
        {containerWidth > 0 ? (
          <>
            <View style={{ width: labelWidth }}>
              {rows.map((row) => {
                const isSelected = selectedKey === row.key;
                return (
                  <Pressable
                    key={row.key}
                    onPress={() => handleRowPress(row.key)}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={`${row.fullLabel ?? row.label}: ${formatValue(rowTotal(row))}`}
                    style={[styles.labelRow, { height: rowHeight }]}>
                    <Text
                      variant="bodySmall"
                      numberOfLines={1}
                      style={[
                        styles.tabular,
                        {
                          color: isSelected
                            ? colors.brand
                            : row.highlighted
                              ? colors.text
                              : colors.textSecondary,
                        },
                      ]}>
                      {row.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Svg width={chartWidth + CHART_PADDING_RIGHT} height={svgHeight} style={styles.svg}>
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

              {rows.map((row, idx) => {
                const isSelected = selectedKey === row.key;
                const y = idx * rowHeight + Math.round((rowHeight - BAR_HEIGHT) / 2);
                let cursor = 0;
                return (
                  <G key={row.key}>
                    {row.highlighted ? (
                      <Rect
                        x={0}
                        y={idx * rowHeight}
                        width={chartWidth}
                        height={rowHeight}
                        fill={colors.brand}
                        opacity={0.06}
                      />
                    ) : null}
                    <Rect
                      x={0}
                      y={y}
                      width={chartWidth}
                      height={BAR_HEIGHT}
                      rx={radius.sm}
                      ry={radius.sm}
                      fill={colors.border}
                    />
                    {series.map((s) => {
                      const value = row.values[s.key] ?? 0;
                      const width = Math.round((value / max) * chartWidth);
                      if (width <= 0) return null;
                      const x = cursor;
                      cursor += width;
                      return (
                        <Rect
                          key={s.key}
                          x={x}
                          y={y}
                          width={width}
                          height={BAR_HEIGHT}
                          fill={s.color}
                          opacity={isSelected ? 1 : 0.85}
                        />
                      );
                    })}
                    <Rect
                      x={0}
                      y={idx * rowHeight}
                      width={chartWidth}
                      height={rowHeight}
                      fill="transparent"
                      onPress={() => handleRowPress(row.key)}
                    />
                  </G>
                );
              })}

              {gridXPositions.map((x, i) => (
                <SvgText
                  key={`axis-${i}`}
                  x={x}
                  y={svgHeight - 2}
                  fill={colors.textMuted}
                  fontSize={9}
                  fontFamily={fonts.regular}
                  textAnchor={i === 0 ? 'start' : i === GRID_LINES ? 'end' : 'middle'}>
                  {formatValue(Math.round((i / GRID_LINES) * max))}
                </SvgText>
              ))}
            </Svg>
          </>
        ) : null}
      </View>

      {series.length > 1 ? (
        <View style={styles.legend}>
          {series.map((s) => (
            <View key={s.key} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: s.color }]} />
              <Text variant="caption" tone="secondary" numberOfLines={1}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  labelRow: {
    justifyContent: 'center',
    paddingRight: spacing.sm,
  },
  svg: {
    flex: 1,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  readout: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  readoutHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  readoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  readoutLabel: {
    flex: 1,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: '100%',
  },
});
