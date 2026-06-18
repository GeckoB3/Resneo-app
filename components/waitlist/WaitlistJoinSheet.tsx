import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DatePickerField } from '@/components/ui/DatePickerField';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { ApiError } from '@/lib/api/client';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useAppointmentCatalog } from '@/lib/queries/useAppointmentCatalog';
import { useJoinWaitlist } from '@/lib/queries/useJoinWaitlist';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  AppointmentCatalogPractitioner,
  AppointmentCatalogService,
} from '@/types/appointment-catalog';

type PreferredWindow = 'all_day' | 'time_range';

/** Today as YYYY-MM-DD (local). Used as the default date in picker mode. */
function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Validate the preferred-time pair client-side, matching the backend's
 * `validateGuestWaitlistTimeInput` (both required, end after start). Exported for
 * unit testing.
 */
export function validatePreferredTime(
  window: PreferredWindow,
  startHm: string,
  endHm: string,
): { ok: true } | { ok: false; error: string } {
  if (window === 'all_day') return { ok: true };
  if (timeToMinutes(endHm) <= timeToMinutes(startHm)) {
    return { ok: false, error: 'End time must be after the start time.' };
  }
  return { ok: true };
}

type WaitlistJoinSheetProps = {
  open: boolean;
  onClose: () => void;
  venueId: string;
  /** Fixed service id (wizard mode). Omit + set `showPickers` to choose one. */
  serviceId?: string;
  /** Fixed practitioner id (wizard mode); undefined for "any available". */
  practitionerId?: string;
  /** Fixed date YYYY-MM-DD (wizard mode). Omit + set `showPickers` to choose. */
  date?: string;
  /**
   * Picker mode — render service / date / practitioner pickers so staff can add
   * a guest from the Waitlist screen without walking the booking wizard into a
   * dead-end date. Requires `venueId`.
   */
  showPickers?: boolean;
};

/**
 * Collects guest details and adds them to the appointment waitlist. Supports an
 * optional preferred-time window (all day vs a from/to pair) and a Notes field
 * (web parity with `POST /api/booking/appointment-waitlist`), and — in
 * `showPickers` mode — service/date/practitioner pickers for staff-initiated
 * entries.
 */
