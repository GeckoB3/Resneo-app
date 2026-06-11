import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useAnyPractitionerAvailability,
  useAppointmentAvailability,
} from '@/lib/queries/useAppointmentAvailability';
import { useJoinWaitlist } from '@/lib/queries/useJoinWaitlist';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AppointmentSlot } from '@/types/appointment-availability';
import { ANY_AVAILABLE_PRACTITIONER_ID } from '@/types/appointment-catalog';

const DURATION_PRESETS = [30, 45, 60, 90, 120];

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
  /** Base duration (service/variant) — labels the "Default" preset. */
  baseDurationMinutes: number;
  /** Staff override, or null for the service default. */
  durationMinutes: number | null;
  onChangeDuration: (minutes: number | null) => void;
  /** Venue id — needed for the waitlist-join fallback. */
  venueId: string;
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
  baseDurationMinutes,
  durationMinutes,
  onChangeDuration,
  venueId,
  selectedSlot,
  onSelectSlot,
  onContinue,
}: TimeSlotStepProps) {
  const { colors } = useTheme();
  const isAnyAvailable = practitionerId === ANY_AVAILABLE_PRACTITIONER_ID;
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  const singleQuery = useAppointmentAvailability({
    date,
    serviceId,
    practitionerId,
    ownerVenueId,
    variantId,
    addonIds,
    durationMinutes,
    enabled: !isAnyAvailable,
  });
  const pooledQuery = useAnyPractitionerAvailability({
    date,
    serviceId,
    practitionerIds: candidatePractitionerIds ?? [],
    ownerVenueId,
    variantId,
    addonIds,
    durationMinutes,
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
    // When service_id is absent (unified_scheduling) every slot belongs to this
    // service — the practitioner match above is the correct scoping mechanism.
    return practitionerSlots.filter(
      (slot) => !slot.service_id || slot.service_id === serviceId,
    );
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

      {/* Staff duration override — presets refetch the slot grid. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.durationRow}>
        <Chip
          label={`Default (${baseDurationMinutes}m)`}
          selected={durationMinutes == null}
          onPress={() => onChangeDuration(null)}
        />
        {DURATION_PRESETS.filter((preset) => preset !== baseDurationMinutes).map((preset) => (
          <Chip
            key={preset}
            label={`${preset}m`}
            selected={durationMinutes === preset}
            onPress={() => onChangeDuration(preset)}
          />
        ))}
      </ScrollView>

      {slots.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            title="No times available"
            message="There are no open slots on this date. Pick another day — or add the guest to the waitlist."
          />
          <Button
            label="Join waitlist for this date"
            variant="secondary"
            fullWidth
            onPress={() => setWaitlistOpen(true)}
          />
        </View>
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

      <WaitlistJoinSheet
        open={waitlistOpen}
        onClose={() => setWaitlistOpen(false)}
        venueId={venueId}
        serviceId={serviceId}
        practitionerId={isAnyAvailable ? undefined : practitionerId}
        date={date}
      />
    </View>
  );
}

/** Collects guest details and adds them to the appointment waitlist. */
function WaitlistJoinSheet({
  open,
  onClose,
  venueId,
  serviceId,
  practitionerId,
  date,
}: {
  open: boolean;
  onClose: () => void;
  venueId: string;
  serviceId: string;
  practitionerId?: string;
  date: string;
}) {
  const join = useJoinWaitlist();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    setError(null);
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setError('Name, email and phone are all required for the waitlist.');
      return;
    }
    try {
      await join.mutateAsync({
        venue_id: venueId,
        service_id: serviceId,
        desired_date: date,
        ...(practitionerId ? { practitioner_id: practitionerId } : {}),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        guest_email: email.trim(),
        guest_phone: phone.trim(),
      });
      hapticSuccess();
      onClose();
      Alert.alert('Added to waitlist', 'The guest will be offered a slot if one opens up.');
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not join the waitlist.');
    }
  }

  return (
    <Sheet visible={open} onClose={onClose} maxHeight="88%">
      <View style={styles.waitlistBody}>
        <Text variant="overline" tone="muted">
          Join waitlist
        </Text>
        <View style={styles.waitlistNames}>
          <View style={styles.waitlistNameField}>
            <Input label="First name" value={firstName} onChangeText={setFirstName} />
          </View>
          <View style={styles.waitlistNameField}>
            <Input label="Last name" value={lastName} onChangeText={setLastName} />
          </View>
        </View>
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Input label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        {error ? (
          <Text variant="bodySmall" tone="danger">
            {error}
          </Text>
        ) : null}
        <View style={styles.waitlistActions}>
          <Button label="Cancel" variant="secondary" style={styles.waitlistBtn} onPress={onClose} />
          <Button
            label="Add to waitlist"
            style={styles.waitlistBtn}
            loading={join.isPending}
            onPress={() => void handleJoin()}
          />
        </View>
      </View>
    </Sheet>
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
  durationRow: {
    gap: spacing.sm,
    paddingRight: spacing.base,
  },
  emptyWrap: {
    flex: 1,
    gap: spacing.md,
  },
  waitlistBody: {
    gap: spacing.md,
  },
  waitlistNames: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  waitlistNameField: {
    flex: 1,
  },
  waitlistActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  waitlistBtn: {
    flex: 1,
  },
});
