/**
 * SchedulePreviewCalendar — the planning calendar under "Plan hours ahead":
 * every day of a month with the hours the calendar is actually bookable (its
 * hours for that date, inside the venue's business hours and closures, minus
 * days off and leave), tinted by which schedule change produced them. Read
 * only; picking a day hands the date and its summary to the parent. Pages back
 * through past months as well as ahead, so a change that has ended can still
 * be seen where it applied.
 *
 * Web parity: `ScheduleCalendarPreview.tsx`. `summariseScheduleDay` is its
 * `summariseDay`, with the venue side answered by the app's own venue-day
 * resolver (the one the diary shades closures with), so a closure, an
 * amended-hours day and a weekday the venue does not trade read here exactly
 * as they book.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import {
  resolveVenueDay,
  venueWeekDayHours,
  type MinuteRange,
  type VenueWideBlock,
} from '@/lib/calendar/venue-closures';
import {
  dayOfWeekYmd,
  resolveScheduleForDate,
  type CalendarSchedule,
  type RotaWeeklyHours,
  type ScheduleSource,
} from '@/lib/calendar/working-hours-rota';
import { hexToRgba } from '@/lib/color';
import { useAvailabilityBlocks } from '@/lib/queries/useAvailabilityBlocks';
import { usePractitionerLeave } from '@/lib/queries/useAvailabilityManage';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { OpeningHours } from '@/types/venue';

export interface LeaveRowLike {
  start_date: string;
  end_date: string;
  unavailable_start_time?: string | null;
  unavailable_end_time?: string | null;
}

export type DayReason =
  | 'base'
  | 'period'
  | 'no-hours'
  | 'day-off'
  | 'venue-closed'
  | 'venue-closure'
  | 'leave';

export interface DaySummary {
  date: string;
  /** "09:00–17:00", "Closed", "Day off", "Venue closed", "Leave". */
  text: string;
  reason: DayReason;
  source: ScheduleSource;
  /** A part-day leave window, shown alongside the hours. */
  partialLeave: string | null;
}

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Tints for changes, by index in the full timeline (past changes included, so
 * a colour never moves): the web's sky, violet, emerald, amber, rose, teal.
 */
export const PERIOD_TINTS = ['#BAE6FD', '#DDD6FE', '#A7F3D0', '#FDE68A', '#FECDD3', '#99F6E4'];

export function periodTint(index: number): string {
  return PERIOD_TINTS[index % PERIOD_TINTS.length] ?? PERIOD_TINTS[0]!;
}

