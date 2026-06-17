import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { ApiError } from '@/lib/api/client';
import { calendarDateInTimeZone } from '@/lib/dates/venue-dates';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useCreateClassRule, useUpdateClassRule } from '@/lib/queries/useClassesManage';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ManagedClassTimetableEntry, ManagedClassType } from '@/types/classes-manage';

/** Create a new weekly rule for a class type, or edit an existing rule. */
export type ClassRuleTarget =
  | { mode: 'create'; classType: ManagedClassType }
  | { mode: 'edit'; classType: ManagedClassType; rule: ManagedClassTimetableEntry };

type ClassRuleSheetProps = {
  target: ClassRuleTarget | null;
  onClose: () => void;
  onSaved?: () => void;
};

/** Mon-first weekday ordering for the chip row; value is the API's 0=Sun…6=Sat. */
const WEEKDAYS: { value: number; short: string }[] = [
  { value: 1, short: 'Mon' },
  { value: 2, short: 'Tue' },
  { value: 3, short: 'Wed' },
  { value: 4, short: 'Thu' },
  { value: 5, short: 'Fri' },
  { value: 6, short: 'Sat' },
  { value: 0, short: 'Sun' },
];

/** interval_weeks is validated 1–8 by `timetableEntrySchema`. */
const WEEK_INTERVALS = [1, 2, 3, 4, 5, 6, 7, 8];

type EndCondition = 'never' | 'until' | 'count';

/** "HH:mm[:ss]" → minutes since midnight (tolerant of seconds). */
function startTimeToMinutes(time: string): number {
  return timeToMinutes(time.slice(0, 5));
}

/**
 * Create/edit a recurring weekly rule (a `class_timetable` row). The rule is
 * inert until sessions are generated from it ("Generate sessions" on the
 * manager). Mirrors the web "Edit weekly rule" dialog.
 *
 * @see _reference/Resneo/src/app/dashboard/class-timetable/ClassTimetableView.tsx
 */
