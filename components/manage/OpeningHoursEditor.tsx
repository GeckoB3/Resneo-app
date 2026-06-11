import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { OpeningHours, OpeningHoursDay, OpeningHoursPeriod } from '@/types/venue';

const DAYS: { key: '0' | '1' | '2' | '3' | '4' | '5' | '6'; label: string }[] = [
  { key: '1', label: 'Monday' },
  { key: '2', label: 'Tuesday' },
  { key: '3', label: 'Wednesday' },
  { key: '4', label: 'Thursday' },
  { key: '5', label: 'Friday' },
  { key: '6', label: 'Saturday' },
  { key: '0', label: 'Sunday' },
];

const STEP_MINUTES = 15;
const DEFAULT_PERIOD: OpeningHoursPeriod = { open: '09:00', close: '17:00' };

function isOpen(day: OpeningHoursDay | undefined): day is { closed?: false; periods: OpeningHoursPeriod[] } {
  return !!day && !('closed' in day && day.closed === true) && 'periods' in day && day.periods.length > 0;
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

type OpeningHoursEditorProps = {
  value: OpeningHours;
  onChange: (next: OpeningHours) => void;
  /** Read-only render for non-admin staff. */
  editable?: boolean;
};

/**
 * Weekly opening-hours editor — per-day open/closed switch with 1–2 service
 * periods, 15-minute steppers and a "Copy to all open days" shortcut.
 * Pure controlled component (mockable).
 */
export function OpeningHoursEditor({ value, onChange, editable = true }: OpeningHoursEditorProps) {
  const { colors } = useTheme();

  const setDay = (key: (typeof DAYS)[number]['key'], day: OpeningHoursDay) => {
    onChange({ ...value, [key]: day });
  };

  const setPeriod = (
    key: (typeof DAYS)[number]['key'],
    periods: OpeningHoursPeriod[],
    index: number,
    period: OpeningHoursPeriod,
  ) => {
    const next = periods.map((p, i) => (i === index ? period : p));
    setDay(key, { periods: next });
  };

  /** Copy this day's periods to every other currently-open day. */
  const copyToAllOpenDays = (
    sourceKey: (typeof DAYS)[number]['key'],
    sourcePeriods: OpeningHoursPeriod[],
  ) => {
    const updated = { ...value };
    for (const { key } of DAYS) {
      if (key === sourceKey) continue;
      const day = value[key];
      if (isOpen(day)) {
        updated[key] = { periods: sourcePeriods.map((p) => ({ ...p })) };
      }
    }
    hapticSelect();
    onChange(updated);
  };

  // Whether there is at least one OTHER open day (for the copy button visibility).
  const openDayKeys = DAYS.filter(({ key }) => isOpen(value[key])).map((d) => d.key);

  return (
    <View style={styles.container}>
      {DAYS.map(({ key, label }) => {
        const day = value[key];
        const open = isOpen(day);
        const periods = open ? day.periods : [];
        const otherOpenDays = openDayKeys.filter((k) => k !== key);
        return (
          <View key={key} style={[styles.dayBlock, { borderBottomColor: colors.border }]}>
            <View style={styles.dayHeader}>
              <Text variant="bodyMedium" style={styles.dayLabel}>
                {label}
              </Text>
              {!editable ? (
                <Text variant="bodySmall" tone="secondary">
                  {open ? periods.map((p) => `${p.open}–${p.close}`).join(', ') : 'Closed'}
                </Text>
              ) : (
                <Switch
                  value={open}
                  onValueChange={(next) =>
                    setDay(key, next ? { periods: [DEFAULT_PERIOD] } : { closed: true })
                  }
                  accessibilityLabel={`${label} open`}
                />
              )}
            </View>

            {editable && open
              ? periods.map((period, index) => (
                  <View key={index} style={styles.periodRow}>
                    <TimeStepper
                      label={`${label} opening time`}
                      value={period.open}
                      onChange={(o) => setPeriod(key, periods, index, { ...period, open: o })}
                    />
                    <Text variant="caption" tone="muted">
                      to
                    </Text>
                    <TimeStepper
                      label={`${label} closing time`}
                      value={period.close}
                      onChange={(close) => setPeriod(key, periods, index, { ...period, close })}
                    />
                    {periods.length > 1 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${label} period`}
                        onPress={() =>
                          setDay(key, { periods: periods.filter((_, i) => i !== index) })
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

            {editable && open && periods.length === 1 ? (
              <View style={styles.minTouchRow}>
                <Button
                  label="Add second period"
                  variant="ghost"
                  size="sm"
                  onPress={() =>
                    setDay(key, {
                      periods: [...periods, { open: periods[0]!.close, close: '21:00' }],
                    })
                  }
                />
              </View>
            ) : null}

            {/* Copy to all open days — only shown when at least one other day is open */}
            {editable && open && otherOpenDays.length > 0 ? (
              <View style={styles.minTouchRow}>
                <Button
                  label="Copy to all open days"
                  variant="ghost"
                  size="sm"
                  onPress={() => copyToAllOpenDays(key, periods)}
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
    minWidth: 64, // Increased from 52 — prevents clipping of '23:45' on small fonts.
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
  /** Ensures ghost buttons meet the 44pt touch target. */
  minTouchRow: {
    minHeight: 44,
    justifyContent: 'center',
  },
});