export function WaitlistJoinSheet({
  open,
  onClose,
  venueId,
  serviceId,
  practitionerId,
  date,
  showPickers = false,
}: WaitlistJoinSheetProps) {
  const join = useJoinWaitlist();

  // --- Guest fields -------------------------------------------------------
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  // --- Preferred time window ---------------------------------------------
  const [preferredWindow, setPreferredWindow] = useState<PreferredWindow>('all_day');
  const [startMinutes, setStartMinutes] = useState(9 * 60); // 09:00
  const [endMinutes, setEndMinutes] = useState(12 * 60); // 12:00

  // --- Picker-mode selections --------------------------------------------
  const [pickedServiceId, setPickedServiceId] = useState<string | null>(null);
  const [pickedPractitionerId, setPickedPractitionerId] = useState<string | null>(null);
  const [pickedDate, setPickedDate] = useState<string>(() => date ?? todayIso());

  const catalog = useAppointmentCatalog(showPickers ? venueId : null);

  // Flatten the catalog to unique services + the practitioners offering each.
  const services = useMemo<AppointmentCatalogService[]>(() => {
    if (!catalog.data) return [];
    const byId = new Map<string, AppointmentCatalogService>();
    for (const prac of catalog.data.practitioners) {
      for (const svc of prac.services) {
        if (!byId.has(svc.id)) byId.set(svc.id, svc);
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog.data]);

  const practitionersForService = useMemo<AppointmentCatalogPractitioner[]>(() => {
    if (!catalog.data || !pickedServiceId) return [];
    return catalog.data.practitioners.filter((p) =>
      p.services.some((s) => s.id === pickedServiceId),
    );
  }, [catalog.data, pickedServiceId]);

  const effectiveServiceId = showPickers ? pickedServiceId : serviceId;
  const effectivePractitionerId = showPickers ? pickedPractitionerId : practitionerId;
  const effectiveDate = showPickers ? pickedDate : date;

  function resetForm() {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setNotes('');
    setPreferredWindow('all_day');
    setStartMinutes(9 * 60);
    setEndMinutes(12 * 60);
    setPickedServiceId(null);
    setPickedPractitionerId(null);
    setPickedDate(date ?? todayIso());
    setError(null);
  }

  function handleClose() {
    setJoined(false);
    resetForm();
    onClose();
  }

  async function handleJoin() {
    setError(null);

    if (showPickers && !effectiveServiceId) {
      setError('Choose a service for the waitlist entry.');
      return;
    }
    if (showPickers && !effectiveDate) {
      setError('Choose a preferred date.');
      return;
    }
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setError('Name, email and phone are all required for the waitlist.');
      return;
    }

    const startHm = minutesToTime(startMinutes);
    const endHm = minutesToTime(endMinutes);
    const timeValid = validatePreferredTime(preferredWindow, startHm, endHm);
    if (!timeValid.ok) {
      setError(timeValid.error);
      return;
    }

    try {
      await join.mutateAsync({
        venue_id: venueId,
        service_id: effectiveServiceId as string,
        desired_date: effectiveDate as string,
        ...(effectivePractitionerId ? { practitioner_id: effectivePractitionerId } : {}),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        guest_email: email.trim(),
        guest_phone: phone.trim(),
        preferred_window: preferredWindow,
        ...(preferredWindow === 'time_range'
          ? { desired_time: startHm, desired_time_end: endHm }
          : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      hapticSuccess();
      setJoined(true);
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not join the waitlist.');
    }
  }

  if (joined) {
    return (
      <Sheet visible={open} onClose={handleClose}>
        <View style={styles.body}>
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
    <Sheet visible={open} onClose={handleClose} fill maxHeight="92%">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text variant="overline" tone="muted">
          Join waitlist
        </Text>

        {/* Picker mode: service / date / practitioner */}
        {showPickers ? (
          <View style={styles.pickerBlock}>
            <Text variant="label">Service</Text>
            {catalog.isLoading ? (
              <Text variant="caption" tone="muted">
                Loading services…
              </Text>
            ) : services.length === 0 ? (
              <Text variant="caption" tone="muted">
                No bookable services found for this venue.
              </Text>
            ) : (
              <View style={styles.optionList}>
                {services.map((svc) => {
                  const selected = pickedServiceId === svc.id;
                  return (
                    <OptionChip
                      key={svc.id}
                      label={svc.name}
                      selected={selected}
                      onPress={() => {
                        hapticSelect();
                        setPickedServiceId(svc.id);
                        setPickedPractitionerId(null);
                      }}
                    />
                  );
                })}
              </View>
            )}

            <Text variant="label" style={styles.fieldLabel}>
              Preferred date
            </Text>
            <DatePickerField
              value={pickedDate}
              onChange={setPickedDate}
              accessibilityLabel="Preferred date"
              minimumDate={new Date()}
            />

            {pickedServiceId && practitionersForService.length > 0 ? (
              <>
                <Text variant="label" style={styles.fieldLabel}>
                  Practitioner (optional)
                </Text>
                <View style={styles.optionList}>
                  <OptionChip
                    label="Any"
                    selected={pickedPractitionerId === null}
                    onPress={() => {
                      hapticSelect();
                      setPickedPractitionerId(null);
                    }}
                  />
                  {practitionersForService.map((prac) => (
                    <OptionChip
                      key={prac.id}
                      label={prac.name}
                      selected={pickedPractitionerId === prac.id}
                      onPress={() => {
                        hapticSelect();
                        setPickedPractitionerId(prac.id);
                      }}
                    />
                  ))}
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        {/* Guest details */}
        <View style={styles.names}>
          <View style={styles.nameField}>
            <Input
              label="First name"
              accessibilityLabel="First name"
              value={firstName}
              onChangeText={setFirstName}
            />
          </View>
          <View style={styles.nameField}>
            <Input
              label="Last name"
              accessibilityLabel="Last name"
              value={lastName}
              onChangeText={setLastName}
            />
          </View>
        </View>
        <Input
          label="Email"
          accessibilityLabel="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Input
          label="Phone"
          accessibilityLabel="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        {/* Preferred time window */}
        <View style={styles.timeBlock}>
          <Text variant="label">Preferred time</Text>
          <Segmented<PreferredWindow>
            options={[
              { value: 'all_day', label: 'All day' },
              { value: 'time_range', label: 'Time range' },
            ]}
            value={preferredWindow}
            onChange={setPreferredWindow}
          />
          {preferredWindow === 'time_range' ? (
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text variant="caption" tone="muted">
                  From
                </Text>
                <TimePickerField
                  value={startMinutes}
                  onChange={setStartMinutes}
                  accessibilityLabel="Preferred start time"
                />
              </View>
              <View style={styles.timeField}>
                <Text variant="caption" tone="muted">
                  To
                </Text>
                <TimePickerField
                  value={endMinutes}
                  onChange={setEndMinutes}
                  accessibilityLabel="Preferred end time"
                />
              </View>
            </View>
          ) : null}
        </View>

        {/* Notes */}
        <Input
          label="Notes (optional)"
          accessibilityLabel="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          maxLength={500}
        />

        {error ? (
          <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button label="Cancel" variant="secondary" style={styles.actionBtn} onPress={handleClose} />
          <Button
            label="Add to waitlist"
            style={styles.actionBtn}
            loading={join.isPending}
            onPress={() => void handleJoin()}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}

/** A single selectable chip used by the service/practitioner pickers. */
function OptionChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.brand : colors.surface,
          borderColor: selected ? colors.brand : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <Text variant="bodyMedium" color={selected ? colors.onBrand : colors.text}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  scrollContent: {
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.lg,
  },
  pickerBlock: {
    gap: spacing.sm,
  },
  fieldLabel: {
    marginTop: spacing.sm,
  },
  optionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: minTouchTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  names: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  nameField: {
    flex: 1,
  },
  timeBlock: {
    gap: spacing.sm,
  },
  timeRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timeField: {
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
  },
});
