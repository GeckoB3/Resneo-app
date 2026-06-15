import { addDays, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  addMonthsToDateStr,
  formatDayHeading,
  formatRangeLabel,
  getMonthRangeFromDate,
  formatMonthLabel,
} from '@/lib/dates/venue-dates';
import { hapticSelect, hapticWarning } from '@/lib/haptics';
import { useTeamLeaveMonth } from '@/lib/queries/useTeamLeave';
import { fonts, minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { LeavePeriod, LeaveType } from '@/types/availability-manage';

// ---- Leave type display (consistent annual/sick/other keying, web parity) ---
const LEAVE_TYPE_ORDER: LeaveType[] = ['annual', 'sick', 'other'];

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: 'Closed',
  sick: 'Unavailable',
  other: 'Other',
};

type LeaveTypeColors = { dot: string; surface: string };

function useLeaveTypeColors(): Record<LeaveType, LeaveTypeColors> {
  const { colors } = useTheme();
  return {
    annual: { dot: colors.danger, surface: colors.dangerSurface },
    sick: { dot: colors.warning, surface: colors.warningSurface },
    other: { dot: colors.info, surface: colors.infoSurface },
  };
}

function normalizeLeaveType(t: string): LeaveType {
  return t === 'annual' || t === 'sick' || t === 'other' ? t : 'other';
}

function isPartialDay(p: LeavePeriod): boolean {
  return Boolean(p.unavailable_start_time && p.unavailable_end_time);
}