function toMinutes(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

function toHhMm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function rangesForDay(hours: RotaWeeklyHours, dow: number): { start: string; end: string }[] {
  const numeric = hours[String(dow)];
  if (Array.isArray(numeric) && numeric.length > 0) return numeric;
  const named = hours[DAY_NAMES[dow] ?? ''];
  return Array.isArray(named) ? named : [];
}

function intersectWithVenue(
  ranges: { start: string; end: string }[],
  venue: MinuteRange[] | null,
): MinuteRange[] {
  const out: MinuteRange[] = [];
  for (const r of ranges) {
    const s = toMinutes(r.start);
    const e = toMinutes(r.end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    if (!venue) {
      out.push({ start: s, end: e });
      continue;
    }
    for (const v of venue) {
      const start = Math.max(s, v.start);
      const end = Math.min(e, v.end);
      if (end > start) out.push({ start, end });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Everything the cell shows for one date. Pure, so the calendar and its tests agree. */
export function summariseScheduleDay(input: {
  date: string;
  baseHours: RotaWeeklyHours | null | undefined;
  schedule: CalendarSchedule | null;
  daysOff: readonly string[];
  venueOpeningHours: OpeningHours | null | undefined;
  leave: readonly LeaveRowLike[];
  /** Venue-wide closures and amended hours; omit for the weekly hours alone. */
  venueWideBlocks?: readonly VenueWideBlock[];
}): DaySummary {
  const { date } = input;
  const resolution = resolveScheduleForDate(
    { working_hours: input.baseHours ?? {}, schedule_periods: input.schedule },
    date,
  );
  const dow = dayOfWeekYmd(date);
  const base = { date, source: resolution.source, partialLeave: null as string | null };

  const leaveToday = input.leave.filter((l) => l.start_date <= date && date <= l.end_date);
  const fullDayLeave = leaveToday.some(
    (l) => !l.unavailable_start_time || !l.unavailable_end_time,
  );
  if (fullDayLeave) return { ...base, text: 'Leave', reason: 'leave' };
  if (input.daysOff.includes(date) || input.daysOff.includes(DAY_NAMES[dow] ?? '')) {
    return { ...base, text: 'Day off', reason: 'day-off' };
  }

  const venue = resolveVenueDay(input.venueOpeningHours, date, [...(input.venueWideBlocks ?? [])])
    .hours;
  if (venue.kind === 'closed') {
    const weekly = venueWeekDayHours(input.venueOpeningHours, date);
    return {
      ...base,
      text: 'Venue closed',
      reason: weekly.kind === 'closed' ? 'venue-closed' : 'venue-closure',
    };
  }

  const ranges = intersectWithVenue(
    rangesForDay(resolution.hours, dow),
    venue.kind === 'open' ? venue.periods : null,
  );
  const partial = leaveToday.find((l) => l.unavailable_start_time && l.unavailable_end_time);
  const partialLeave = partial
    ? `${partial.unavailable_start_time!.slice(0, 5)}–${partial.unavailable_end_time!.slice(0, 5)}`
    : null;
  if (ranges.length === 0) return { ...base, text: 'Closed', reason: 'no-hours', partialLeave };
  return {
    ...base,
    text: ranges.map((r) => `${toHhMm(r.start)}–${toHhMm(r.end)}`).join(', '),
    reason: resolution.source.kind === 'period' ? 'period' : 'base',
    partialLeave,
  };
}

/** Days of a month laid out Monday-first, with leading and trailing blanks. */
export function monthCells(year: number, monthIndex: number): (string | null)[] {
  const first = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
  const lead = (dayOfWeekYmd(first) + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array<string | null>(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(`${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

type Props = {
  calendarId: string;
  baseHours: RotaWeeklyHours | null | undefined;
  schedule: CalendarSchedule | null;
  daysOff: readonly string[];
  venueOpeningHours: OpeningHours | null | undefined;
  selectedDate: string | null;
  onPickDate: (date: string, summary: DaySummary) => void;
  /** Today, `YYYY-MM-DD`, in the venue's timezone. */
  todayYmd: string;
};

export function SchedulePreviewCalendar({
  calendarId,
  baseHours,
  schedule,
  daysOff,
  venueOpeningHours,
  selectedDate,
  onPickDate,
  todayYmd,
}: Props) {
  const { colors } = useTheme();
  const [month, setMonth] = useState(() => ({
    year: Number(todayYmd.slice(0, 4)),
    monthIndex: Number(todayYmd.slice(5, 7)) - 1,
  }));

  const cells = useMemo(() => monthCells(month.year, month.monthIndex), [month]);
  const firstDay = cells.find((c): c is string => c != null) ?? todayYmd;
  const lastDay = [...cells].reverse().find((c): c is string => c != null) ?? todayYmd;

  // This calendar's leave for the month, and the venue's closures and amended
  // hours (venue-wide rows only: a service-scoped block does not close the venue).
  const leaveQuery = usePractitionerLeave(firstDay, lastDay, calendarId);
  const blocksQuery = useAvailabilityBlocks();
  const leave = useMemo<LeaveRowLike[]>(() => leaveQuery.data?.periods ?? [], [leaveQuery.data]);
  const venueWideBlocks = useMemo<VenueWideBlock[]>(
    () =>
      (blocksQuery.data ?? []).filter(
        (b) => (b as { service_id?: string | null }).service_id == null,
      ) as VenueWideBlock[],
    [blocksQuery.data],
  );

  const summaries = useMemo(() => {
    const map = new Map<string, DaySummary>();
    for (const c of cells) {
      if (c) {
        map.set(
          c,
          summariseScheduleDay({
            date: c,
            baseHours,
            schedule,
            daysOff,
            venueOpeningHours,
            leave,
            venueWideBlocks,
          }),
        );
      }
    }
    return map;
  }, [cells, baseHours, schedule, daysOff, venueOpeningHours, leave, venueWideBlocks]);

  const periodIndexById = useMemo(
    () => new Map((schedule?.periods ?? []).map((p, i) => [p.id, i] as const)),
    [schedule],
  );

  function shift(delta: number) {
    setMonth((m) => {
      const d = new Date(Date.UTC(m.year, m.monthIndex + delta, 1));
      return { year: d.getUTCFullYear(), monthIndex: d.getUTCMonth() };
    });
  }

  const monthLabel = `${MONTH_NAMES[month.monthIndex]} ${month.year}`;
  const isThisMonth =
    month.year === Number(todayYmd.slice(0, 4)) &&
    month.monthIndex === Number(todayYmd.slice(5, 7)) - 1;

  return (
    <View>
      <View style={styles.header}>
        <IconButton
          icon={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
          accessibilityLabel="Previous month"
          variant="bordered"
          onPress={() => shift(-1)}
        />
        <View style={styles.headerMiddle}>
          <Text variant="label">{monthLabel}</Text>
          {!isThisMonth ? (
            <Button
              label="Today"
              variant="ghost"
              size="sm"
              onPress={() =>
                setMonth({
                  year: Number(todayYmd.slice(0, 4)),
                  monthIndex: Number(todayYmd.slice(5, 7)) - 1,
                })
              }
            />
          ) : null}
        </View>
        <IconButton
          icon={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          accessibilityLabel="Next month"
          variant="bordered"
          onPress={() => shift(1)}
        />
      </View>

      <View style={styles.weekdayRow}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <Text key={d} variant="caption" tone="muted" style={styles.weekdayLabel}>
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.grid} accessibilityLabel={`Bookable hours in ${monthLabel}`}>
        {cells.map((cell, i) => {
          if (!cell) return <View key={`blank-${i}`} style={styles.cell} />;
          const s = summaries.get(cell)!;
          const periodIndex =
            s.source.kind === 'period' ? (periodIndexById.get(s.source.period.id) ?? 0) : null;
          const tint = periodIndex != null ? hexToRgba(periodTint(periodIndex), 0.45) : undefined;
          const closed = s.reason !== 'base' && s.reason !== 'period';
          const selected = selectedDate === cell;
          const isToday = cell === todayYmd;
          return (
            <Pressable
              key={cell}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${cell}: ${s.text}${s.partialLeave ? `, leave ${s.partialLeave}` : ''}`}
              onPress={() => onPickDate(cell, s)}
              style={[
                styles.cell,
                styles.dayCell,
                {
                  backgroundColor: tint ?? colors.surface,
                  borderColor: selected ? colors.brand : colors.border,
                  borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
                  opacity: cell < todayYmd ? 0.8 : 1,
                },
              ]}>
              <View style={styles.cellTop}>
                <Text
                  variant="caption"
                  style={[styles.dayNumber, isToday ? styles.todayNumber : null]}
                  color={isToday ? colors.brand : undefined}>
                  {Number(cell.slice(8, 10))}
                </Text>
                {s.source.kind === 'period' && s.source.period.weeks.length > 1 ? (
                  <Text variant="caption" tone="muted" style={styles.weekBadge}>
                    W{s.source.weekIndex + 1}
                  </Text>
                ) : null}
              </View>
              <Text
                numberOfLines={2}
                style={[styles.cellText, { color: closed ? colors.textMuted : colors.text }]}>
                {s.text}
              </Text>
              {s.partialLeave ? (
                <Text numberOfLines={1} style={[styles.cellSub, { color: colors.textMuted }]}>
                  leave {s.partialLeave}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerMiddle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontFamily: fonts.semibold,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    minHeight: 58,
    padding: 1,
  },
  dayCell: {
    borderRadius: radius.sm,
    paddingHorizontal: 3,
    paddingVertical: 3,
  },
  cellTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayNumber: {
    fontSize: 11,
  },
  todayNumber: {
    fontFamily: fonts.semibold,
  },
  weekBadge: {
    fontSize: 9,
  },
  cellText: {
    fontSize: 9,
    lineHeight: 11,
    marginTop: 2,
  },
  cellSub: {
    fontSize: 8,
    lineHeight: 10,
  },
});
