import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Text } from '@/components/ui/Text';
import {
  useAnyPractitionerAvailability,
  useAppointmentAvailability,
} from '@/lib/queries/useAppointmentAvailability';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AppointmentSlot } from '@/types/appointment-availability';
import { ANY_AVAILABLE_PRACTITIONER_ID } from '@/types/appointment-catalog';

type TimeSlotStepProps = {
  date: string;
  serviceId: string;
  /** Real practitioner id, or ANY_AVAILABLE_PRACTITIONER_ID for pooled slots. */
  practitionerId: string;
  /** Real ids backing an "any available" row. */
  candidatePractitionerIds?: string[];
  variantId?: string | null;
  addonIds?: string[];
  ownerVenueId?: string | null;
  /** HH:mm from a calendar empty-slot tap — auto-selects the matching slot once. */
  preferredTime?: string | null;
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

/** Step — available appointment slots for the chosen service/variant/add-ons and date. */
export function TimeSlotStep({
  date,
  serviceId,
  practitionerId,
  candidatePractitionerIds,
  variantId,
  addonIds,
  ownerVenueId,
  preferredTime,
  selectedSlot,
  onSelectSlot,
  onContinue,
}: TimeSlotStepProps) {
  const { colors } = useTheme();
  const isAnyAvailable = practitionerId === ANY_AVAILABLE_PRACTITIONER_ID;

  const singleQuery = useAppointmentAvailability({
    date,
    serviceId,
    practitionerId,
    ownerVenueId,
    variantId,
    addonIds,
    enabled: !isAnyAvailable,
  });
  const pooledQuery = useAnyPractitionerAvailability({
    date,
    serviceId,
    practitionerIds: candidatePractitionerIds ?? [],
    ownerVenueId,
    variantId,
    addonIds,
    enabled: isAnyAvailable,
  });

  const singleSlots = useMemo(() => {
    if (!singleQuery.data) {
      return [];
    }
    const matchingPractitioner = singleQuery.data.practitioners.find(
      (practitioner) => practitioner.id === practitionerId,
    );
    const practitionerSlots = matchingPractitioner?.slots ?? [];
    return practitionerSlots.filter((slot) => slot.service_id === serviceId);
  }, [singleQuery.data, practitionerId, serviceId]);

  const slots = isAnyAvailable ? pooledQuery.slots : singleSlots;

  // One-shot: when arriving from a calendar empty-slot tap, pre-select the
  // matching slot once availability loads (no-op if that time isn't free).
  const appliedPreferredTime = useRef(false);
  useEffect(() => {
    if (appliedPreferredTime.current || !preferredTime || selectedSlot) {
      return;
    }
    const match = slots.find((slot) => slot.start_time.slice(0, 5) === preferredTime);
    if (match) {
      appliedPreferredTime.current = true;
      onSelectSlot(match);
    }
  }, [slots, preferredTime, selectedSlot, onSelectSlot]);

  const isLoading = isAnyAvailable ? pooledQuery.isLoading : singleQuery.isLoading;
  const isFetching = isAnyAvailable ? pooledQuery.isFetching : singleQuery.isFetching;
  const isError = isAnyAvailable ? pooledQuery.isError : singleQuery.isError;
  const errorValue = isAnyAvailable ? pooledQuery.error : singleQuery.error;
  const retry = isAnyAvailable ? pooledQuery.refetch : () => void singleQuery.refetch();

  if (isLoading) {
    return <LoadingState message="Loading available times…" />;
  }

  if (isError) {
    const message =
      errorValue instanceof Error ? errorValue.message : 'Could not load availability.';
    return <ErrorState message={message} onRetry={retry} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text variant="heading">Choose a time</Text>
        {isFetching ? <ActivityIndicator color={colors.brand} /> : null}
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
                {isAnyAvailable ? (
                  <Text
                    variant="caption"
                    color={isSelected ? colors.onBrand : colors.textMuted}
                    numberOfLines={1}>
                    {slot.practitioner_name}
                  </Text>
                ) : null}
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
