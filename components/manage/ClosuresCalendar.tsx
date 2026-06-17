/**
 * ClosuresCalendar — month grid that visualises availability blocks (closures,
 * amended hours, capacity, special events) and lets an admin tap a date to add a
 * closure or tap an existing block to edit it. Mirrors the web's
 * BusinessClosuresSection calendar picker.
 *
 *  - Each day is colour-coded by the highest-priority block covering it, with a
 *    short badge (Off / Hrs / Cap / Event).
 *  - Tap an empty day → select it; tap a second day → select a range (the parent
 *    turns the selection into a new block). Tap a day that has a block → edit it.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { addMonthsToDateStr, formatMonthLabel } from '@/lib/dates/venue-dates';
import { hapticSelect } from '@/lib/haptics';
import type { AvailabilityBlock, BlockType } from '@/lib/queries/useAvailabilityBlocks';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** When several blocks cover a day, the highest priority wins its colour/badge. */
const TYPE_PRIORITY: Record<BlockType, number> = {
  closed: 3,
  special_event: 3,
  amended_hours: 2,
  reduced_capacity: 1,
};

const TYPE_BADGE: Record<BlockType, string> = {
  closed: 'Off',
  special_event: 'Event',
  amended_hours: 'Hrs',
  reduced_capacity: 'Cap',
};

const TYPE_LABEL: Record<BlockType, string> = {
  closed: 'Closed',
  special_event: 'Special event',
  amended_hours: 'Amended hours',
  reduced_capacity: 'Reduced capacity',
};

// Theme colour keys per block type (same mapping the list badges use).
const TYPE_BG_KEY: Record<BlockType, string> = {
  closed: 'dangerSurface',
  special_event: 'infoSurface',
  amended_hours: 'warningSurface',
  reduced_capacity: 'accentSubtle',
};
const TYPE_FG_KEY: Record<BlockType, string> = {
  closed: 'danger',
  special_event: 'brand',
  amended_hours: 'warning',
  reduced_capacity: 'accent',
};

type Cell = { iso: string; day: number; inMonth: boolean };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 6×7 Monday-aligned grid for the month containing `anchor`. */
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

function inRange(iso: string, start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  return iso >= start && iso <= end;
}

type ClosuresCalendarProps = {
  blocks: AvailabilityBlock[];
  /** Any date inside the displayed month (YYYY-MM-DD). */
  monthAnchor: string;
  onChangeMonth: (nextAnchor: string) => void;
  today: string;
  selectedStart: string | null;
  selectedEnd: string | null;
  /** Tapped an empty day (no block) — parent handles select/range. */
  onSelectDay: (iso: string) => void;
  /** Tapped a day that already has a block — parent opens it for edit. */
  onSelectBlock: (block: AvailabilityBlock) => void;
  isAdmin: boolean;
};

export function ClosuresCalendar({
  blocks,
  monthAnchor,
  onChangeMonth,
  today,
  selectedStart,
  selectedEnd,
  onSelectDay,
  onSelectBlock,
  isAdmin,
}: ClosuresCalendarProps) {
  const { colors } = useTheme();
  const themeColors = colors as unknown as Record<string, string>;
  const cells = useMemo(() => buildMonthCells(monthAnchor), [monthAnchor]);

  // date → highest-priority block covering it (visible month only).
  const blockByDate = useMemo(() => {
    const map = new Map<string, AvailabilityBlock>();
    for (const cell of cells) {
      if (!cell.inMonth) continue;
      let best: AvailabilityBlock | null = null;
      for (const b of blocks) {
        if (cell.iso >= b.date_start && cell.iso <= b.date_end) {
          if (!best || TYPE_PRIORITY[b.block_type] > TYPE_PRIORITY[best.block_type]) best = b;
        }
      }
      if (best) map.set(cell.iso, best);
    }
    return map;
  }, [cells, blocks]);

  // Distinct block types present anywhere — drives the legend.
  const legendTypes = useMemo(() => {
    const order: BlockType[] = ['closed', 'amended_hours', 'reduced_capacity', 'special_event'];
    const present = new Set(blocks.map((b) => b.block_type));
    return order.filter((t) => present.has(t));
  }, [blocks]);

  const currentMonth = monthAnchor.slice(0, 7);
  const canGoBack = currentMonth > today.slice(0, 7);

  return (
    <View style={styles.container}>
      <View style={styles.monthNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          disabled={!canGoBack}
          onPress={() => onChangeMonth(addMonthsToDateStr(monthAnchor, -1))}
          style={({ pressed }) => [styles.navBtn, { opacity: !canGoBack ? 0.3 : pressed ? 0.6 : 1 }]}>
          <Text variant="title" color={colors.brand}>
            ‹
          </Text>
        </Pressable>
        <Text variant="subheading">{formatMonthLabel(monthAnchor)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => onChangeMonth(addMonthsToDateStr(monthAnchor, 1))}
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
          const block = cell.inMonth ? blockByDate.get(cell.iso) : undefined;
          const isToday = cell.iso === today;
          const selected = cell.inMonth && inRange(cell.iso, selectedStart, selectedEnd);
          const bg = selected
            ? colors.brandSubtle
            : block
              ? themeColors[TYPE_BG_KEY[block.block_type]]
              : undefined;
          const fg = !cell.inMonth
            ? colors.textMuted
            : selected
              ? colors.brand
              : block
                ? themeColors[TYPE_FG_KEY[block.block_type]]
                : colors.text;
          const borderColor = selected ? colors.brand : isToday ? colors.brand : undefined;
          return (
            <Pressable
              key={cell.iso}
              accessibilityRole="button"
              accessibilityLabel={`${cell.iso}${block ? `, ${TYPE_LABEL[block.block_type]}` : ''}`}
              disabled={!cell.inMonth || !isAdmin}
              onPress={() => {
                hapticSelect();
                if (block) onSelectBlock(block);
                else onSelectDay(cell.iso);
              }}
              style={styles.cellWrap}>
              <View
                style={[
                  styles.cell,
                  bg ? { backgroundColor: bg } : null,
                  borderColor ? { borderColor, borderWidth: selected ? 2 : 1 } : null,
                ]}>
                <Text
                  variant="bodyMedium"
                  color={fg}
                  style={!cell.inMonth ? styles.outsideMonth : undefined}>
                  {cell.day}
                </Text>
                {block ? (
                  <Text color={fg} style={styles.badge}>
                    {TYPE_BADGE[block.block_type]}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {legendTypes.length > 0 ? (
        <View style={styles.legend}>
          {legendTypes.map((t) => (
            <View key={t} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: themeColors[TYPE_FG_KEY[t]] }]} />
              <Text variant="caption" tone="muted">
                {TYPE_LABEL[t]}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text variant="caption" tone="muted" style={styles.hint}>
          {isAdmin ? 'Tap a date to add a closure.' : 'No closures scheduled.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
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
  outsideMonth: {
    opacity: 0.35,
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
  hint: {
    textAlign: 'center',
    paddingTop: spacing.xs,
  },
});
