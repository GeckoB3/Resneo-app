import { addDays, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { KIND_ACCENT } from '@/lib/calendar/schedule-block-view';
import { hexToRgba } from '@/lib/color';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Per-type booking/schedule counts for one calendar date, plus the venue's
 * open/closed state. Drives the month cell's dots, heatmap intensity, total
 * badge and Open/Closed label (web parity with `MonthScheduleGrid`).
 */
export type MonthDayDatum = {
  /** Appointment bookings (calendar-grid), No-Show excluded. */
  appointments: number;
  /** Class-session blocks (schedule feed). */
  classes: number;
  /** Ticketed-event blocks (schedule feed). */
  events: number;
  /** Resource-booking blocks (schedule feed). */
  resources: number;
  /** Linked-venue bookings for the date (folded in as a "+N" chip). */
  linked: number;
  /**
   * Open/closed status from the venue's weekly hours. 'unknown' renders no
   * label (no opening-hours data); 'open'/'closed' show only on EMPTY days so a
   * busy day's count isn't crowded.
   */
  status: 'open' | 'closed' | 'unknown';
};

const EMPTY_DATUM: MonthDayDatum = {
  appointments: 0,
  classes: 0,
  events: 0,
  resources: 0,
  linked: 0,
  status: 'unknown',
};

/** Own-venue total (appointments + classes + events + resources); linked is separate. */
export function monthDatumTotal(d: MonthDayDatum): number {
  return d.appointments + d.classes + d.events + d.resources;
}

/** A single colored dot in the cell, ordered appointments → classes → events → resources. */
type DotSpec = { key: string; color: string; count: number };

/** Build up to four type-colored dots for a day, dropping zero-count types. */
export function monthDayDots(d: MonthDayDatum, brandColor: string): DotSpec[] {
  const specs: DotSpec[] = [
    { key: 'appointments', color: brandColor, count: d.appointments },
    { key: 'classes', color: KIND_ACCENT.class_session, count: d.classes },
    { key: 'events', color: KIND_ACCENT.event_ticket, count: d.events },
    { key: 'resources', color: KIND_ACCENT.resource_booking, count: d.resources },
  ];
  return specs.filter((s) => s.count > 0);
}

type MonthGridProps = {
  /** Any date within the month to display (YYYY-MM-DD). */
  anchor: string;
  today: string;
  /**
   * date → per-type counts + open/closed status. Preferred over the legacy
   * flat `counts` map; when both are passed `dayData` wins.
   */
  dayData?: Record<string, MonthDayDatum>;
  /**
   * Legacy: date → total booking count. Still accepted (the month-picker sheet
   * passes it) and rendered as an appointments-only cell when `dayData` is absent.
   */
  counts?: Record<string, number>;
  onSelectDay: (date: string) => void;
};

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Month overview — 6×7 grid. Each day shows per-type colored dots, an intensity
 * heatmap tint scaled to the busiest day, a total badge, an Open/Closed label on
 * empty days, and a linked "+N" chip. Tap a day to drill into its Day view.
 *
 * Falls back to a simple appointment-count cell when only the legacy flat
 * `counts` map is supplied (the date-jump month-picker sheet), so that surface
 * is unaffected.
 */
export function MonthGrid({ anchor, today, dayData, counts, onSelectDay }: MonthGridProps) {
  const { colors } = useTheme();
  const monthDate = parseISO(`${anchor}T12:00:00.000Z`);
  const gridStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
  // Plain build (cheap, 42 cells) — a manual useMemo on the unstable `gridStart`
  // Date dep can't be preserved by the React compiler and adds no value here.
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  // Resolve the per-day datum for a date — from the rich map, or synthesised
  // from the legacy flat counts (appointments only), or empty.
  const datumFor = (dateStr: string): MonthDayDatum => {
    if (dayData) return dayData[dateStr] ?? EMPTY_DATUM;
    if (counts) {
      const n = counts[dateStr] ?? 0;
      return n > 0 ? { ...EMPTY_DATUM, appointments: n } : EMPTY_DATUM;
    }
    return EMPTY_DATUM;
  };

  // Busiest own-venue day in the WHOLE map → heatmap denominator (web scales the
  // intensity to the busiest day, not just the visible grid, so colours are
  // comparable across months). Linked counts are excluded from the scale.
  const maxTotal = useMemo(() => {
    if (!dayData) {
      if (!counts) return 0;
      return Object.values(counts).reduce((m, n) => Math.max(m, n), 0);
    }
    let m = 0;
    for (const d of Object.values(dayData)) m = Math.max(m, monthDatumTotal(d));
    return m;
  }, [dayData, counts]);

  return (
    <View style={styles.container}>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <View key={label} style={styles.weekdayCell}>
            <Text variant="caption" tone="muted">
              {label}
            </Text>
          </View>
        ))}
      </View>

      {Array.from({ length: 6 }, (_, week) => (
        <View key={week} style={styles.weekRow}>
          {cells.slice(week * 7, week * 7 + 7).map((cell) => {
            const dateStr = format(cell, 'yyyy-MM-dd');
            const inMonth = isSameMonth(cell, monthDate);
            const isToday = dateStr === today;
            const datum = datumFor(dateStr);
            const total = monthDatumTotal(datum);
            const dots = monthDayDots(datum, colors.brand);

            // Heatmap tint (web parity: rgba 0.08 + intensity*0.22). Only own
            // days in the displayed month tint; padding days stay plain.
            const intensity = maxTotal > 0 ? total / maxTotal : 0;
            const heatAlpha = total > 0 ? 0.08 + intensity * 0.22 : 0;
            const heatBg =
              inMonth && heatAlpha > 0 ? hexToRgba(colors.brand, heatAlpha) : undefined;

            // Open/Closed label only on EMPTY in-month days (a busy day shows its
            // dots/count instead). Unknown status renders nothing.
            const showStatusLabel = inMonth && total === 0 && datum.status !== 'unknown';

            const a11y = buildA11yLabel(cell, datum, total);

            return (
              <Pressable
                key={dateStr}
                onPress={() => onSelectDay(dateStr)}
                accessibilityRole="button"
                accessibilityLabel={a11y}
                style={({ pressed }) => [
                  styles.dayCell,
                  { borderColor: colors.border },
                  heatBg ? { backgroundColor: heatBg } : null,
                  isToday ? { backgroundColor: colors.brandSubtle } : null,
                  pressed ? { opacity: 0.55 } : null,
                ]}>
                <View style={styles.dayTopRow}>
                  <Text
                    variant="bodySmall"
                    color={inMonth ? (isToday ? colors.brand : colors.text) : colors.textMuted}>
                    {format(cell, 'd')}
                  </Text>
                  {/* Linked "+N" chip — cross-venue bookings on this date. */}
                  {datum.linked > 0 ? (
                    <View style={[styles.linkedChip, { backgroundColor: hexToRgba(colors.warning, 0.16) }]}>
                      <Text variant="caption" color={colors.warning} style={styles.linkedChipText}>
                        +{datum.linked}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Type dots — up to four, colored by type. */}
                {dots.length > 0 ? (
                  <View style={styles.dotsRow}>
                    {dots.map((dot) => (
                      <View
                        key={dot.key}
                        style={[styles.dot, { backgroundColor: dot.color }]}
                      />
                    ))}
                  </View>
                ) : showStatusLabel ? (
                  <Text
                    variant="caption"
                    color={datum.status === 'open' ? colors.success : colors.textMuted}
                    style={styles.statusLabel}>
                    {datum.status === 'open' ? 'Open' : 'Closed'}
                  </Text>
                ) : (
                  <View style={styles.rowSpacer} />
                )}

                {/* Total badge — own-venue total across all types. */}
                {total > 0 ? (
                  <View style={[styles.countPill, { backgroundColor: colors.brand }]}>
                    <Text variant="caption" color={colors.onBrand}>
                      {total}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.countSpacer} />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** A screen-reader summary of a day's load. */
function buildA11yLabel(cell: Date, datum: MonthDayDatum, total: number): string {
  const date = format(cell, 'd MMMM');
  if (total === 0) {
    const status =
      datum.status === 'closed' ? ', closed' : datum.status === 'open' ? ', open, no bookings' : '';
    const linked = datum.linked > 0 ? `, ${datum.linked} linked` : '';
    return `${date}${status}${linked}`;
  }
  const parts: string[] = [];
  if (datum.appointments) parts.push(`${datum.appointments} appointments`);
  if (datum.classes) parts.push(`${datum.classes} classes`);
  if (datum.events) parts.push(`${datum.events} events`);
  if (datum.resources) parts.push(`${datum.resources} resources`);
  if (datum.linked) parts.push(`${datum.linked} linked`);
  return `${date}, ${parts.join(', ')}`;
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.base,
  },
  weekdayRow: {
    flexDirection: 'row',
    paddingBottom: spacing.sm,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    height: 64,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: spacing.xs,
    paddingHorizontal: 2,
    gap: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dayTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: 16,
  },
  linkedChip: {
    paddingHorizontal: 4,
    height: 14,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkedChipText: {
    fontSize: 9,
    lineHeight: 12,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 8,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusLabel: {
    fontSize: 9,
    lineHeight: 12,
  },
  rowSpacer: {
    height: 8,
  },
  countPill: {
    minWidth: 18,
    height: 16,
    borderRadius: radius.full,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countSpacer: {
    height: 16,
  },
});