/** Periods whose date range covers the given calendar day. */
function periodsOnDay(periods: LeavePeriod[], dateStr: string): LeavePeriod[] {
  return periods.filter((p) => p.start_date <= dateStr && p.end_date >= dateStr);
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type ViewMode = 'calendar' | 'list';

type TeamLeaveCalendarProps = {
  /** Today in the venue timezone (YYYY-MM-DD). */
  today: string;
  /** Page-level practitioner filter (null = whole team). */
  filterPractitionerId: string | null;
  /** Opens the existing leave edit sheet with this period. */
  onEditLeave: (period: LeavePeriod) => void;
  /** Opens the leave create sheet prefilled with the tapped date range. */
  onCreateRange: (startDate: string, endDate: string) => void;
  /** Existing page delete handler (confirm + mutation). */
  onDeleteLeave: (leaveId: string) => void;
  /** Per-id pending deletes from the page, to scope loading state. */
  deletingLeaveIds: Set<string>;
};

/**
 * Team leave calendar — month grid of the whole team's time off, color-coded
 * by leave type (annual/sick/other), with a list view and per-day breakdown.
 * Mirrors the web dashboard's Availability → Closures calendar panel.
 */
export function TeamLeaveCalendar({
  today,
  filterPractitionerId,
  onEditLeave,
  onCreateRange,
  onDeleteLeave,
  deletingLeaveIds,
}: TeamLeaveCalendarProps) {
  const { colors } = useTheme();
  const typeColors = useLeaveTypeColors();

  // First day of the displayed month.
  const [monthAnchor, setMonthAnchor] = useState(() => getMonthRangeFromDate(today).from);
  const [view, setView] = useState<ViewMode>('calendar');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // In-progress date-range selection (calendar-first add; mirrors web handleDayClick).
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);

  const monthRange = getMonthRangeFromDate(monthAnchor);
  const leaveQuery = useTeamLeaveMonth(monthRange.from, monthRange.to, filterPractitionerId);
  const periods = useMemo(() => leaveQuery.data?.periods ?? [], [leaveQuery.data?.periods]);

  // date → distinct leave types present (for the day dots).
  const typesByDay = useMemo(() => {
    const map: Record<string, Set<LeaveType>> = {};
    for (const p of periods) {
      // Clamp to the visible month so multi-month periods don't loop far.
      const from = p.start_date > monthRange.from ? p.start_date : monthRange.from;
      const to = p.end_date < monthRange.to ? p.end_date : monthRange.to;
      for (let d = from; d <= to; d = addDaysToStr(d, 1)) {
        (map[d] ??= new Set()).add(normalizeLeaveType(p.leave_type));
      }
    }
    return map;
  }, [periods, monthRange.from, monthRange.to]);

  const sortedPeriods = useMemo(
    () =>
      [...periods].sort(
        (a, b) =>
          a.start_date.localeCompare(b.start_date) ||
          (a.practitioner_name ?? '').localeCompare(b.practitioner_name ?? ''),
      ),
    [periods],
  );

  const selectedDayPeriods = selectedDate ? periodsOnDay(sortedPeriods, selectedDate) : [];

  function goMonth(offset: number) {
    hapticSelect();
    setMonthAnchor((prev) => getMonthRangeFromDate(addMonthsToDateStr(prev, offset)).from);
    setSelectedDate(null);
    clearRange();
  }

  function clearRange() {
    setRangeStart(null);
    setRangeEnd(null);
  }

  /**
   * Tap-to-act on a calendar day (mirrors web `handleDayClick`):
   * - a day with exactly ONE leave → edit that period;
   * - otherwise drive a date-range selection (1st tap = start=end, tap same
   *   again = clear, 2nd distinct tap = [start,end]) for a new leave.
   * `selectedDate` still drives the "who is away" breakdown below.
   */
  function handleDayPress(dateStr: string) {
    hapticSelect();
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr));

    const onDay = periodsOnDay(periods, dateStr);
    if (onDay.length === 1) {
      clearRange();
      onEditLeave(onDay[0]!);
      return;
    }

    if (!rangeStart) {
      setRangeStart(dateStr);
      setRangeEnd(dateStr);
    } else if (rangeStart === dateStr && rangeEnd === dateStr) {
      clearRange();
    } else {
      const a = rangeStart <= dateStr ? rangeStart : dateStr;
      const b = rangeStart <= dateStr ? dateStr : rangeStart;
      setRangeStart(a);
      setRangeEnd(b);
    }
  }

  /** True when `dateStr` falls inside the in-progress range selection. */
  function inRange(dateStr: string): boolean {
    return Boolean(rangeStart && rangeEnd && dateStr >= rangeStart && dateStr <= rangeEnd);
  }

  // ---- Month grid cells ------------------------------------------------------
  const monthDate = parseISO(`${monthAnchor}T12:00:00.000Z`);
  const gridStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <Card>
      <Text variant="label">Team leave</Text>
      <View style={styles.viewToggle}>
        <Segmented
          options={[
            { value: 'calendar', label: 'Calendar' },
            { value: 'list', label: 'List' },
          ]}
          value={view}
          onChange={setView}
        />
      </View>

      {/* Month navigation */}
      <View style={styles.monthNav}>
        <Pressable
          onPress={() => goMonth(-1)}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          style={({ pressed }) => [
            styles.navButton,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text style={[styles.navSymbol, { color: colors.brand }]}>‹</Text>
        </Pressable>
        <Text variant="subheading" style={styles.monthLabel}>
          {formatMonthLabel(monthAnchor)}
        </Text>
        <Pressable
          onPress={() => goMonth(1)}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          style={({ pressed }) => [
            styles.navButton,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text style={[styles.navSymbol, { color: colors.brand }]}>›</Text>
        </Pressable>
      </View>

      {leaveQuery.isLoading ? (
        <LoadingState message="Loading team leave…" />
      ) : leaveQuery.isError ? (
        <ErrorState
          title="Could not load team leave"
          message={
            leaveQuery.error instanceof ApiError
              ? leaveQuery.error.message
              : 'An error occurred loading leave for this month.'
          }
          onRetry={() => void leaveQuery.refetch()}
        />
      ) : view === 'calendar' ? (
        <>
          {/* Weekday header */}
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label) => (
              <View key={label} style={styles.weekdayCell}>
                <Text variant="caption" tone="muted">
                  {label}
                </Text>
              </View>
            ))}
          </View>

          {/* 6×7 month grid with leave-type dots */}
          {Array.from({ length: 6 }, (_, week) => (
            <View key={week} style={styles.weekRow}>
              {cells.slice(week * 7, week * 7 + 7).map((cell) => {
                const dateStr = format(cell, 'yyyy-MM-dd');
                const inMonth = isSameMonth(cell, monthDate);
                const isToday = dateStr === today;
                const isSelected = dateStr === selectedDate;
                const isRange = inRange(dateStr);
                const dayTypes = LEAVE_TYPE_ORDER.filter((t) => typesByDay[dateStr]?.has(t));
                const awayCount = periodsOnDay(periods, dateStr).length;

                return (
                  <Pressable
                    key={dateStr}
                    onPress={() => handleDayPress(dateStr)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected || isRange }}
                    accessibilityLabel={`${format(cell, 'd MMMM')}, ${awayCount} ${awayCount === 1 ? 'leave period' : 'leave periods'}`}
                    style={({ pressed }) => [
                      styles.dayCell,
                      { borderColor: colors.border },
                      isToday ? { backgroundColor: colors.brandSubtle } : null,
                      isRange ? { backgroundColor: colors.brandSubtle } : null,
                      isSelected || isRange
                        ? { borderColor: colors.brand, borderWidth: 1.5, borderRadius: radius.sm }
                        : null,
                      pressed ? { opacity: 0.55 } : null,
                    ]}>
                    <Text
                      variant="bodySmall"
                      color={inMonth ? (isToday ? colors.brand : colors.text) : colors.textMuted}>
                      {format(cell, 'd')}
                    </Text>
                    <View style={styles.dotRow}>
                      {dayTypes.map((t) => (
                        <View
                          key={t}
                          style={[styles.dot, { backgroundColor: typeColors[t].dot }]}
                        />
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {/* Legend */}
          <View style={styles.legendRow}>
            {LEAVE_TYPE_ORDER.map((t) => (
              <View key={t} style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: typeColors[t].dot }]} />
                <Text variant="caption" tone="secondary">
                  {LEAVE_TYPE_LABELS[t]}
                </Text>
              </View>
            ))}
          </View>

          {/* In-progress range selection → create leave prefilled (web parity) */}
          {rangeStart && rangeEnd ? (
            <View style={[styles.rangeBar, { borderTopColor: colors.border }]}>
              <View style={styles.rangeActions}>
                <Button
                  label={`Add leave · ${formatRangeLabel(rangeStart, rangeEnd)}`}
                  size="sm"
                  style={styles.rangeAddBtn}
                  onPress={() => {
                    const start = rangeStart;
                    const end = rangeEnd;
                    clearRange();
                    setSelectedDate(null);
                    onCreateRange(start, end);
                  }}
                />
                <Button label="Clear" variant="ghost" size="sm" onPress={clearRange} />
              </View>
              <Text variant="caption" tone="muted">
                Tap another day to extend the range, or tap the same day again to clear.
              </Text>
            </View>
          ) : null}

          {/* Selected day breakdown */}
          {selectedDate ? (
            <View style={[styles.dayDetail, { borderTopColor: colors.border }]}>
              <Text variant="bodyMedium">{formatDayHeading(selectedDate)}</Text>
              {selectedDayPeriods.length === 0 ? (
                <Text variant="caption" tone="muted">
                  No one is away on this day.
                </Text>
              ) : (
                selectedDayPeriods.map((period) => (
                  <LeavePeriodRow
                    key={period.id}
                    period={period}
                    typeColors={typeColors}
                    onEdit={onEditLeave}
                    onDelete={onDeleteLeave}
                    deleting={deletingLeaveIds.has(period.id)}
                  />
                ))
              )}
            </View>
          ) : periods.length === 0 ? (
            <Text variant="caption" tone="muted" style={styles.noLeaveHint}>
              No leave booked this month.
            </Text>
          ) : (
            <Text variant="caption" tone="muted" style={styles.noLeaveHint}>
              Tap a day to see who is away.
            </Text>
          )}
        </>
      ) : sortedPeriods.length === 0 ? (
        <EmptyState
          title="No leave this month"
          message="Leave periods overlapping this month will appear here."
        />
      ) : (
        <View style={styles.listWrap}>
          {sortedPeriods.map((period) => (
            <LeavePeriodRow
              key={period.id}
              period={period}
              typeColors={typeColors}
              onEdit={onEditLeave}
              onDelete={onDeleteLeave}
              deleting={deletingLeaveIds.has(period.id)}
            />
          ))}
        </View>
      )}

      <Text variant="caption" tone="muted" style={styles.webNote}>
        Whole-venue closures and amended business hours are managed in Settings → Business
        hours on the web dashboard.
      </Text>
    </Card>
  );
}

// ---- Single leave period row -------------------------------------------------
function LeavePeriodRow({
  period,
  typeColors,
  onEdit,
  onDelete,
  deleting,
}: {
  period: LeavePeriod;
  typeColors: Record<LeaveType, LeaveTypeColors>;
  onEdit: (period: LeavePeriod) => void;
  onDelete: (leaveId: string) => void;
  deleting: boolean;
}) {
  const { colors } = useTheme();
  const type = normalizeLeaveType(period.leave_type);
  const partial = isPartialDay(period);

  // Two-step confirm — Alert.alert confirms are a no-op on web, so arm then confirm.
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    },
    [],
  );
  const handleRemovePress = () => {
    if (armed) {
      if (armTimer.current) clearTimeout(armTimer.current);
      setArmed(false);
      onDelete(period.id);
      return;
    }
    setArmed(true);
    hapticWarning();
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => setArmed(false), 4000);
  };

  return (
    <View style={[styles.periodRow, { borderBottomColor: colors.border }]}>
      <View style={styles.periodBody}>
        <View style={styles.periodTitleRow}>
          <View style={[styles.typePill, { backgroundColor: typeColors[type].surface }]}>
            <View style={[styles.dot, { backgroundColor: typeColors[type].dot }]} />
            <Text variant="caption" color={typeColors[type].dot}>
              {LEAVE_TYPE_LABELS[type]}
            </Text>
          </View>
          <Text variant="bodyMedium" numberOfLines={1} style={styles.periodName}>
            {period.practitioner_name ?? 'Calendar'}
          </Text>
        </View>
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {formatDayHeading(period.start_date)}
          {period.end_date !== period.start_date ? ` → ${formatDayHeading(period.end_date)}` : ''}
          {partial
            ? ` · ${period.unavailable_start_time?.slice(0, 5)}–${period.unavailable_end_time?.slice(0, 5)} each day`
            : ''}
          {period.notes ? ` · ${period.notes}` : ''}
        </Text>
      </View>
      <View style={styles.periodActions}>
        <Button label="Edit" variant="ghost" size="sm" onPress={() => onEdit(period)} />
        <Button
          label={armed ? 'Tap to confirm' : 'Remove'}
          variant="ghost"
          size="sm"
          loading={deleting}
          disabled={deleting}
          onPress={handleRemovePress}
        />
      </View>
    </View>
  );
}

/** Add days to a YYYY-MM-DD string (local helper to avoid Date drift in loops). */
function addDaysToStr(dateStr: string, days: number): string {
  return format(addDays(parseISO(`${dateStr}T12:00:00.000Z`), days), 'yyyy-MM-dd');
}

const styles = StyleSheet.create({
  viewToggle: {
    marginTop: spacing.sm,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  monthLabel: {
    textAlign: 'center',
    flex: 1,
  },
  navButton: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navSymbol: {
    fontSize: 24,
    lineHeight: 28,
    fontFamily: fonts.bold,
  },
  weekdayRow: {
    flexDirection: 'row',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
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
    height: 48,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: spacing.xs,
    gap: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 3,
    height: 8,
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.base,
    paddingTop: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rangeBar: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  rangeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rangeAddBtn: {
    flex: 1,
  },
  dayDetail: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  noLeaveHint: {
    paddingTop: spacing.md,
  },
  listWrap: {
    marginTop: spacing.xs,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  periodBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  periodTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  periodName: {
    flexShrink: 1,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  periodActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  webNote: {
    paddingTop: spacing.md,
  },
});
