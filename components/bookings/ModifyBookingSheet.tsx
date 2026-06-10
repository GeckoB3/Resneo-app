import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { addDaysToDateStr, formatDayHeading } from '@/lib/dates/venue-dates';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useAppointmentAvailability } from '@/lib/queries/useAppointmentAvailability';
import { useAppointmentCatalog } from '@/lib/queries/useAppointmentCatalog';
import {
  useModifyAppointment,
  useValidateAppointmentModification,
} from '@/lib/queries/useBookingMutations';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AppointmentCatalogService } from '@/types/appointment-catalog';

export type ModifyBookingTarget = {
  id: string;
  guestName: string;
  /** Current date (YYYY-MM-DD) and time (HH:mm[:ss]). */
  date: string;
  time: string;
  durationMinutes: number | null;
  /** calendar_id ?? practitioner_id from the booking row. */
  practitionerId: string | null;
  /** appointment_service_id ?? service_item_id from the booking row. */
  serviceId: string | null;
  /** Which anchor column the booking uses — decides the PATCH field name. */
  usesServiceItem: boolean;
  serviceVariantId: string | null;
};

type ModifyBookingSheetProps = {
  target: ModifyBookingTarget | null;
  onClose: () => void;
};

const MAX_MINUTES = 23 * 60 + 59;
// Appointment PATCH bounds (validate-appointment-modification schema).
const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 14 * 60;
const VALIDATE_DEBOUNCE_MS = 450;

type CheckState =
  | { state: 'idle' | 'checking' | 'valid' | 'unknown' }
  | { state: 'invalid'; reason: string };

