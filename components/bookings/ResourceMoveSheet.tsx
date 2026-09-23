import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MonthDatePicker } from '@/components/booking-wizard/MonthDatePicker';
import { venueLocalTime } from '@/components/booking-wizard/TimeSlotStep';
import { timeToMinutes } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { resourceDurationOptions } from '@/lib/booking/booking-format';
import { calendarDateInTimeZone, formatDayHeading } from '@/lib/dates/venue-dates';
import { formatDurationMinutes } from '@/lib/format';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useResourceOptions } from '@/lib/queries/useBookableOfferings';
import { useMoveResourceBooking } from '@/lib/queries/useBookingMutations';
import { useStaffResourceDay, useStaffResourceMonth } from '@/lib/queries/useBookingMoveOptions';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export type ResourceMoveTarget = {
  bookingId: string;
  guestName: string;
  resourceId: string;
  resourceName?: string | null;
  /** YYYY-MM-DD and HH:mm[:ss]. */
  date: string;
  time: string;
  durationMinutes: number | null;
};

/**
 * Move or resize a resource booking (web `StaffResourceBookingModifyForm` and its
 * slot picker): a length the resource allows, a day with room, and a free start
 * on it, all read with this booking left out so its own slot counts as free.
 * The app's Reschedule let staff type any time, blind to the resource's slots
 * and its allowed lengths.
 */
