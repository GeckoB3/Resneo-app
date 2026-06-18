import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import {
  makeDateRangePatternRule,
  makeSpecificDatesRule,
  removeRule,
  setDateRange,
  setDateRangeRanges,
  setSpecificDateRanges,
  toggleDayOfWeek,
  toggleSpecificDate,
  toYmd,
  upsertRule,
  validateAdvancedRules,
  type DateRangePatternRule,
  type SpecificDatesRule,
} from '@/lib/services/service-custom-rules';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  ServiceCustomRule,
  ServiceCustomScheduleV2,
  ServiceTimeRange,
  ServiceWorkingHours,
} from '@/types/services-manage';

const DAYS: { key: string; label: string }[] = [
  { key: '1', label: 'Monday' },
  { key: '2', label: 'Tuesday' },
  { key: '3', label: 'Wednesday' },
  { key: '4', label: 'Thursday' },
  { key: '5', label: 'Friday' },
  { key: '6', label: 'Saturday' },
  { key: '0', label: 'Sunday' },
];

const STEP_MINUTES = 15;
const DEFAULT_RANGE: ServiceTimeRange = { start: '09:00', end: '17:00' };

function newRuleId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Normalise the stored schedule (versioned list or legacy day-map) into a V2
 * value so the editor always works against `{ version: 2, rules }`.
 */
export function toScheduleV2(
  value: ServiceCustomScheduleV2 | ServiceWorkingHours | null | undefined,
): ServiceCustomScheduleV2 {
  if (!value) return { version: 2, rules: [] };
  if ('version' in value && (value as ServiceCustomScheduleV2).version === 2) {
    const v2 = value as ServiceCustomScheduleV2;
    return { version: 2, rules: Array.isArray(v2.rules) ? v2.rules : [] };
  }
  // Legacy day-keyed map → a single weekly rule.
  const windows = value as ServiceWorkingHours;
  if (windows && Object.keys(windows).length > 0) {
    return { version: 2, rules: [{ id: newRuleId(), kind: 'weekly', windows }] };
  }
  return { version: 2, rules: [] };
}

/**
 * Validate the schedule the editor can now produce — weekly windows AND the
 * advanced `specific_dates` / `date_range_pattern` rules. Returns the first
 * error string, or null when valid.
 */
export function validateSchedule(schedule: ServiceCustomScheduleV2): string | null {
  for (const rule of schedule.rules) {
    if (rule.kind !== 'weekly') continue;
    for (const ranges of Object.values(rule.windows)) {
      for (const range of ranges) {
        if (timeToMinutes(range.end) <= timeToMinutes(range.start)) {
          return 'Each availability window must end after it starts.';
        }
      }
    }
  }
  return validateAdvancedRules(schedule);
}

/** True when the schedule has no usable windows (matches `isServiceCustomScheduleEmpty`). */
export function isScheduleEmpty(schedule: ServiceCustomScheduleV2): boolean {
  return schedule.rules.every((rule) => {
    if (rule.kind === 'weekly') {
      return Object.values(rule.windows).every((ranges) => ranges.length === 0);
    }
    if (rule.kind === 'specific_dates') return rule.entries.length === 0;
    return rule.ranges.length === 0;
  });
}

function findWeeklyRule(schedule: ServiceCustomScheduleV2): ServiceCustomRule | undefined {
  return schedule.rules.find((r) => r.kind === 'weekly');
}

function getWindows(schedule: ServiceCustomScheduleV2): ServiceWorkingHours {
  const weekly = findWeeklyRule(schedule);
  return weekly && weekly.kind === 'weekly' ? weekly.windows : {};
}

function stepTime(time: string, delta: number): string {
  const minutes = Math.min(23 * 60 + 45, Math.max(0, timeToMinutes(time) + delta));
  return minutesToTime(minutes);
}

