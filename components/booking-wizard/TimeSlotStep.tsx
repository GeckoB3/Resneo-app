import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Text } from '@/components/ui/Text';
import { useAppointmentAvailability } from '@/lib/queries/useAppointmentAvailability';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AppointmentSlot } from '@/types/appointment-availability';

type TimeSlotStepProps = {
  date: string;
  serviceId: string;
  practitionerId: string;
  ownerVenueId?: string | null;
  selectedSlot: AppointmentSlot | null;
  onSelectSlot: (slot: AppointmentSlot) => void;
  onContinue: () => void;
};

function formatSlotTime(startTime: string): string {
  const [hours, minutes] = startTime.slice(0, 5).split(':');
  const hour = Number(hours);
  const suffix = hour >= 12 ? 'pm' : 'am';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minutes}${suffix}`;
}

/** Step 3 — available appointment slots for the chosen service and date. */
export function TimeSlotStep({
  date,
  serviceId,
  practitionerId,
  ownerVenueId,
  selectedSlot,
  onSelectSlot,
  onContinue,
}: TimeSlotStepProps) {
  const { colors } = useTheme();
  const availabilityQuery = useAppointmentAvailability({
    date,
    serviceId,
    practitionerId,
    ownerVenueId,
  });

  const slots = useMemo(() => {
    if (!availabilityQuery.data) {
      return [];
    }
    const matchingPractitioner = availabilityQuery.data.practitioners.find(
      (practitioner) => practitioner.id === practitionerId,
    );
    const practitionerSlots = matchingPractitioner?.slots ?? [];
    return practitionerSlots.filter((slot) => slot.service_id === serviceId);
  }, [availabilityQuery.data, practitionerId, serviceId]);

  if (availabilityQuery.isLoading) {
    return <LoadingState message="Loading available times…" />;
  }

  if (availabilityQuery.isError) {
    const message =
      availabilityQuery.error instanceof Error
        ? availabilityQuery.error.message
        : 'Could not load availability.';
    return <ErrorState message={message} onRetry={() => void availabilityQuery.refetch()} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text variant="heading">Choose a time</Text>
        {availabilityQuery.isFetching ? <ActivityIndicator color={colors.brand} /> : null}
      </View>

      {slots.length === 0 ? (
        <EmptyState
          title="No times available"
          message="There are no open slots on this date. Go back and pick another day."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {slots.map((slot) => {
            const isSelected =
              selectedSlot?.start_time === slot.start_time &&
              selectedSlot.practitioner_id === slot.practitioner_id;
            return (
              <Pressable
                key={`${slot.practitioner_id}-${slot.start_time}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => onSelectSlot(slot)}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: isSelected ? colors.brand : colors.surface,
                    borderColor: isSelected ? colors.brand : colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}>
                <Text variant="bodyMedium" color={isSelected ? colors.onBrand : colors.text}>
                  {formatSlotTime(slot.start_time)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <Button label="Continue" fullWidth onPress={onContinue} disabled={!selectedSlot} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.base,
  },
  chip: {
    minHeight: minTouchTarget,
    minWidth: 88,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