export function ResourceMoveSheet({
  target,
  onClose,
}: {
  target: ResourceMoveTarget | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const timeZone = venue?.timezone?.trim() || 'Europe/London';
  const today = calendarDateInTimeZone(new Date(), timeZone);
  const move = useMoveResourceBooking(target?.bookingId ?? '');
  const options = useResourceOptions(target ? venue?.id ?? null : null);

  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [mode, setMode] = useState<'form' | 'date'>('form');
  const [duration, setDuration] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [monthAnchor, setMonthAnchor] = useState<string>(today);
  const [time, setTime] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seed from the booking each time a different one opens (render-time reset,
  // no effect, so the first paint is already right).
  if (target && seededFor !== target.bookingId) {
    setSeededFor(target.bookingId);
    setMode('form');
    setDuration(target.durationMinutes);
    setDate(target.date);
    setMonthAnchor(target.date);
    setTime(target.time.slice(0, 5));
    setError(null);
  }

  const resource = (options.data?.resources ?? []).find((r) => r.id === target?.resourceId) ?? null;
  const currentDuration = target?.durationMinutes ?? null;
  const durations = useMemo(() => {
    const list = resource
      ? resourceDurationOptions(
          resource.min_booking_minutes,
          resource.max_booking_minutes,
          resource.slot_interval_minutes,
        )
      : [];
    // The booking's own length stays offered even if the rules changed since.
    if (currentDuration && !list.includes(currentDuration)) {
      list.push(currentDuration);
      list.sort((a, b) => a - b);
    }
    return list;
  }, [resource, currentDuration]);

  const month = useStaffResourceMonth({
    resourceId: target?.resourceId ?? null,
    monthAnchor: mode === 'date' ? monthAnchor : null,
    durationMinutes: duration,
    excludeBookingId: target?.bookingId ?? null,
    enabled: !!target && mode === 'date',
  });
  const day = useStaffResourceDay({
    resourceId: target?.resourceId ?? null,
    date,
    durationMinutes: duration,
    excludeBookingId: target?.bookingId ?? null,
    enabled: !!target && mode === 'form',
  });

  const times = useMemo(() => {
    const slots =
      (day.data?.resources ?? []).find((r) => r.id === target?.resourceId)?.slots ??
      day.data?.resources?.[0]?.slots ??
      [];
    const nowMinutes = date === today ? timeToMinutes(venueLocalTime(timeZone)) : -1;
    const starts = slots
      .map((s) => s.start_time.slice(0, 5))
      .filter((t) => timeToMinutes(t) >= nowMinutes);
    return [...new Set(starts)].sort();
  }, [day.data, target?.resourceId, date, today, timeZone]);

  const isCurrent =
    !!target &&
    date === target.date &&
    time === target.time.slice(0, 5) &&
    duration === target.durationMinutes;
  const timeOffered = time != null && (times.includes(time) || (date === target?.date && time === target?.time.slice(0, 5)));
  const canSave = !!target && !!date && !!time && !!duration && !isCurrent && timeOffered;

  const close = () => {
    setSeededFor(null);
    onClose();
  };

  async function handleSave() {
    if (!canSave || !date || !time || !duration) return;
    setError(null);
    try {
      await move.mutateAsync({ date, time, durationMinutes: duration });
      hapticSuccess();
      toast.success('Booking moved.');
      close();
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not move the booking.');
    }
  }

  return (
    <Sheet visible={!!target} onClose={close} maxHeight="92%" fill={mode === 'date'}>
      {mode === 'date' ? (
        <View style={styles.dateStep}>
          <MonthDatePicker
            monthAnchor={monthAnchor}
            onChangeMonth={setMonthAnchor}
            today={today}
            selectedDate={date}
            onSelectDate={(iso) => {
              setDate(iso);
              setTime(null);
            }}
            availableDates={month.data ? new Set(month.data.available_dates) : null}
            isLoading={month.isLoading}
            isError={month.isError}
            errorMessage={month.error instanceof ApiError ? month.error.message : undefined}
            onRetry={() => void month.refetch()}
            onContinue={() => setMode('form')}
            availabilityHint={`Green dates have room for ${duration ? formatDurationMinutes(duration) : 'this booking'}.`}
          />
        </View>
      ) : (
        <View style={styles.container}>
          <Text variant="overline" tone="muted">
            Move booking
          </Text>
          <Text variant="subheading">{target?.guestName ?? ''}</Text>
          {target ? (
            <Text variant="bodySmall" tone="secondary">
              {`Now: ${target.resourceName ? `${target.resourceName} · ` : ''}${formatDayHeading(target.date)} · ${target.time.slice(0, 5)}${
                target.durationMinutes ? ` · ${formatDurationMinutes(target.durationMinutes)}` : ''
              }`}
            </Text>
          ) : null}

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text variant="label">Length</Text>
            {options.isLoading ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <View style={styles.chips}>
                {durations.map((m) => (
                  <Chip
                    key={m}
                    label={formatDurationMinutes(m)}
                    selected={m === duration}
                    onPress={() => {
                      setDuration(m);
                      setError(null);
                    }}
                  />
                ))}
              </View>
            )}

            <View style={styles.dateRow}>
              <View style={styles.flex1}>
                <Text variant="label">Date</Text>
                <Text variant="bodyMedium">{date ? formatDayHeading(date) : 'Choose a date'}</Text>
              </View>
              <Button
                label="Change"
                variant="secondary"
                size="sm"
                onPress={() => {
                  hapticSelect();
                  setMonthAnchor(date ?? today);
                  setMode('date');
                }}
              />
            </View>

            <Text variant="label">Start time</Text>
            {day.isLoading ? (
              <ActivityIndicator color={colors.brand} />
            ) : day.isError ? (
              <Text variant="bodySmall" color={colors.danger}>
                {day.error instanceof ApiError ? day.error.message : 'Could not load the free times.'}
              </Text>
            ) : times.length === 0 ? (
              <Text variant="bodySmall" tone="secondary">
                No free start times on this day for this length. Choose another day or length.
              </Text>
            ) : (
              <View style={styles.chips}>
                {times.map((t) => {
                  const now = !!target && date === target.date && t === target.time.slice(0, 5);
                  return (
                    <Pressable
                      key={t}
                      accessibilityRole="button"
                      accessibilityState={{ selected: t === time }}
                      accessibilityLabel={now ? `${t}, current time` : t}
                      onPress={() => {
                        hapticSelect();
                        setTime(t);
                        setError(null);
                      }}
                      style={({ pressed }) => [
                        styles.timeChip,
                        {
                          backgroundColor: t === time ? colors.brand : colors.surface,
                          borderColor: t === time ? colors.brand : colors.border,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}>
                      <Text variant="label" color={t === time ? colors.onBrand : colors.text}>
                        {now ? `${t} · now` : t}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>

          {error ? (
            <Text variant="bodySmall" color={colors.danger}>
              {error}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <View style={styles.flex1}>
              <Button label="Cancel" variant="secondary" fullWidth onPress={close} />
            </View>
            <View style={styles.flex1}>
              <Button
                label="Move booking"
                fullWidth
                disabled={!canSave}
                loading={move.isPending}
                onPress={() => void handleSave()}
              />
            </View>
          </View>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  dateStep: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  scroll: {
    maxHeight: 460,
  },
  scrollContent: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  timeChip: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  flex1: {
    flex: 1,
  },
});