function TimeStepper({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.timeStepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Earlier ${label}`}
        onPress={() => {
          hapticSelect();
          onChange(stepTime(value, -STEP_MINUTES));
        }}
        style={({ pressed }) => [
          styles.stepBtn,
          { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}>
        <Text style={[styles.stepSymbol, { color: colors.brand }]}>−</Text>
      </Pressable>
      <Text variant="bodyMedium" style={styles.timeValue}>
        {value}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Later ${label}`}
        onPress={() => {
          hapticSelect();
          onChange(stepTime(value, STEP_MINUTES));
        }}
        style={({ pressed }) => [
          styles.stepBtn,
          { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}>
        <Text style={[styles.stepSymbol, { color: colors.brand }]}>+</Text>
      </Pressable>
    </View>
  );
}

interface ServiceCustomAvailabilityEditorProps {
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  schedule: ServiceCustomScheduleV2;
  onScheduleChange: (next: ServiceCustomScheduleV2) => void;
}

/**
 * Per-weekday open/close window editor behind a toggle. Writes a single
 * `weekly` rule into the versioned schedule; any non-weekly rules created on the
 * web dashboard are preserved untouched on round-trip.
 */
export function ServiceCustomAvailabilityEditor({
  enabled,
  onEnabledChange,
  schedule,
  onScheduleChange,
}: ServiceCustomAvailabilityEditorProps) {
  const { colors } = useTheme();
  const windows = getWindows(schedule);
  const otherRules = schedule.rules.filter((r) => r.kind !== 'weekly');
  const specificDateRules = schedule.rules.filter(
    (r): r is SpecificDatesRule => r.kind === 'specific_dates',
  );
  const dateRangeRules = schedule.rules.filter(
    (r): r is DateRangePatternRule => r.kind === 'date_range_pattern',
  );

  const writeWindows = (nextWindows: ServiceWorkingHours) => {
    const weekly: ServiceCustomRule = {
      id: findWeeklyRule(schedule)?.id ?? newRuleId(),
      kind: 'weekly',
      windows: nextWindows,
    };
    onScheduleChange({ version: 2, rules: [weekly, ...otherRules] });
  };

  const setDayRanges = (key: string, ranges: ServiceTimeRange[]) => {
    const next = { ...windows };
    if (ranges.length === 0) {
      delete next[key];
    } else {
      next[key] = ranges;
    }
    writeWindows(next);
  };

  return (
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        <View style={styles.toggleText}>
          <Text variant="overline" tone="muted">
            This service&apos;s schedule
          </Text>
          <Text variant="caption" tone="muted">
            Only turn on if this service should be bookable for less time than its calendars are open
            (e.g. evening-only). Final availability is the overlap of venue hours, each calendar, and
            this schedule.
          </Text>
        </View>
        <Switch value={enabled} onValueChange={onEnabledChange} />
      </View>

      {enabled ? (
        <>
          <Text variant="overline" tone="muted">
            Weekly hours
          </Text>
          {DAYS.map(({ key, label }) => {
            const ranges = windows[key] ?? [];
            const open = ranges.length > 0;
            return (
              <View key={key} style={[styles.dayBlock, { borderBottomColor: colors.border }]}>
                <View style={styles.dayHeader}>
                  <Text variant="bodyMedium" style={styles.dayLabel}>
                    {label}
                  </Text>
                  <Switch
                    value={open}
                    onValueChange={(next) => setDayRanges(key, next ? [{ ...DEFAULT_RANGE }] : [])}
                    accessibilityLabel={`${label} available`}
                  />
                </View>

                {open
                  ? ranges.map((range, index) => (
                      <View key={index} style={styles.periodRow}>
                        <TimeStepper
                          label={`${label} start`}
                          value={range.start}
                          onChange={(start) =>
                            setDayRanges(
                              key,
                              ranges.map((r, i) => (i === index ? { ...r, start } : r)),
                            )
                          }
                        />
                        <Text variant="caption" tone="muted">
                          to
                        </Text>
                        <TimeStepper
                          label={`${label} end`}
                          value={range.end}
                          onChange={(end) =>
                            setDayRanges(
                              key,
                              ranges.map((r, i) => (i === index ? { ...r, end } : r)),
                            )
                          }
                        />
                        {ranges.length > 1 ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${label} window`}
                            onPress={() =>
                              setDayRanges(
                                key,
                                ranges.filter((_, i) => i !== index),
                              )
                            }
                            style={({ pressed }) => [styles.removeBtn, { opacity: pressed ? 0.5 : 1 }]}>
                            <Text variant="title" tone="danger">
                              ✕
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ))
                  : null}

                {open && ranges.length === 1 ? (
                  <View style={styles.minTouchRow}>
                    <Button
                      label="Add second window"
                      variant="ghost"
                      size="sm"
                      onPress={() =>
                        setDayRanges(key, [...ranges, { start: ranges[0]!.end, end: '21:00' }])
                      }
                    />
                  </View>
                ) : null}
              </View>
            );
          })}

          {/* Specific dates — one-off windows on chosen calendar dates. */}
          <View style={[styles.advancedSection, { borderTopColor: colors.border }]}>
            <Text variant="overline" tone="muted">
              Specific dates
            </Text>
            <Text variant="caption" tone="muted">
              Add bookable windows on individual dates (e.g. a one-off Saturday).
            </Text>
            {specificDateRules.map((rule) => (
              <SpecificDatesRuleEditor
                key={rule.id}
                rule={rule}
                onChange={(next) => onScheduleChange(upsertRule(schedule, next))}
                onRemove={() => onScheduleChange(removeRule(schedule, rule.id))}
              />
            ))}
            <Button
              label="Add specific dates"
              variant="ghost"
              size="sm"
              onPress={() => onScheduleChange(upsertRule(schedule, makeSpecificDatesRule()))}
            />
          </View>

          {/* Date-range pattern — weekday windows applied across a date range. */}
          <View style={[styles.advancedSection, { borderTopColor: colors.border }]}>
            <Text variant="overline" tone="muted">
              Date-range pattern
            </Text>
            <Text variant="caption" tone="muted">
              Apply weekday windows across a start–end range (e.g. summer hours).
            </Text>
            {dateRangeRules.map((rule) => (
              <DateRangePatternRuleEditor
                key={rule.id}
                rule={rule}
                onChange={(next) => onScheduleChange(upsertRule(schedule, next))}
                onRemove={() => onScheduleChange(removeRule(schedule, rule.id))}
              />
            ))}
            <Button
              label="Add date range"
              variant="ghost"
              size="sm"
              onPress={() => onScheduleChange(upsertRule(schedule, makeDateRangePatternRule()))}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Advanced rule editors (specific_dates + date_range_pattern)
// ---------------------------------------------------------------------------

const WEEKDAY_CHIPS: { dow: number; label: string }[] = [
  { dow: 1, label: 'Mon' },
  { dow: 2, label: 'Tue' },
  { dow: 3, label: 'Wed' },
  { dow: 4, label: 'Thu' },
  { dow: 5, label: 'Fri' },
  { dow: 6, label: 'Sat' },
  { dow: 0, label: 'Sun' },
];

const WEEK_HEADER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ymdToParts(ymd: string): { year: number; month: number } {
  return { year: Number(ymd.slice(0, 4)), month: Number(ymd.slice(5, 7)) };
}

function shiftMonth(anchorYmd: string, delta: number): string {
  const { year, month } = ymdToParts(anchorYmd);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-01`;
}

function monthLabel(anchorYmd: string): string {
  const { year, month } = ymdToParts(anchorYmd);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

type MonthCell = { iso: string; day: number; inMonth: boolean };

/** 6×7 Monday-aligned grid for the month containing `anchorYmd`. */
function buildCells(anchorYmd: string): MonthCell[] {
  const { year, month } = ymdToParts(anchorYmd);
  const first = new Date(year, month - 1, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-aligned (JS Sun=0)
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(year, month - 1, 1 - offset + i);
    cells.push({
      iso: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      day: date.getDate(),
      inMonth: date.getMonth() === month - 1,
    });
  }
  return cells;
}

/** Lightweight multi-select month calendar (no availability markers). */
function MultiDateMonthGrid({
  selected,
  onToggleDate,
  initialAnchor,
}: {
  selected: Set<string>;
  onToggleDate: (ymd: string) => void;
  initialAnchor: string;
}) {
  const { colors } = useTheme();
  const [anchor, setAnchor] = useState(`${initialAnchor.slice(0, 7)}-01`);
  const cells = useMemo(() => buildCells(anchor), [anchor]);

  return (
    <View style={styles.calCard}>
      <View style={styles.monthNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => setAnchor((a) => shiftMonth(a, -1))}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Text variant="title" color={colors.brand}>
            ‹
          </Text>
        </Pressable>
        <Text variant="bodyMedium">{monthLabel(anchor)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => setAnchor((a) => shiftMonth(a, 1))}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Text variant="title" color={colors.brand}>
            ›
          </Text>
        </Pressable>
      </View>
      <View style={styles.weekHeader}>
        {WEEK_HEADER.map((label, index) => (
          <Text key={index} variant="caption" tone="muted" style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((cell) => {
          const isSel = selected.has(cell.iso);
          return (
            <Pressable
              key={cell.iso}
              accessibilityRole="button"
              accessibilityLabel={`${cell.iso}${isSel ? ', selected' : ''}`}
              accessibilityState={{ selected: isSel, disabled: !cell.inMonth }}
              disabled={!cell.inMonth}
              onPress={() => {
                hapticSelect();
                onToggleDate(cell.iso);
              }}
              style={styles.cellWrap}>
              <View
                style={[
                  styles.cell,
                  isSel ? { backgroundColor: colors.brand } : null,
                ]}>
                <Text
                  variant="bodyMedium"
                  color={isSel ? colors.onBrand : cell.inMonth ? colors.text : colors.textMuted}
                  style={cell.inMonth ? undefined : styles.outsideMonth}>
                  {cell.day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Shared start/end window stepper pair used by both advanced editors. */
function RangeRow({
  range,
  onChange,
  onRemove,
}: {
  range: ServiceTimeRange;
  onChange: (next: ServiceTimeRange) => void;
  onRemove?: () => void;
}) {
  return (
    <View style={styles.periodRow}>
      <TimeStepper label="start" value={range.start} onChange={(start) => onChange({ ...range, start })} />
      <Text variant="caption" tone="muted">
        to
      </Text>
      <TimeStepper label="end" value={range.end} onChange={(end) => onChange({ ...range, end })} />
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove window"
          onPress={onRemove}
          style={({ pressed }) => [styles.removeBtn, { opacity: pressed ? 0.5 : 1 }]}>
          <Text variant="title" tone="danger">
            ✕
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SpecificDatesRuleEditor({
  rule,
  onChange,
  onRemove,
}: {
  rule: SpecificDatesRule;
  onChange: (next: SpecificDatesRule) => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  const selected = useMemo(() => new Set(rule.entries.map((e) => e.date)), [rule.entries]);
  const anchor = rule.entries[0]?.date ?? toYmd();

  return (
    <View style={[styles.ruleCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={styles.ruleHeader}>
        <Text variant="bodyMedium">
          {rule.entries.length} date{rule.entries.length === 1 ? '' : 's'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove specific-dates rule"
          onPress={onRemove}
          style={({ pressed }) => [styles.removeBtn, { opacity: pressed ? 0.5 : 1 }]}>
          <Text variant="title" tone="danger">
            ✕
          </Text>
        </Pressable>
      </View>

      <MultiDateMonthGrid
        selected={selected}
        initialAnchor={anchor}
        onToggleDate={(ymd) => onChange(toggleSpecificDate(rule, ymd))}
      />

      {rule.entries.map((entry) => (
        <View key={entry.date} style={styles.entryBlock}>
          <Text variant="caption" tone="secondary">
            {entry.date}
          </Text>
          {entry.ranges.map((range, index) => (
            <RangeRow
              key={index}
              range={range}
              onChange={(next) =>
                onChange(
                  setSpecificDateRanges(
                    rule,
                    entry.date,
                    entry.ranges.map((r, i) => (i === index ? next : r)),
                  ),
                )
              }
              onRemove={
                entry.ranges.length > 1
                  ? () =>
                      onChange(
                        setSpecificDateRanges(
                          rule,
                          entry.date,
                          entry.ranges.filter((_, i) => i !== index),
                        ),
                      )
                  : undefined
              }
            />
          ))}
          <Button
            label="Add window"
            variant="ghost"
            size="sm"
            onPress={() =>
              onChange(
                setSpecificDateRanges(rule, entry.date, [
                  ...entry.ranges,
                  { start: entry.ranges[entry.ranges.length - 1]?.end ?? '09:00', end: '21:00' },
                ]),
              )
            }
          />
        </View>
      ))}
    </View>
  );
}

function DateRangePatternRuleEditor({
  rule,
  onChange,
  onRemove,
}: {
  rule: DateRangePatternRule;
  onChange: (next: DateRangePatternRule) => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  // Select a contiguous start→end by tapping two dates: the first tap sets both
  // ends; the next tap extends to that date (web parity with the range picker).
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const rangeSet = useMemo(() => {
    const set = new Set<string>();
    const [lo, hi] =
      rule.start_date <= rule.end_date
        ? [rule.start_date, rule.end_date]
        : [rule.end_date, rule.start_date];
    const cursor = new Date(Number(lo.slice(0, 4)), Number(lo.slice(5, 7)) - 1, Number(lo.slice(8, 10)));
    const end = new Date(Number(hi.slice(0, 4)), Number(hi.slice(5, 7)) - 1, Number(hi.slice(8, 10)));
    while (cursor <= end) {
      set.add(`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`);
      cursor.setDate(cursor.getDate() + 1);
    }
    return set;
  }, [rule.start_date, rule.end_date]);

  return (
    <View style={[styles.ruleCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={styles.ruleHeader}>
        <Text variant="bodyMedium">
          {rule.start_date} → {rule.end_date}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove date-range rule"
          onPress={onRemove}
          style={({ pressed }) => [styles.removeBtn, { opacity: pressed ? 0.5 : 1 }]}>
          <Text variant="title" tone="danger">
            ✕
          </Text>
        </Pressable>
      </View>

      <Text variant="caption" tone="muted">
        Tap a start date, then an end date.
      </Text>
      <MultiDateMonthGrid
        selected={rangeSet}
        initialAnchor={rule.start_date}
        onToggleDate={(ymd) => {
          if (pendingStart == null) {
            setPendingStart(ymd);
            onChange(setDateRange(rule, ymd, ymd));
          } else {
            onChange(setDateRange(rule, pendingStart, ymd));
            setPendingStart(null);
          }
        }}
      />

      <Text variant="overline" tone="muted">
        Days of week
      </Text>
      <View style={styles.dowRow}>
        {WEEKDAY_CHIPS.map(({ dow, label }) => {
          const on = rule.days_of_week.includes(dow);
          return (
            <Pressable
              key={dow}
              accessibilityRole="button"
              accessibilityLabel={`Toggle ${label}`}
              accessibilityState={{ selected: on }}
              onPress={() => {
                hapticSelect();
                onChange(toggleDayOfWeek(rule, dow));
              }}
              style={({ pressed }) => [
                styles.dowChip,
                {
                  backgroundColor: on ? colors.brand : colors.surface,
                  borderColor: on ? colors.brand : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <Text variant="label" color={on ? colors.onBrand : colors.textSecondary}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text variant="overline" tone="muted">
        Windows
      </Text>
      {rule.ranges.map((range, index) => (
        <RangeRow
          key={index}
          range={range}
          onChange={(next) =>
            onChange(
              setDateRangeRanges(
                rule,
                rule.ranges.map((r, i) => (i === index ? next : r)),
              ),
            )
          }
          onRemove={
            rule.ranges.length > 1
              ? () =>
                  onChange(setDateRangeRanges(rule, rule.ranges.filter((_, i) => i !== index)))
              : undefined
          }
        />
      ))}
      <Button
        label="Add window"
        variant="ghost"
        size="sm"
        onPress={() =>
          onChange(
            setDateRangeRanges(rule, [
              ...rule.ranges,
              { start: rule.ranges[rule.ranges.length - 1]?.end ?? '09:00', end: '21:00' },
            ]),
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.base,
  },
  toggleText: {
    flex: 1,
    gap: spacing.xs,
  },
  dayBlock: {
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.base,
  },
  dayLabel: {
    flex: 1,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  timeStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timeValue: {
    minWidth: 64,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepSymbol: {
    fontFamily: fonts.bold,
    fontSize: 18,
    lineHeight: 22,
  },
  removeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minTouchRow: {
    minHeight: 44,
    justifyContent: 'center',
  },
  // Advanced rule sections (specific dates + date-range pattern)
  advancedSection: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ruleCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  ruleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  entryBlock: {
    gap: spacing.xs,
  },
  dowRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  dowChip: {
    minWidth: 48,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Inline month calendar
  calCard: {
    gap: spacing.xs,
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
    aspectRatio: 1.05,
    padding: 2,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  outsideMonth: {
    opacity: 0.35,
  },
});
