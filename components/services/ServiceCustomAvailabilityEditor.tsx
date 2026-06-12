import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
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
 * Validate the weekly windows the editor can produce: each window must have
 * end > start. Returns the first error string, or null when valid. (Non-weekly
 * rules are server-authored and assumed valid.)
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
  return null;
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
  const advancedRuleCount = otherRules.length;

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
          {advancedRuleCount > 0 ? (
            <Text variant="caption" tone="muted">
              {advancedRuleCount} advanced rule{advancedRuleCount === 1 ? '' : 's'} (specific dates /
              date ranges) set on the web dashboard are kept and still apply.
            </Text>
          ) : null}

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
        </>
      ) : null}
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
});
