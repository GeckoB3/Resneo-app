import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useAnyPractitionerAvailability,
  useAppointmentAvailability,
} from '@/lib/queries/useAppointmentAvailability';
import { useJoinWaitlist } from '@/lib/queries/useJoinWaitlist';
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
  /** Staff duration override (minutes) chosen at the service/variant step, or
   *  null for the service default. Scopes the availability query. */
  durationMinutes: number | null;
  /** Venue id — needed for the waitlist-join fallback. */
  venueId: string;
  selectedSlot: AppointmentSlot | null;
  onSelectSlot: (slot: AppointmentSlot) => void;
  onContinue: () => void;
  /** Walk-in flow on today's date — offer a "Start now" shortcut to the nearest slot. */
  startNow?: boolean;
  /** Venue IANA timezone, for computing the current local time on "Start now". */
  timeZone?: string;
  /** Minimum lead time (hours) — same-day slots earlier than now + this are hidden. */
  minBookingNoticeHours?: number;
  /** When false, today is not bookable: same-day slots are all hidden. */
  allowSameDayBooking?: boolean;
};

export function formatSlotTime(startTime: string): string {
  const [hours, minutes] = startTime.slice(0, 5).split(':');
  const hour = Number(hours);
  const suffix = hour >= 12 ? 'pm' : 'am';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minutes}${suffix}`;
}

/** First 5 chars (HH:mm) — pooled "any available" rows may repeat a clock time. */
function slotStartKey(startTime: string): string {
  return startTime.trim().slice(0, 5);
}

/**
 * One button per clock time: pooled "any available" availability can list the
 * same time under several practitioners, so collapse to the first practitioner
 * per start time (the create still targets the kept slot's real practitioner).
 */
export function dedupeSlotsByStartTime(slots: AppointmentSlot[]): AppointmentSlot[] {
  const seen = new Set<string>();
  const out: AppointmentSlot[] = [];
  for (const slot of slots) {
    const key = slotStartKey(slot.start_time);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(slot);
  }
  return out;
}

export type SlotPeriod = { title: string; slots: AppointmentSlot[] };

/** Split slots into Morning (<12) / Afternoon (12–16) / Evening (17+) sections. */
export function groupSlotsByPeriod(slots: AppointmentSlot[]): SlotPeriod[] {
  const morning: AppointmentSlot[] = [];
  const afternoon: AppointmentSlot[] = [];
  const evening: AppointmentSlot[] = [];
  for (const slot of slots) {
    const hour = Number(slot.start_time.slice(0, 2));
    if (hour < 12) morning.push(slot);
    else if (hour < 17) afternoon.push(slot);
    else evening.push(slot);
  }
  return [
    { title: 'Morning', slots: morning },
    { title: 'Afternoon', slots: afternoon },
    { title: 'Evening', slots: evening },
  ].filter((period) => period.slots.length > 0);
}

/** Current local time (HH:mm) in the venue timezone. */
export function venueLocalTime(timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

/** Today's calendar date (YYYY-MM-DD) in the venue timezone. */
function venueTodayDate(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Parse HH:mm[:ss] to minutes since midnight (0 on malformed input). */
function startMinutes(startTime: string): number {
  const [h, m] = startTime.slice(0, 5).split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
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
  durationMinutes,
  venueId,
  selectedSlot,
  onSelectSlot,
  onContinue,
  startNow = false,
  timeZone = 'Europe/London',
  minBookingNoticeHours = 1,
  allowSameDayBooking = true,
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

  // For pooled "any available" rows, collapse to one button per clock time so
  // the same time under multiple practitioners doesn't show twice.
  const slots = useMemo(
    () => (isAnyAvailable ? dedupeSlotsByStartTime(pooledQuery.slots) : singleSlots),
    [isAnyAvailable, pooledQuery.slots, singleSlots],
  );

  // Same-day cutoff (web parity): the staff availability endpoint deliberately
  // returns past slots (skipPastSlotFilter), so we hide today's slots that are
  // in the past or inside the minimum-notice window here. Future dates show all.
  const isToday = date === venueTodayDate(timeZone);
  const nowMinutes = startMinutes(venueLocalTime(timeZone));
  const noticeMinutes = Math.max(0, minBookingNoticeHours) * 60;
  const visibleSlots = useMemo(() => {
    if (!isToday) return slots;
    if (!allowSameDayBooking) return [];
    const cutoff = nowMinutes + noticeMinutes;
    return slots.filter((slot) => startMinutes(slot.start_time) >= cutoff);
  }, [slots, isToday, allowSameDayBooking, nowMinutes, noticeMinutes]);

  const periods = useMemo(() => groupSlotsByPeriod(visibleSlots), [visibleSlots]);

  // One-shot: when arriving from a calendar empty-slot tap, pre-select the
  // matching slot once availability loads (no-op if that time isn't free).
  const appliedPreferredTime = useRef(false);
  useEffect(() => {
    if (appliedPreferredTime.current || !preferredTime || selectedSlot) {
      return;
    }
    const match = visibleSlots.find((slot) => slot.start_time.slice(0, 5) === preferredTime);
    if (match) {
      appliedPreferredTime.current = true;
      onSelectSlot(match);
    }
  }, [visibleSlots, preferredTime, selectedSlot, onSelectSlot]);

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

  // Walk-in "Start now": pick the earliest slot at/after the venue's current
  // local time (falls back to the first slot of the day if all have passed).
  const handleStartNow = () => {
    if (slots.length === 0) return;
    const now = venueLocalTime(timeZone);
    const match =
      slots.find((slot) => slot.start_time.slice(0, 5) >= now) ?? slots[0];
    if (match) {
      hapticSelect();
      onSelectSlot(match);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text variant="heading">Choose a time</Text>
        {isFetching ? <ActivityIndicator color={colors.brand} /> : null}
      </View>

      {startNow && slots.length > 0 ? (
        <Button label="Start now" variant="secondary" fullWidth onPress={handleStartNow} />
      ) : null}

      {visibleSlots.length === 0 ? (
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
        <ScrollView contentContainerStyle={styles.periods} showsVerticalScrollIndicator={false}>
          {periods.map((period) => (
            <View key={period.title} style={styles.period}>
              <Text variant="label" tone="secondary">
                {period.title}
              </Text>
              <View style={styles.grid}>
                {period.slots.map((slot) => {
                  const isSelected =
                    selectedSlot?.start_time === slot.start_time &&
                    selectedSlot.practitioner_id === slot.practitioner_id;
                  return (
                    <Pressable
                      key={`${slot.practitioner_id}-${slot.start_time}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => {
                        hapticSelect();
                        onSelectSlot(slot);
                      }}
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
              </View>
            </View>
          ))}
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
export function WaitlistJoinSheet({
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
  const [joined, setJoined] = useState(false);

  const handleClose = () => {
    setJoined(false);
    onClose();
  };

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
      // Confirm INSIDE the sheet (Alert.alert is a no-op on web, and firing it
      // after onClose left no visible feedback at all).
      setJoined(true);
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not join the waitlist.');
    }
  }

  if (joined) {
    return (
      <Sheet visible={open} onClose={handleClose}>
        <View style={styles.waitlistBody}>
          <Text variant="subheading">Added to waitlist</Text>
          <Text variant="bodySmall" tone="muted">
            The guest will be offered a slot if one opens up.
          </Text>
          <Button label="Done" fullWidth onPress={handleClose} />
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet visible={open} onClose={handleClose} maxHeight="88%">
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
          <Button label="Cancel" variant="secondary" style={styles.waitlistBtn} onPress={handleClose} />
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
  periods: {
    gap: spacing.lg,
    paddingBottom: spacing.base,
  },
  period: {
    gap: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