export function ClassRuleSheet({ target, onClose, onSaved }: ClassRuleSheetProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const timeZone = venue?.timezone ?? 'Europe/London';
  const today = useMemo(() => calendarDateInTimeZone(new Date(), timeZone), [timeZone]);

  const create = useCreateClassRule();
  const update = useUpdateClassRule();

  const editingRule = target?.mode === 'edit' ? target.rule : null;
  const classType = target?.classType ?? null;

  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startMinutes, setStartMinutes] = useState(9 * 60);
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [endCondition, setEndCondition] = useState<EndCondition>('never');
  const [endDate, setEndDate] = useState(today);
  const [occurrences, setOccurrences] = useState('12');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when target changes
    setError(null);
    if (target.mode === 'edit') {
      const rule = target.rule;
      setDayOfWeek(rule.day_of_week);
      setStartMinutes(startTimeToMinutes(rule.start_time));
      setIntervalWeeks(rule.interval_weeks ?? 1);
      const hasEnd =
        rule.recurrence_end_date != null && String(rule.recurrence_end_date).trim() !== '';
      const hasCount = rule.total_occurrences != null && rule.total_occurrences > 0;
      setEndCondition(hasEnd ? 'until' : hasCount ? 'count' : 'never');
      setEndDate(hasEnd ? String(rule.recurrence_end_date).slice(0, 10) : today);
      setOccurrences(hasCount ? String(rule.total_occurrences) : '12');
    } else {
      setDayOfWeek(1);
      setStartMinutes(9 * 60);
      setIntervalWeeks(1);
      setEndCondition('never');
      setEndDate(today);
      setOccurrences('12');
    }
    // `today` excluded: re-seed only when the target changes, not on clock tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const saving = create.isPending || update.isPending;
  const startTime = minutesToTime(startMinutes);

  async function handleSave() {
    if (!classType) return;
    setError(null);

    let recurrenceEndDate: string | null = null;
    let totalOccurrences: number | null = null;
    if (endCondition === 'until') {
      recurrenceEndDate = endDate;
    } else if (endCondition === 'count') {
      const n = Number(occurrences);
      if (!Number.isInteger(n) || n < 1) {
        setError('Enter how many sessions to generate (at least 1).');
        return;
      }
      totalOccurrences = n;
    }

    try {
      if (editingRule) {
        await update.mutateAsync({
          id: editingRule.id,
          day_of_week: dayOfWeek,
          start_time: startTime,
          interval_weeks: intervalWeeks,
          recurrence_type: 'weekly',
          recurrence_end_date: recurrenceEndDate,
          total_occurrences: totalOccurrences,
          is_active: true,
        });
      } else {
        await create.mutateAsync({
          class_type_id: classType.id,
          day_of_week: dayOfWeek,
          start_time: startTime,
          interval_weeks: intervalWeeks,
          recurrence_type: 'weekly',
          recurrence_end_date: recurrenceEndDate,
          total_occurrences: totalOccurrences,
          is_active: true,
        });
      }
      hapticSuccess();
      toast.success(editingRule ? 'Weekly rule updated.' : 'Weekly rule added.');
      onSaved?.();
      onClose();
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save the rule.');
    }
  }

  return (
    <Sheet visible={target !== null} onClose={onClose} maxHeight="92%">
      <View style={styles.bodyWrap}>
        <Text variant="overline" tone="muted">
          {editingRule ? 'Edit weekly rule' : 'New weekly rule'}
        </Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled">
          {classType ? (
            <View
              style={[
                styles.classChip,
                { borderColor: colors.border, backgroundColor: colors.surface },
              ]}>
              <View style={[styles.dot, { backgroundColor: classType.colour ?? colors.brand }]} />
              <View style={styles.classChipText}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {classType.name}
                </Text>
                <Text variant="caption" tone="muted">
                  Sessions are created when you generate from rules.
                </Text>
              </View>
            </View>
          ) : null}

          <Text variant="label" tone="secondary">
            Day of week
          </Text>
          <View style={styles.chipRow}>
            {WEEKDAYS.map((day) => {
              const selected = day.value === dayOfWeek;
              return (
                <Pressable
                  key={day.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setDayOfWeek(day.value)}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: selected ? colors.brand : colors.surface,
                      borderColor: selected ? colors.brand : colors.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}>
                  <Text
                    variant="label"
                    color={selected ? colors.onBrand : colors.textSecondary}>
                    {day.short}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.pickerRow}>
            <Text variant="label" tone="secondary">
              Start time
            </Text>
            <TimePickerField
              value={startMinutes}
              onChange={setStartMinutes}
              accessibilityLabel="Rule start time"
            />
          </View>

          <Text variant="label" tone="secondary">
            Every
          </Text>
          <View style={styles.chipRow}>
            {WEEK_INTERVALS.map((n) => {
              const selected = n === intervalWeeks;
              return (
                <Pressable
                  key={n}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setIntervalWeeks(n)}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: selected ? colors.brand : colors.surface,
                      borderColor: selected ? colors.brand : colors.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}>
                  <Text
                    variant="label"
                    color={selected ? colors.onBrand : colors.textSecondary}>
                    {n === 1 ? 'week' : `${n} wks`}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text variant="label" tone="secondary">
            End recurrence
          </Text>
          <Segmented
            options={[
              { value: 'never', label: 'Ongoing' },
              { value: 'until', label: 'Until date' },
              { value: 'count', label: 'After N' },
            ]}
            value={endCondition}
            onChange={setEndCondition}
          />
          {endCondition === 'until' ? (
            <View style={styles.pickerRow}>
              <Text variant="label" tone="secondary">
                Until
              </Text>
              <DatePickerField
                value={endDate}
                onChange={setEndDate}
                accessibilityLabel="Recurrence end date"
              />
            </View>
          ) : null}
          {endCondition === 'count' ? (
            <Input
              label="Number of sessions"
              helper="Generation stops after this many sessions for this rule."
              value={occurrences}
              onChangeText={(v) => setOccurrences(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
            />
          ) : null}

          {error ? (
            <Text variant="bodySmall" tone="danger">
              {error}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} />
          <Button
            label="Save"
            style={styles.flex1}
            loading={saving}
            onPress={() => void handleSave()}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bodyWrap: {
    gap: spacing.md,
  },
  scroll: {
    flexGrow: 0,
  },
  body: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  classChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  classChipText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
});
