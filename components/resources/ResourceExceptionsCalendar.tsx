/**
 * ResourceExceptionsCalendar — month grid that visualises a resource's date
 * exceptions (full-day closures or amended hours) and lets staff tap a day to
 * select it (or a range) for a new exception, or tap a marked day to edit it.
 *
 * Direct mobile port of the web's resource-timeline ResourceExceptionsCalendar:
 * Monday-first 6×7 grid, prev/next month nav, colour-coded cells with a short
 * badge (Off / Hrs), a brand ring for the in-progress range selection, a strong
 * ring for the day being edited, and a legend. Capacity overrides aren't part of
 * the resource exceptions model, so only Closed / Amended hours are shown.
 *
 * @see _reference/Resneo/src/app/dashboard/resource-timeline/ResourceExceptionsCalendar.tsx
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { addMonthsToDateStr, formatMonthLabel } from '@/lib/dates/venue-dates';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ResourceExceptionsMap } from '@/components/resources/ResourceExceptionsEditor';

/** Web parity: Mon-first weekday header labels. */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Cell = { iso: string; day: number; inMonth: boolean };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 6×7 Monday-aligned grid for the month containing `anchor` (YYYY-MM-DD). */
function buildMonthCells(anchor: string): Cell[] {
  const [year, month] = anchor.split('-').map(Number);
  const first = new Date(year!, month! - 1, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const cells: Cell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(year!, month! - 1, 1 - offset + i);
    cells.push({
      iso: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      day: date.getDate(),
      inMonth: date.getMonth() === month! - 1,
    });
  }
  return cells;
}

/**
 * Whether `ymd` falls in the in-progress range selection. A start with no end
 * highlights just that single day (web `isInSelectionRange`).
 */
function isInSelectionRange(ymd: string, start: string | null, end: string | null): boolean {
  if (!start) return false;
  if (!end) return ymd === start;
  const a = start <= end ? start : end;
  const b = start <= end ? end : start;
  return ymd >= a && ymd <= b;
}

type ResourceExceptionsCalendarProps = {
  /** Any date inside the displayed month (YYYY-MM-DD). */
  monthAnchor: string;
  onChangeMonth: (nextAnchor: string) => void;
  exceptions: ResourceExceptionsMap;
  rangeStart: string | null;
  rangeEnd: string | null;
  /** The day currently open in the edit panel (drawn with a strong ring). */
  editingDay: string | null;
  /** Today (YYYY-MM-DD) — drawn with a subtle ring for orientation. */
  today: string;
  onDayClick: (ymd: string) => void;
};

export function ResourceExceptionsCalendar({
  monthAnchor,
  onChangeMonth,
  exceptions,
  rangeStart,
  rangeEnd,
  editingDay,
  today,
  onDayClick,
}: ResourceExceptionsCalendarProps) {
  const { colors } = useTheme();
  const cells = useMemo(() => buildMonthCells(monthAnchor), [monthAnchor]);

  return (
    <View style={[styles.container, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={styles.monthNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => onChangeMonth(addMonthsToDateStr(monthAnchor, -1))}
          hitSlop={8}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Text variant="title" color={colors.brand}>
            ‹
          </Text>
        </Pressable>
        <Text variant="subheading">{formatMonthLabel(monthAnchor)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => onChangeMonth(addMonthsToDateStr(monthAnchor, 1))}
          hitSlop={8}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Text variant="title" color={colors.brand}>
            ›
          </Text>
        </Pressable>
      </View>

      <View style={styles.weekHeader}>
        {WEEKDAYS.map((label, index) => (
          <Text key={index} variant="caption" tone="muted" style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell) => {
          if (!cell.inMonth) {
            return <View key={cell.iso} style={styles.cellWrap} />;
          }
          const ex = exceptions[cell.iso];
          const isClosed = !!ex && 'closed' in ex;
          const isAmended = !!ex && 'periods' in ex;
          const inRange = isInSelectionRange(cell.iso, rangeStart, rangeEnd);
          const isEditing = editingDay === cell.iso;
          const isToday = cell.iso === today;

          const bg = isClosed
            ? colors.dangerSurface
            : isAmended
              ? colors.warningSurface
              : inRange
                ? colors.brandSubtle
                : undefined;
          const fg = isClosed
            ? colors.danger
            : isAmended
              ? colors.warning
              : inRange
                ? colors.brand
                : colors.text;
          // Editing wins (strong neutral ring), then the brand range ring, then a
          // subtle today ring — mirroring the web's slate-900 / brand layering.
          const border = isEditing
            ? { borderColor: colors.text, borderWidth: 2 }
            : inRange
              ? { borderColor: colors.brand, borderWidth: 2 }
              : isToday
                ? { borderColor: colors.brand, borderWidth: 1 }
                : null;
          const badge = isClosed ? 'Off' : isAmended ? 'Hrs' : null;
          const amendedRange =
            ex && 'periods' in ex ? ex.periods[0] : undefined;
          const label = isClosed
            ? 'Closed'
            : amendedRange
              ? `Amended hours ${amendedRange.start}–${amendedRange.end}`
              : inRange
                ? 'Selected for new range'
                : '';

          return (
            <Pressable
              key={cell.iso}
              accessibilityRole="button"
              accessibilityState={{ selected: isEditing || inRange }}
              accessibilityLabel={`${cell.iso}${label ? `. ${label}` : ''}`}
              onPress={() => {
                hapticSelect();
                onDayClick(cell.iso);
              }}
              style={styles.cellWrap}>
              <View style={[styles.cell, bg ? { backgroundColor: bg } : null, border]}>
                <Text variant="bodyMedium" color={fg}>
                  {cell.day}
                </Text>
                {badge ? (
                  <Text color={fg} style={styles.badge}>
                    {badge}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
          <Text variant="caption" tone="muted">
            Closed
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
          <Text variant="caption" tone="muted">
            Amended hours
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendRing, { borderColor: colors.brand }]} />
          <Text variant="caption" tone="muted">
            New range
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekHeader: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cellWrap: {
    width: `${100 / 7}%`,
    aspectRatio: 0.92,
    padding: 2,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    gap: 1,
  },
  badge: {
    fontSize: 10,
    lineHeight: 12,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  legendRing: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    borderWidth: 2,
  },
});
