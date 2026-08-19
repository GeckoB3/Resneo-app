import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Text } from '@/components/ui/Text';
import { getDateTimeFormat } from '@/lib/dates/formatters';
import { addDaysToDateStr, addMonthsToDateStr, formatMonthLabel } from '@/lib/dates/venue-dates';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Weeks-ahead quick-pick offsets for staff booking (web parity: +2 … +6). */
const WEEK_OFFSETS = [2, 3, 4, 5, 6] as const;

type Cell = { iso: string; day: number; inMonth: boolean };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 6×7 Monday-aligned grid of cells for the month containing `anchor`. */
function buildMonthCells(anchor: string): Cell[] {
  const [year, month] = anchor.split('-').map(Number);
  const first = new Date(year!, month! - 1, 1);
  // Monday-aligned offset (JS getDay: Sun=0).
  const offset = (first.getDay() + 6) % 7;
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

type MonthDatePickerProps = {
  /** Any date inside the displayed month (YYYY-MM-DD). */
  monthAnchor: string;
  onChangeMonth: (nextAnchor: string) => void;
  today: string;
  selectedDate: string | null;
  onSelectDate: (isoDate: string) => void;
  /**
   * Dates with at least one bookable slot.
   *
   * `null` means "no constraint known" and leaves every date selectable — which
   * is right while LOADING, and was silently also what a FAILED lookup produced.
   * Pass {@link isError} so the two can be told apart: an unmarked grid is a
   * confident-looking answer the app has no basis for.
   */
  availableDates: Set<string> | null;
  isLoading?: boolean;
  /**
   * The month lookup failed. Renders a retry in place of the grid rather than a
   * calendar with nothing marked — the server may have failed closed (503) and
   * has no idea which dates are free, so neither do we.
   */
  isError?: boolean;
  /** Message for the error state — prefer the server's own copy. */
  errorMessage?: string;
  onRetry?: () => void;
  /** Gate "Continue" — false while the selected date has no bookable slots, so
   *  the user can't advance onto an empty "No times available" screen. */
  canContinue?: boolean;
  onContinue: () => void;
  /** Booking source — drives the walk-in "Start Now" shortcut. */
  source?: 'phone' | 'walk-in';
  /** Venue IANA timezone, for computing "today" when starting a walk-in now. */
  timeZone?: string;
  /** Walk-in shortcut — books the appointment at the current time (no slot pick). */
  onStartNow?: (todayIso: string) => void;
  /** Heading copy (default "Choose a date"). */
  title?: string;
  /** Hint under the grid when dates are available (default the service copy). */
  availabilityHint?: string;
  /** Staff quick-pick: show "+2 … +6 wk" jump buttons below the grid (web parity). */
  weekShortcuts?: boolean;
};

/** Today's calendar date (YYYY-MM-DD) in the venue's timezone. */
function venueToday(timeZone: string): string {
  return getDateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Month calendar with availability markers — only dates the engine can fit the
 * chosen service/variant/add-ons are selectable (mirrors the web booking flow).
 */
export function MonthDatePicker({
  monthAnchor,
  onChangeMonth,
  today,
  selectedDate,
  onSelectDate,
  availableDates,
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  canContinue = true,
  onContinue,
  source = 'phone',
  timeZone = 'Europe/London',
  onStartNow,
  title = 'Choose a date',
  availabilityHint = 'Green dates have open times for this service.',
  weekShortcuts = false,
}: MonthDatePickerProps) {
  const { colors } = useTheme();
  const cells = useMemo(() => buildMonthCells(monthAnchor), [monthAnchor]);
  // Quick-pick dates N weeks ahead of today (staff convenience — jump straight
  // to a future week without paging the calendar). Computed from `today` so the
  // offsets respect the venue's timezone.
  const weekJumps = useMemo(
    () => WEEK_OFFSETS.map((weeks) => ({ weeks, iso: addDaysToDateStr(today, weeks * 7) })),
    [today],
  );
  const currentMonth = monthAnchor.slice(0, 7);
  const canGoBack = currentMonth > today.slice(0, 7);
  // Empty-state hint: the month finished loading but no date is bookable.
  const monthHasAvailability =
    !availableDates ||
    cells.some(
      (cell) => cell.inMonth && cell.iso >= today && availableDates.has(cell.iso),
    );
  const showStartNow = source === 'walk-in' && !!onStartNow;

  return (
    <View style={styles.container}>
      <Text variant="heading">{title}</Text>

      {showStartNow ? (
        <Button
          label="Start Now"
          variant="primary"
          fullWidth
          onPress={() => onStartNow?.(venueToday(timeZone))}
        />
      ) : null}

      {/* A failed lookup replaces the grid. Drawing the calendar with nothing
          marked would read as "every date is fine", which is the one thing we
          know we cannot say.

          The walk-in "Start Now" button above stays reachable on purpose: it
          bypasses availability entirely, so a lookup wobble should not stop
          staff starting an appointment now. A date picked BEFORE the failure
          also still allows Continue — the slot step re-checks and has its own
          error state, so that is a second chance rather than a wrong answer. */}
      {isError ? (
        <ErrorState
          title="Couldn't check availability"
          message={errorMessage ?? 'Could not load which dates are free.'}
          onRetry={onRetry}
        />
      ) : (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
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
        <View style={styles.monthLabel}>
          <Text variant="subheading">{formatMonthLabel(monthAnchor)}</Text>
          {isLoading ? <ActivityIndicator size="small" color={colors.brand} /> : null}
        </View>
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
          const isPast = cell.iso < today;
          const available =
            !!availableDates && availableDates.has(cell.iso) && cell.inMonth && !isPast;
          const disabled = !cell.inMonth || isPast || (availableDates !== null && !available);
          const isSelected = cell.iso === selectedDate;
          const isToday = cell.iso === today;
          return (
            <Pressable
              key={cell.iso}
              accessibilityRole="button"
              accessibilityLabel={`${cell.iso}${available ? ', available' : ''}`}
              accessibilityState={{ disabled, selected: isSelected }}
              disabled={disabled}
              onPress={() => {
                hapticSelect();
                onSelectDate(cell.iso);
              }}
              style={styles.cellWrap}>
              {/* Availability is a filled green square (web parity); selection
                  overrides with the brand fill; today keeps an outline. */}
              <View
                style={[
                  styles.cell,
                  available && !isSelected
                    ? { backgroundColor: colors.successSurface }
                    : null,
                  isSelected ? { backgroundColor: colors.brand } : null,
                  isToday && !isSelected
                    ? { borderColor: colors.brand, borderWidth: 1 }
                    : null,
                ]}>
                <Text
                  variant="bodyMedium"
                  color={
                    isSelected
                      ? colors.onBrand
                      : available
                        ? colors.success
                        : disabled
                          ? colors.textMuted
                          : colors.text
                  }
                  style={[
                    !cell.inMonth ? styles.outsideMonth : undefined,
                    available && !isSelected ? styles.availableDay : undefined,
                  ]}>
                  {cell.day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {weekShortcuts ? (
        <View style={styles.shortcuts}>
          {weekJumps.map(({ weeks, iso }) => {
            const isSelected = iso === selectedDate;
            return (
              <Pressable
                key={weeks}
                accessibilityRole="button"
                accessibilityLabel={`In ${weeks} weeks`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  hapticSelect();
                  // Page the calendar to the jumped date's month, then select it.
                  onChangeMonth(iso);
                  onSelectDate(iso);
                }}
                style={({ pressed }) => [
                  styles.shortcut,
                  {
                    backgroundColor: isSelected ? colors.brand : colors.surface,
                    borderColor: isSelected ? colors.brand : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <Text variant="label" color={isSelected ? colors.onBrand : colors.text}>
                  +{weeks} wk
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

        {!isLoading && !monthHasAvailability ? (
          <Text variant="caption" tone="muted" style={styles.hint}>
            No open times this month. Try another month{showStartNow ? ' or start the appointment now' : ''}.
          </Text>
        ) : (
          <Text variant="caption" tone="muted" style={styles.hint}>
            {availabilityHint}
          </Text>
        )}
      </ScrollView>
      )}

      <Button
        label="Continue"
        fullWidth
        onPress={onContinue}
        disabled={!selectedDate || !canContinue}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.sm,
  },
  // The calendar + shortcuts + hint scroll between the pinned heading/walk-in
  // button and the pinned "Continue", so the picker always fits and "Continue"
  // stays reachable on short screens (other wizard steps follow the same shape).
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
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
  monthLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    // Flatter than square so all 6 weeks fit with less scrolling (touch target
    // stays ~38px tall, comfortable for date taps).
    aspectRatio: 1.25,
    padding: 2,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  shortcuts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  shortcut: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 64,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  outsideMonth: {
    opacity: 0.35,
  },
  availableDay: {
    fontWeight: '600',
  },
  hint: {
    textAlign: 'center',
  },
});
