import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { timeToMinutes } from '@/components/calendar/grid-layout';
import { venueLocalTime } from '@/components/booking-wizard/TimeSlotStep';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { calendarDateInTimeZone, formatDayHeading } from '@/lib/dates/venue-dates';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useMoveClassBooking } from '@/lib/queries/useBookingMutations';
import { useStaffClassSessions } from '@/lib/queries/useBookingMoveOptions';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ClassAvailabilitySlot } from '@/types/booking-offerings';

export type ClassMoveTarget = {
  bookingId: string;
  guestName: string;
  classInstanceId: string;
  partySize: number;
  /** A linked venue's booking: its sessions are read from that venue. */
  ownerVenueId?: string | null;
};

/**
 * Move a class booking to another session of the same class (web
 * `StaffClassModifyInstancePicker`). The server moves a class booking only by
 * session (`target_class_instance_id`), so a date and time picker cannot do it:
 * the app's Reschedule sent one and was refused ("Pick another session of this
 * class…"). Offered: the same class, not this session, not started, with room
 * for the whole booking.
 */
export function ClassSessionMoveSheet({
  target,
  onClose,
}: {
  target: ClassMoveTarget | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const timeZone = venue?.timezone?.trim() || 'Europe/London';
  const today = calendarDateInTimeZone(new Date(), timeZone);
  const sessions = useStaffClassSessions(today, {
    ownerVenueId: target?.ownerVenueId ?? null,
    enabled: !!target,
  });
  const move = useMoveClassBooking(target?.bookingId ?? '');
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const instances = sessions.data?.instances;
  const current = useMemo(
    () => (instances ?? []).find((i) => i.instance_id === target?.classInstanceId) ?? null,
    [instances, target?.classInstanceId],
  );
  const options = useMemo(() => {
    if (!current || !target) return [];
    const nowMinutes = timeToMinutes(venueLocalTime(timeZone));
    return (instances ?? [])
      .filter(
        (i) =>
          i.class_type_id === current.class_type_id &&
          i.instance_id !== current.instance_id &&
          i.remaining >= Math.max(1, target.partySize) &&
          (i.instance_date > today ||
            (i.instance_date === today && timeToMinutes(i.start_time) > nowMinutes)),
      )
      .sort((a, b) =>
        a.instance_date === b.instance_date
          ? a.start_time.localeCompare(b.start_time)
          : a.instance_date.localeCompare(b.instance_date),
      );
  }, [instances, current, target, today, timeZone]);

  const byDay = useMemo(() => {
    const groups: { date: string; items: ClassAvailabilitySlot[] }[] = [];
    for (const item of options) {
      const last = groups[groups.length - 1];
      if (last && last.date === item.instance_date) last.items.push(item);
      else groups.push({ date: item.instance_date, items: [item] });
    }
    return groups;
  }, [options]);

  const close = () => {
    setChosen(null);
    setError(null);
    onClose();
  };

  async function handleMove() {
    if (!chosen || !target) return;
    setError(null);
    try {
      await move.mutateAsync(chosen);
      hapticSuccess();
      toast.success('Booking moved to the new session.');
      close();
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not move the booking.');
    }
  }

  return (
    <Sheet visible={!!target} onClose={close} maxHeight="90%">
      <View style={styles.container}>
        <Text variant="overline" tone="muted">
          Move to another session
        </Text>
        <Text variant="subheading">{target?.guestName ?? ''}</Text>
        {current ? (
          <Text variant="bodySmall" tone="secondary">
            {`Now: ${current.class_name} · ${formatDayHeading(current.instance_date)} · ${current.start_time.slice(0, 5)}`}
          </Text>
        ) : null}

        {sessions.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : sessions.isError ? (
          <ErrorState
            message={
              sessions.error instanceof ApiError ? sessions.error.message : 'Could not load the sessions.'
            }
            onRetry={() => void sessions.refetch()}
          />
        ) : !current ? (
          <Text variant="bodySmall" tone="secondary">
            This booking’s session is not in the next 90 days, so it cannot be matched to a class to move it within.
            Cancel it and make a new booking instead.
          </Text>
        ) : options.length === 0 ? (
          <Text variant="bodySmall" tone="secondary">
            {`No other ${current.class_name} session in the next 90 days has room for ${
              target && target.partySize > 1 ? `${target.partySize} people` : 'this booking'
            }.`}
          </Text>
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {byDay.map((group) => (
              <View key={group.date} style={styles.day}>
                <Text variant="label" tone="secondary">
                  {formatDayHeading(group.date)}
                </Text>
                {group.items.map((item) => {
                  const selected = item.instance_id === chosen;
                  const label = `${item.start_time.slice(0, 5)} · ${item.remaining} of ${item.capacity} places left${
                    item.instructor_name ? ` · ${item.instructor_name}` : ''
                  }`;
                  return (
                    <Pressable
                      key={item.instance_id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${formatDayHeading(group.date)} ${label}`}
                      onPress={() => {
                        hapticSelect();
                        setChosen(item.instance_id);
                        setError(null);
                      }}
                      style={({ pressed }) => [
                        styles.row,
                        {
                          borderColor: selected ? colors.brand : colors.border,
                          backgroundColor: selected ? colors.brandSubtle : colors.surface,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}>
                      <Text variant="bodyMedium">{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        )}

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
              disabled={!chosen}
              loading={move.isPending}
              onPress={() => void handleMove()}
            />
          </View>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  center: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  list: {
    maxHeight: 420,
  },
  listContent: {
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  day: {
    gap: spacing.xs,
  },
  row: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
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
