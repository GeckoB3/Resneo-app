import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { WaitlistJoinSheet } from '@/components/waitlist/WaitlistJoinSheet';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Text } from '@/components/ui/Text';
import {
  filterSlotsForGroup,
  pickSlotAtOrAfter,
  type GroupBusyInterval,
} from '@/lib/booking/group-slot-availability';
import { hapticSelect } from '@/lib/haptics';
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
  /** Staff duration override (minutes) chosen at the service/variant step, or
   *  null for the service default. Scopes the availability query. */
  durationMinutes: number | null;
  /** Venue id — needed for the waitlist-join fallback. */
  venueId: string;
  selectedSlot: AppointmentSlot | null;
  onSelectSlot: (slot: AppointmentSlot) => void;
  onContinue: () => void;
  /** Walk-in flow on today's date — show a "Start Now" button that starts the
   *  appointment at the current time (bypassing slot selection). */
  startNow?: boolean;
  /** Walk-in shortcut — books the appointment at the current time (no slot pick).
   *  Mirrors the date picker's button so both entry points behave identically. */
  onStartNow?: (todayIso: string) => void;
  /** Venue IANA timezone, for the same-day cutoff and the "Start Now" date. */
  timeZone?: string;
  /** Minimum lead time (hours) — same-day slots earlier than now + this are hidden. */
  minBookingNoticeHours?: number;
  /** When false, today is not bookable: same-day slots are all hidden. */
  allowSameDayBooking?: boolean;
  /**
   * Time already claimed by OTHER attendees of the same group booking.
   *
   * The group's people are not created until the whole group is submitted, so
   * the availability endpoint cannot know about them and happily offers the
   * same slot to every attendee. Filtering here is the only place that can stop
   * two of them being booked onto one practitioner at one time.
   */
  groupBusy?: GroupBusyInterval[];
  /** Duration being booked now, for the overlap maths against `groupBusy`. */
  groupDurationMinutes?: number;
  /**
   * Preselect the first slot at or after this "HH:mm". Used to follow straight
   * on from the previous attendee with the same practitioner, so a group runs
   * back to back rather than leaving an accidental gap. Unlike `preferredTime`
   * this does NOT need an exact match.
   */
  earliestStart?: string | null;
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
  onStartNow,
  timeZone = 'Europe/London',
  minBookingNoticeHours = 1,
  allowSameDayBooking = true,
  groupBusy,
  groupDurationMinutes = 0,
  earliestStart = null,
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
  // "Now" must advance on a timer so the same-day cutoff keeps hiding slots as
  // time passes — and so we never read the clock impurely during render. The
  // lazy initializer seeds a correct first paint; the interval keeps it fresh.
  const [now, setNow] = useState(() => ({
    date: venueTodayDate(timeZone),
    minutes: startMinutes(venueLocalTime(timeZone)),
  }));
  useEffect(() => {
    const tick = () =>
      setNow({ date: venueTodayDate(timeZone), minutes: startMinutes(venueLocalTime(timeZone)) });
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [timeZone]);

  const isToday = date === now.date;
  const noticeMinutes = Math.max(0, minBookingNoticeHours) * 60;
  const visibleSlots = useMemo(() => {
    let out = slots;
    if (isToday) {
      if (!allowSameDayBooking) return [];
      const cutoff = now.minutes + noticeMinutes;
      out = out.filter((slot) => startMinutes(slot.start_time) >= cutoff);
    }
    // Times another attendee of this group already holds with the same
    // practitioner. The server cannot exclude these: those bookings do not exist
    // until the whole group is submitted.
    return groupBusy?.length ? filterSlotsForGroup(out, groupDurationMinutes, groupBusy) : out;
  }, [
    slots,
    isToday,
    allowSameDayBooking,
    now.minutes,
    noticeMinutes,
    groupBusy,
    groupDurationMinutes,
  ]);

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

  /**
   * One-shot: follow straight on from the previous attendee with the same
   * practitioner, so a group runs back to back instead of leaving a gap that
   * nobody intended. Unlike `preferredTime` this takes the first slot AT OR
   * AFTER the time, since the exact minute is rarely on the grid. Only ever
   * preselects — staff can pick anything else, and nothing is chosen when no
   * slot qualifies.
   */
  const appliedEarliestStart = useRef(false);
  useEffect(() => {
    if (appliedEarliestStart.current || !earliestStart || selectedSlot) return;
    const match = pickSlotAtOrAfter(visibleSlots, earliestStart);
    if (match) {
      appliedEarliestStart.current = true;
      onSelectSlot(match);
    }
  }, [visibleSlots, earliestStart, selectedSlot, onSelectSlot]);

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

      {startNow ? (
        <Button
          label="Start Now"
          variant="primary"
          fullWidth
          onPress={() => onStartNow?.(venueTodayDate(timeZone))}
        />
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

/**
 * Re-exported for back-compat: the add-to-waitlist sheet now lives in
 * `components/waitlist/WaitlistJoinSheet.tsx` (lifted so the Waitlist screen can
 * reuse it with service/date/practitioner pickers). It also gained an optional
 * preferred-time window + notes field.
 */
export { WaitlistJoinSheet } from '@/components/waitlist/WaitlistJoinSheet';

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
});
