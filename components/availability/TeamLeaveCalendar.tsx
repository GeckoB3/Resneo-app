import { addDays, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { useRouter, type Href } from 'expo-router';
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
import {
  amendedClosedOnDate,
  amendedHoursOnDate,
  describeHoursPeriods,
  type AmendedHoursEntry,
} from '@/lib/availability/calendar-amended-hours';
import { useAmendedHours } from '@/lib/queries/useCalendarAmendedHours';
import { useTeamLeaveMonth } from '@/lib/queries/useTeamLeave';
import { fonts, minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { LeavePeriod, LeaveType } from '@/types/availability-manage';
import { CONFIRM_ARM_MS } from '@/lib/ui/confirm-arm';

// ---- Leave type display (consistent annual/sick/other keying, web parity) ---
const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: 'Closed',
  sick: 'Unavailable',
  other: 'Other',
};

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

/**
 * What a day cell encodes (web `ResourceExceptionsCalendar` in
 * `calendar_unavailability` mode): a whole day out ("Off"), a window out
 * ("Block"), or different hours ("Hrs"). A whole day out wins outright; amended
 * hours can show over a part-day window.
 */
type DayMark = 'off' | 'block' | 'hours';

type MarkStyle = { surface: string; ink: string; badge: string; legend: string };

function useMarkStyles(): Record<DayMark, MarkStyle> {
  const { colors } = useTheme();
  return {
    off: { surface: colors.dangerSurface, ink: colors.danger, badge: 'Off', legend: 'All day' },
    block: { surface: colors.infoSurface, ink: colors.info, badge: 'Block', legend: 'Part day' },
    hours: {
      surface: colors.warningSurface,
      ink: colors.warning,
      badge: 'Hrs',
      legend: 'Amended hours',
    },
  };
}

const MARK_ORDER: DayMark[] = ['off', 'block', 'hours'];

type TeamLeaveCalendarProps = {
  /** Today in the venue timezone (YYYY-MM-DD). */
  today: string;
  /** Page-level practitioner filter (null = whole team). */
  filterPractitionerId: string | null;
  /** Opens the existing leave edit sheet with this period. */
  onEditLeave: (period: LeavePeriod) => void;
  /** Opens the leave sheet on a run of amended hours (web #187). */
  onEditAmended?: (row: AmendedHoursEntry) => void;
  /** Opens the leave create sheet prefilled with the tapped date range. */
  onCreateRange: (startDate: string, endDate: string) => void;
  /** Existing page delete handler (confirm + mutation). */
  onDeleteLeave: (leaveId: string) => void;
  /** Per-id pending deletes from the page, to scope loading state. */
  deletingLeaveIds: Set<string>;
};

/**
 * Calendar closures and amended hours — month grid of the team's time off and
 * amended hours, with a list view and per-day breakdown. Mirrors the web's
 * Closures & amended hours tab (`StaffLeaveCalendarPanel` + the month grid).
 */
export function TeamLeaveCalendar({
  today,
  filterPractitionerId,
  onEditLeave,
  onEditAmended,
  onCreateRange,
  onDeleteLeave,
  deletingLeaveIds,
}: TeamLeaveCalendarProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const marks = useMarkStyles();

  // First day of the displayed month.
  const [monthAnchor, setMonthAnchor] = useState(() => getMonthRangeFromDate(today).from);
  const [view, setView] = useState<ViewMode>('calendar');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // In-progress date-range selection (calendar-first add; mirrors web handleDayClick).
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);

  const monthRange = getMonthRangeFromDate(monthAnchor);
  const leaveQuery = useTeamLeaveMonth(monthRange.from, monthRange.to, filterPractitionerId);
  // Amended hours in the month (web #187): drawn amber, and edited on tap.
  const amendedQuery = useAmendedHours(monthRange.from, monthRange.to, filterPractitionerId);
  const amended = useMemo(() => amendedQuery.data ?? [], [amendedQuery.data]);
  const periods = useMemo(() => leaveQuery.data?.periods ?? [], [leaveQuery.data?.periods]);

  // date → the marks on it (full day out, a window out, amended hours).
  const marksByDay = useMemo(() => {
    const map: Record<string, Set<DayMark>> = {};
    for (const p of periods) {
      // Clamp to the visible month so multi-month periods don't loop far.
      const from = p.start_date > monthRange.from ? p.start_date : monthRange.from;
      const to = p.end_date < monthRange.to ? p.end_date : monthRange.to;
      for (let d = from; d <= to; d = addDaysToStr(d, 1)) {
        (map[d] ??= new Set()).add(isPartialDay(p) ? 'block' : 'off');
      }
    }
    for (const a of amended) {
      const from = a.date_start > monthRange.from ? a.date_start : monthRange.from;
      const to = a.date_end < monthRange.to ? a.date_end : monthRange.to;
      for (let d = from; d <= to; d = addDaysToStr(d, 1)) {
        (map[d] ??= new Set()).add(a.kind === 'closed' ? 'off' : 'hours');
      }
    }
    return map;
  }, [periods, amended, monthRange.from, monthRange.to]);

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
  const selectedDayAmended = selectedDate
    ? amended.filter(
        (a) => a.kind === 'hours' && a.date_start <= selectedDate && selectedDate <= a.date_end,
      )
    : [];

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
   * - a day with no leave but amended hours → edit that run;
   * - otherwise drive a date-range selection (1st tap = start=end, tap same
   *   again = clear, 2nd distinct tap = [start,end]) for a new entry.
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
    const amendedOnDay = onDay.length === 0 ? amendedHoursOnDate(amended, dateStr) : null;
    if (amendedOnDay && onEditAmended) {
      clearRange();
      onEditAmended(amendedOnDay);
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

  /** The one mark a cell draws: a whole day out wins, then a window, then hours. */
  function markForDay(dateStr: string): DayMark | null {
    const set = marksByDay[dateStr];
    if (!set) return null;
    if (set.has('off') || amendedClosedOnDate(amended, dateStr)) return 'off';
    if (set.has('hours')) return 'hours';
    if (set.has('block')) return 'block';
    return null;
  }

  // ---- Month grid cells ------------------------------------------------------
  const monthDate = parseISO(`${monthAnchor}T12:00:00.000Z`);
  const gridStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <Card>
      <Text variant="label">Calendar closures and amended hours</Text>
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
        <LoadingState message="Loading calendar…" />
      ) : leaveQuery.isError ? (
        <ErrorState
          title="Could not load calendar unavailability"
          message={
            leaveQuery.error instanceof ApiError
              ? leaveQuery.error.message
              : 'An error occurred loading closures for this month.'
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

          {/* 6×7 month grid: Off / Block / Hrs badges on a tinted cell */}
          {Array.from({ length: 6 }, (_, week) => (
            <View key={week} style={styles.weekRow}>
              {cells.slice(week * 7, week * 7 + 7).map((cell) => {
                const dateStr = format(cell, 'yyyy-MM-dd');
                const inMonth = isSameMonth(cell, monthDate);
                const isToday = dateStr === today;
                const isSelected = dateStr === selectedDate;
                const isRange = inRange(dateStr);
                const mark = markForDay(dateStr);
                const awayCount = periodsOnDay(periods, dateStr).length;

                return (
                  <Pressable
                    key={dateStr}
                    onPress={() => handleDayPress(dateStr)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected || isRange }}
                    accessibilityLabel={`${format(cell, 'd MMMM')}, ${awayCount} ${awayCount === 1 ? 'leave period' : 'leave periods'}${
                      mark === 'hours' ? ', amended hours' : mark === 'off' ? ', closed' : mark === 'block' ? ', unavailable for part of the day' : ''
                    }`}
                    style={({ pressed }) => [
                      styles.dayCell,
                      { borderColor: colors.border },
                      isToday ? { backgroundColor: colors.brandSubtle } : null,
                      mark && inMonth ? { backgroundColor: marks[mark].surface } : null,
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
                    <View style={styles.badgeRow}>
                      {mark ? (
                        <Text
                          style={[styles.badge, { color: marks[mark].ink }]}
                          testID={mark === 'hours' ? 'amended-day' : `${mark}-day`}>
                          {marks[mark].badge}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {/* Legend */}
          <View style={styles.legendRow}>
            {MARK_ORDER.map((m) => (
              <View key={m} style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: marks[m].surface }]}>
                  <Text style={[styles.badge, { color: marks[m].ink }]}>{marks[m].badge}</Text>
                </View>
                <Text variant="caption" tone="secondary">
                  {marks[m].legend}
                </Text>
              </View>
            ))}
          </View>

          {amendedQuery.isError ? (
            <View style={styles.inlineError}>
              <Text variant="caption" tone="danger" style={styles.flex1}>
                Could not load amended hours.
              </Text>
              <Button
                label="Retry"
                variant="ghost"
                size="sm"
                onPress={() => void amendedQuery.refetch()}
              />
            </View>
          ) : null}

          {/* In-progress range selection → new entry prefilled (web parity) */}
          {rangeStart && rangeEnd ? (
            <View style={[styles.rangeBar, { borderTopColor: colors.border }]}>
              <View style={styles.rangeActions}>
                <Button
                  label={`New entry · ${formatRangeLabel(rangeStart, rangeEnd)}`}
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
                <Button label="Clear selection" variant="ghost" size="sm" onPress={clearRange} />
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
              {selectedDayPeriods.length === 0 && selectedDayAmended.length === 0 ? (
                <Text variant="caption" tone="muted">
                  No closures or amended hours on this day.
                </Text>
              ) : (
                <>
                  {selectedDayPeriods.map((period) => (
                    <LeavePeriodRow
                      key={period.id}
                      period={period}
                      marks={marks}
                      onEdit={onEditLeave}
                      onDelete={onDeleteLeave}
                      deleting={deletingLeaveIds.has(period.id)}
                    />
                  ))}
                  {selectedDayAmended.map((row) => (
                    <View
                      key={`${row.calendar_id}-${row.date_start}`}
                      style={[styles.periodRow, { borderBottomColor: colors.border }]}>
                      <View style={styles.periodBody}>
                        <View style={styles.periodTitleRow}>
                          <View style={[styles.typePill, { backgroundColor: marks.hours.surface }]}>
                            <Text variant="caption" color={marks.hours.ink}>
                              Amended hours
                            </Text>
                          </View>
                          <Text variant="bodyMedium" numberOfLines={1} style={styles.periodName}>
                            {row.calendar_name}
                          </Text>
                        </View>
                        <Text variant="caption" tone="muted" numberOfLines={2}>
                          {describeHoursPeriods(row.periods)}
                          {row.reason ? ` · ${row.reason}` : ''}
                        </Text>
                      </View>
                      {onEditAmended ? (
                        <View style={styles.periodActions}>
                          <Button
                            label="Edit"
                            variant="ghost"
                            size="sm"
                            onPress={() => onEditAmended(row)}
                          />
                        </View>
                      ) : null}
                    </View>
                  ))}
                </>
              )}
            </View>
          ) : periods.length === 0 && amended.length === 0 ? (
            <Text variant="caption" tone="muted" style={styles.noLeaveHint}>
              Nothing this month. Tap dates on the calendar to select a range, then set the
              details.
            </Text>
          ) : (
            <Text variant="caption" tone="muted" style={styles.noLeaveHint}>
              Tap a day to see who is away, or tap dates to select a range for a new entry.
            </Text>
          )}
        </>
      ) : sortedPeriods.length === 0 ? (
        <EmptyState
          title="No closures this month"
          message="Closures overlapping this month will appear here."
        />
      ) : (
        <View style={styles.listWrap}>
          {sortedPeriods.map((period) => (
            <LeavePeriodRow
              key={period.id}
              period={period}
              marks={marks}
              onEdit={onEditLeave}
              onDelete={onDeleteLeave}
              deleting={deletingLeaveIds.has(period.id)}
            />
          ))}
        </View>
      )}

      {/* Whole-venue closures live on the Business hours screen (in the app too). */}
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push('/manage/hours' as Href)}
        style={styles.webNote}
        hitSlop={4}>
        <Text variant="caption" tone="muted">
          Whole-venue closures and amended opening hours for every booking type are in{' '}
          <Text variant="caption" color={colors.brand}>
            Settings → Business hours
          </Text>
          .
        </Text>
      </Pressable>
    </Card>
  );
}

// ---- Single leave period row -------------------------------------------------
function LeavePeriodRow({
  period,
  marks,
  onEdit,
  onDelete,
  deleting,
}: {
  period: LeavePeriod;
  marks: Record<DayMark, MarkStyle>;
  onEdit: (period: LeavePeriod) => void;
  onDelete: (leaveId: string) => void;
  deleting: boolean;
}) {
  const { colors } = useTheme();
  const type = normalizeLeaveType(period.leave_type);
  const partial = isPartialDay(period);
  const mark = marks[partial ? 'block' : 'off'];

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
    armTimer.current = setTimeout(() => setArmed(false), CONFIRM_ARM_MS);
  };

  return (
    <View style={[styles.periodRow, { borderBottomColor: colors.border }]}>
      <View style={styles.periodBody}>
        <View style={styles.periodTitleRow}>
          {/* All day / Part day is the fact the web leads with; the label the
              team chose (Closed / Unavailable / Other) follows it. */}
          <View style={[styles.typePill, { backgroundColor: mark.surface }]}>
            <Text variant="caption" color={mark.ink}>
              {mark.legend}
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
          {` · ${LEAVE_TYPE_LABELS[type]}`}
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
  badgeRow: {
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    fontSize: 9,
    fontFamily: fonts.bold,
    lineHeight: 11,
    letterSpacing: 0.2,
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
  legendSwatch: {
    minWidth: 28,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  flex1: {
    flex: 1,
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