function formatDuration(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Full appointment modify — change service, variant, staff, date, time and
 * duration with live availability validation (web StaffAppointmentModifyForm
 * parity). The quick RescheduleSheet stays for date/time-only moves.
 */
export function ModifyBookingSheet({ target, onClose }: ModifyBookingSheetProps) {
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const catalogQuery = useAppointmentCatalog(target ? venue?.id ?? null : null);
  const modify = useModifyAppointment(target?.id ?? '');
  const validate = useValidateAppointmentModification(target?.id ?? '');

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [practitionerId, setPractitionerId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [minutes, setMinutes] = useState(0);
  const [duration, setDuration] = useState(30);
  // Last validation result, keyed by the field signature it was checked for —
  // "checking" is derived (signature mismatch) so the effect never sets state
  // synchronously.
  const [checked, setChecked] = useState<{ sig: string | null; result: CheckState }>({
    sig: null,
    result: { state: 'idle' },
  });
  const [error, setError] = useState<string | null>(null);
  const [seededId, setSeededId] = useState<string | null>(null);
  const checkSeq = useRef(0);

  // Seed from the booking when the sheet opens (adjust-state-during-render).
  if (target && target.id !== seededId) {
    setSeededId(target.id);
    setServiceId(target.serviceId);
    setVariantId(target.serviceVariantId);
    setPractitionerId(target.practitionerId);
    setDate(target.date);
    setMinutes(timeToMinutes(target.time));
    setDuration(target.durationMinutes ?? 30);
    setChecked({ sig: null, result: { state: 'idle' } });
    setError(null);
  } else if (!target && seededId !== null) {
    setSeededId(null);
  }

  // Unique services across the catalog + which practitioners offer each.
  const { services, offeredBy, practitioners } = useMemo(() => {
    const serviceMap = new Map<string, AppointmentCatalogService>();
    const offers = new Map<string, Set<string>>();
    const staff: { id: string; name: string }[] = [];
    for (const p of catalogQuery.data?.practitioners ?? []) {
      staff.push({ id: p.id, name: p.name });
      for (const s of p.services) {
        if (!serviceMap.has(s.id)) serviceMap.set(s.id, s);
        const set = offers.get(s.id) ?? new Set<string>();
        set.add(p.id);
        offers.set(s.id, set);
      }
    }
    return { services: [...serviceMap.values()], offeredBy: offers, practitioners: staff };
  }, [catalogQuery.data]);

  const selectedService = services.find((s) => s.id === serviceId) ?? null;
  const serviceInCatalog = !serviceId || !!selectedService;
  const variants = selectedService?.variants ?? [];
  const requiresVariant = variants.length > 0;

  // Staff offering the selected service; all staff when the service is
  // unknown to the catalog (archived) so reassignment stays possible.
  const eligibleStaff = useMemo(() => {
    if (!serviceId || !offeredBy.has(serviceId)) return practitioners;
    const ids = offeredBy.get(serviceId)!;
    return practitioners.filter((p) => ids.has(p.id));
  }, [serviceId, offeredBy, practitioners]);

  const selectService = (svc: AppointmentCatalogService) => {
    setServiceId(svc.id);
    const svcVariants = svc.variants ?? [];
    const keepVariant =
      svc.id === target?.serviceId &&
      svcVariants.some((v) => v.id === target?.serviceVariantId);
    const nextVariant = keepVariant
      ? svcVariants.find((v) => v.id === target?.serviceVariantId)!
      : svcVariants[0] ?? null;
    setVariantId(nextVariant?.id ?? null);
    setDuration(nextVariant?.duration_minutes ?? svc.duration_minutes);
    const offering = offeredBy.get(svc.id);
    if (practitionerId && offering && !offering.has(practitionerId)) {
      setPractitionerId(null);
    }
  };

  const selectVariant = (id: string) => {
    setVariantId(id);
    const v = variants.find((x) => x.id === id);
    if (v) setDuration(v.duration_minutes);
  };

  // Quick duration presets — current/default/initial + common lengths.
  const durationPresets = [
    ...new Set(
      [
        selectedService?.duration_minutes,
        target?.durationMinutes ?? undefined,
        30,
        45,
        60,
        90,
        120,
      ].filter((d): d is number => d != null && d >= MIN_DURATION_MINUTES),
    ),
  ].sort((a, b) => a - b);

  // Free slots for the chosen day (the booking's own slot stays available).
  const availability = useAppointmentAvailability({
    date: date || null,
    serviceId,
    practitionerId,
    variantId,
    durationMinutes: duration,
    excludeBookingId: target?.id,
    enabled: !!target && serviceInCatalog,
  });
  const slots = useMemo(() => {
    const practitioner = availability.data?.practitioners.find((p) => p.id === practitionerId);
    return (practitioner?.slots ?? []).filter(
      (s) => !s.service_id || s.service_id === serviceId,
    );
  }, [availability.data, practitionerId, serviceId]);

  const selectedTime = minutesToTime(minutes);

  // Debounced dry-run validation (450ms, web parity). Auth/availability errors
  // on the endpoint degrade to "unknown" — the PATCH still validates.
  const canCheck = !!target && !!serviceId && !!practitionerId && !!date;
  const signature = canCheck
    ? [target.id, serviceId, variantId, practitionerId, date, minutes, duration].join('|')
    : null;
  const validateMutate = validate.mutate;
  useEffect(() => {
    if (!target || !serviceId || !practitionerId || !date || !signature) {
      return;
    }
    const seq = ++checkSeq.current;
    const timer = setTimeout(() => {
      validateMutate(
        {
          booking_date: date,
          booking_time: minutesToTime(minutes),
          practitioner_id: practitionerId,
          ...(target.usesServiceItem
            ? { service_item_id: serviceId }
            : { appointment_service_id: serviceId }),
          duration_minutes: duration,
          service_variant_id: requiresVariant ? variantId : null,
        },
        {
          onSuccess: (res) => {
            if (checkSeq.current !== seq) return;
            setChecked({
              sig: signature,
              result: res.ok
                ? { state: 'valid' }
                : { state: 'invalid', reason: res.error ?? 'This time is not available.' },
            });
          },
          onError: () => {
            if (checkSeq.current !== seq) return;
            setChecked({ sig: signature, result: { state: 'unknown' } });
          },
        },
      );
    }, VALIDATE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    target,
    serviceId,
    variantId,
    practitionerId,
    date,
    minutes,
    duration,
    requiresVariant,
    signature,
    validateMutate,
  ]);

  const check: CheckState = !canCheck
    ? { state: 'idle' }
    : checked.sig === signature
      ? checked.result
      : { state: 'checking' };

  const canSave =
    !!target &&
    !!serviceId &&
    !!practitionerId &&
    (!requiresVariant || !!variantId) &&
    check.state !== 'invalid' &&
    check.state !== 'checking';

  async function handleSave() {
    if (!target || !serviceId || !practitionerId) return;
    setError(null);
    try {
      await modify.mutateAsync({
        booking_date: date,
        booking_time: `${minutesToTime(minutes)}:00`,
        practitioner_id: practitionerId,
        ...(target.usesServiceItem
          ? { service_item_id: serviceId }
          : { appointment_service_id: serviceId }),
        duration_minutes: duration,
        service_variant_id: requiresVariant ? variantId : null,
      });
      hapticSuccess();
      onClose();
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save changes. Try again.');
    }
  }

  const endPreview = minutesToTime((minutes + duration) % (24 * 60));

  return (
    <Sheet visible={!!target} onClose={onClose}>
      {target && seededId === target.id ? (
        <View style={styles.body}>
          <View style={styles.headerBlock}>
            <Text variant="overline" tone="muted">
              Modify booking
            </Text>
            <Text variant="title">{target.guestName}</Text>
            <Text variant="bodySmall" tone="muted">
              Now: {formatDayHeading(target.date)} · {target.time.slice(0, 5)}
              {target.durationMinutes != null
                ? ` · ${formatDuration(target.durationMinutes)}`
                : ''}
            </Text>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
            {catalogQuery.isLoading ? (
              <Text variant="bodySmall" tone="muted">
                Loading services…
              </Text>
            ) : null}

            {!serviceInCatalog ? (
              <Text variant="caption" tone="muted">
                The booked service is no longer in the catalogue — pick a service below to
                change it, or just adjust the time and duration.
              </Text>
            ) : null}

            {services.length > 0 ? (
              <View style={styles.fieldBlock}>
                <Text variant="label" tone="secondary">
                  Service
                </Text>
                <View style={styles.chipWrap}>
                  {services.map((svc) => (
                    <Chip
                      key={svc.id}
                      label={svc.name}
                      selected={svc.id === serviceId}
                      onPress={() => selectService(svc)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {requiresVariant ? (
              <View style={styles.fieldBlock}>
                <Text variant="label" tone="secondary">
                  Variant
                </Text>
                <View style={styles.chipWrap}>
                  {variants.map((v) => (
                    <Chip
                      key={v.id}
                      label={`${v.name} (${v.duration_minutes}m)`}
                      selected={v.id === variantId}
                      onPress={() => selectVariant(v.id)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {eligibleStaff.length > 0 ? (
              <View style={styles.fieldBlock}>
                <Text variant="label" tone="secondary">
                  Staff
                </Text>
                <View style={styles.chipWrap}>
                  {eligibleStaff.map((p) => (
                    <Chip
                      key={p.id}
                      label={p.name}
                      selected={p.id === practitionerId}
                      onPress={() => setPractitionerId(p.id)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            <Stepper
              label="Date"
              value={formatDayHeading(date)}
              onDecrement={() => setDate((d) => addDaysToDateStr(d, -1))}
              onIncrement={() => setDate((d) => addDaysToDateStr(d, 1))}
            />
            <Stepper
              label="Start"
              value={selectedTime}
              onDecrement={() => setMinutes((m) => Math.max(0, m - 1))}
              onIncrement={() => setMinutes((m) => Math.min(MAX_MINUTES, m + 1))}
            />
            <Stepper
              label="Duration"
              value={formatDuration(duration)}
              onDecrement={() => setDuration((d) => Math.max(MIN_DURATION_MINUTES, d - 1))}
              onIncrement={() => setDuration((d) => Math.min(MAX_DURATION_MINUTES, d + 1))}
            />
            <View style={styles.chipWrap}>
              {durationPresets.map((preset) => (
                <Chip
                  key={preset}
                  label={formatDuration(preset)}
                  selected={duration === preset}
                  onPress={() => setDuration(preset)}
                />
              ))}
            </View>
            <Text variant="caption" tone="muted">
              Ends at {endPreview}. Hold − / + to change faster.
            </Text>

            {slots.length > 0 ? (
              <View style={styles.fieldBlock}>
                <Text variant="label" tone="secondary">
                  Free slots
                </Text>
                <View style={styles.chipWrap}>
                  {slots.map((slot) => (
                    <Chip
                      key={`${slot.practitioner_id}-${slot.start_time}`}
                      label={slot.start_time}
                      selected={slot.start_time === selectedTime}
                      onPress={() => setMinutes(timeToMinutes(slot.start_time))}
                    />
                  ))}
                </View>
              </View>
            ) : availability.isLoading ? (
              <Text variant="caption" tone="muted">
                Loading free slots…
              </Text>
            ) : null}
          </ScrollView>

          {check.state === 'checking' ? (
            <Text variant="caption" tone="muted">
              Checking availability…
            </Text>
          ) : check.state === 'valid' ? (
            <Text variant="caption" color={colors.success}>
              Time available ✓
            </Text>
          ) : check.state === 'invalid' ? (
            <Text variant="caption" tone="danger">
              {check.reason}
            </Text>
          ) : check.state === 'unknown' ? (
            <Text variant="caption" tone="muted">
              Could not pre-check availability — Save will validate.
            </Text>
          ) : null}

          {error ? (
            <Text variant="bodySmall" tone="danger">
              {error}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.actionButton} />
            <Button
              label="Save changes"
              onPress={() => void handleSave()}
              loading={modify.isPending}
              disabled={!canSave}
              style={styles.actionButton}
            />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  headerBlock: {
    gap: spacing.xs,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollBody: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  fieldBlock: {
    gap: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
});
