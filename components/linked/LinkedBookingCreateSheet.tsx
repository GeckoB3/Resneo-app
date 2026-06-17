import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Input } from '@/components/ui/Input';
import { PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { ApiError } from '@/lib/api/client';
import {
  useCreateLinkedBooking,
  useLinkedGuests,
} from '@/lib/queries/useLinkedCalendar';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { LinkedVenueCalendar } from '@/types/linked-venues';

type GuestOption = { id: string; name: string; email: string | null };

/**
 * Create a booking in a linked venue — a MANUAL form (no availability wizard),
 * mirroring the web `CreateLinkedBookingModal`. Available only on links granting
 * `create_edit_cancel`. The client is chosen from the linked venue's OWN guests
 * (a debounced cross-venue guest search) — no guest row is copied between
 * venues. The booking is recorded in the cross-venue audit log.
 */
export function LinkedBookingCreateSheet({
  venue,
  date: initialDate,
  prefillPractitionerId,
  prefillTime,
  visible,
  onClose,
  onSaved,
}: {
  venue: LinkedVenueCalendar | null;
  /** The currently-viewed date — seeds the form date. */
  date: string;
  /** Pre-select this calendar column (e.g. the linked column tapped). */
  prefillPractitionerId?: string;
  /** Pre-fill the start time (e.g. the empty slot tapped). */
  prefillTime?: string;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const create = useCreateLinkedBooking();

  const [practitionerId, setPractitionerId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [bookingDate, setBookingDate] = useState(initialDate);
  const [startMinutes, setStartMinutes] = useState(timeToMinutes('09:00'));
  const [endMinutes, setEndMinutes] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [guest, setGuest] = useState<GuestOption | null>(null);
  const [guestQuery, setGuestQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce the cross-venue guest search (250ms — web parity).
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(guestQuery.trim()), 250);
    return () => clearTimeout(timer);
  }, [guestQuery]);

  const venueId = venue?.venueId ?? null;
  const guestsQuery = useLinkedGuests(guest ? null : venueId, debouncedQuery);
  const guestResults: GuestOption[] = guestsQuery.data?.guests ?? [];

  // Seed the form whenever the sheet opens (or the target venue changes). This
  // is the accepted "seed local form state when a sheet opens" pattern here.
  useEffect(() => {
    if (!visible || !venue) return;
    const defaultPrac =
      (prefillPractitionerId &&
      venue.practitioners.some((p) => p.id === prefillPractitionerId)
        ? prefillPractitionerId
        : venue.practitioners.find((p) => p.isActive)?.id) ?? '';
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed form when sheet opens
    setPractitionerId(defaultPrac);
    setServiceId('');
    setBookingDate(initialDate);
    setStartMinutes(timeToMinutes(prefillTime ?? '09:00'));
    setEndMinutes(null);
    setNotes('');
    setGuest(null);
    setGuestQuery('');
    setDebouncedQuery('');
  }, [visible, venueId]); // eslint-disable-line react-hooks/exhaustive-deps

  const practitionerLabel = useMemo(() => {
    if (!practitionerId) return 'Unassigned';
    const p = venue?.practitioners.find((x) => x.id === practitionerId);
    return p ? `${p.name}${p.isActive ? '' : ' (inactive)'}` : 'Unassigned';
  }, [practitionerId, venue]);

  if (!venue) return null;

  const save = () => {
    if (!guest) {
      toast.error('Choose a client for the booking.');
      return;
    }
    create.mutate(
      {
        ownerVenueId: venue.venueId,
        guestId: guest.id,
        practitionerId: practitionerId || null,
        appointmentServiceId: serviceId || null,
        bookingDate,
        bookingTime: minutesToTime(startMinutes),
        bookingEndTime: endMinutes != null ? minutesToTime(endMinutes) : undefined,
        specialRequests: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(`Booking created in ${venue.venueName}.`);
          onSaved();
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Failed to create the booking.'),
      },
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} fill maxHeight="88%">
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text variant="subheading">{`New booking in ${venue.venueName}`}</Text>
        <Text variant="bodySmall" tone="secondary">
          The booking is created in the linked venue and recorded in the cross-venue audit log
          visible to both venues.
        </Text>

        {/* Client ---------------------------------------------------------- */}
        <View style={styles.field}>
          <Text variant="label" tone="secondary">
            Client
          </Text>
          {guest ? (
            <View
              style={[styles.guestSelected, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={styles.guestSelectedBody}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {guest.name}
                </Text>
                {guest.email ? (
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {guest.email}
                  </Text>
                ) : null}
              </View>
              <Button
                label="Change"
                size="sm"
                variant="ghost"
                onPress={() => {
                  setGuest(null);
                  setGuestQuery('');
                }}
              />
            </View>
          ) : (
            <>
              <Input
                value={guestQuery}
                onChangeText={setGuestQuery}
                placeholder="Search the venue’s clients by name or email"
                autoCapitalize="none"
                leftIcon={
                  <SymbolView
                    name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
                    tintColor={colors.textMuted}
                    size={16}
                  />
                }
              />
              <View style={[styles.results, { borderColor: colors.border }]}>
                {guestsQuery.isFetching ? (
                  <Text variant="caption" tone="muted" style={styles.resultEmpty}>
                    Searching…
                  </Text>
                ) : guestResults.length === 0 ? (
                  <Text variant="caption" tone="muted" style={styles.resultEmpty}>
                    No clients found.
                  </Text>
                ) : (
                  guestResults.map((g, i) => (
                    <PressableScale
                      key={g.id}
                      haptic
                      accessibilityRole="button"
                      accessibilityLabel={g.name}
                      onPress={() => setGuest(g)}>
                      <View
                        style={[
                          styles.resultRow,
                          i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                        ]}>
                        <Text variant="bodySmall" numberOfLines={1}>
                          {g.name}
                        </Text>
                        {g.email ? (
                          <Text variant="caption" tone="muted" numberOfLines={1}>
                            {g.email}
                          </Text>
                        ) : null}
                      </View>
                    </PressableScale>
                  ))
                )}
              </View>
            </>
          )}
        </View>

        {/* Calendar (practitioner) ---------------------------------------- */}
        <View style={styles.field}>
          <Text variant="label" tone="secondary">
            Calendar
          </Text>
          <View style={styles.chips}>
            <PickChip
              label="Unassigned"
              active={practitionerId === ''}
              onPress={() => setPractitionerId('')}
            />
            {venue.practitioners.map((p) => (
              <PickChip
                key={p.id}
                label={`${p.name}${p.isActive ? '' : ' (inactive)'}`}
                active={practitionerId === p.id}
                onPress={() => setPractitionerId(p.id)}
              />
            ))}
          </View>
          <Text variant="caption" tone="muted">
            {practitionerLabel}
          </Text>
        </View>

        {/* Service (optional) --------------------------------------------- */}
        {venue.services.length > 0 ? (
          <View style={styles.field}>
            <Text variant="label" tone="secondary">
              Service (optional)
            </Text>
            <View style={styles.chips}>
              <PickChip
                label="No service"
                active={serviceId === ''}
                onPress={() => setServiceId('')}
              />
              {venue.services.map((s) => (
                <PickChip
                  key={s.id}
                  label={s.name}
                  active={serviceId === s.id}
                  onPress={() => setServiceId(s.id)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* Date + times --------------------------------------------------- */}
        <View style={styles.fieldRow}>
          <Text variant="label" tone="secondary">
            Date
          </Text>
          <DatePickerField
            value={bookingDate}
            onChange={setBookingDate}
            accessibilityLabel="Booking date"
          />
        </View>
        <View style={styles.fieldRow}>
          <Text variant="label" tone="secondary">
            Start
          </Text>
          <TimePickerField
            value={startMinutes}
            onChange={setStartMinutes}
            accessibilityLabel="Start time"
          />
        </View>
        <View style={styles.fieldRow}>
          <Text variant="label" tone="secondary">
            End (optional)
          </Text>
          <View style={styles.endRow}>
            <TimePickerField
              value={endMinutes ?? startMinutes}
              onChange={setEndMinutes}
              accessibilityLabel="End time"
            />
            {endMinutes != null ? (
              <Button label="Clear" size="sm" variant="ghost" onPress={() => setEndMinutes(null)} />
            ) : null}
          </View>
        </View>

        <Input
          label="Add a note"
          optional
          value={notes}
          onChangeText={setNotes}
          placeholder="Visible to both venues"
          multiline
          numberOfLines={2}
          maxLength={2000}
        />

        <View style={styles.actions}>
          <Button
            label="Close"
            variant="secondary"
            style={styles.flex1}
            disabled={create.isPending}
            onPress={onClose}
          />
          <Button
            label="Create booking"
            variant="primary"
            style={styles.flex1}
            loading={create.isPending}
            disabled={!guest}
            onPress={save}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}

/** A small selectable chip for the calendar/service pickers. */
function PickChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale
      haptic
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}>
      <View
        style={[
          styles.pickChip,
          {
            backgroundColor: active ? colors.brandSubtle : colors.surface,
            borderColor: active ? colors.brand : colors.border,
          },
        ]}>
        <Text variant="caption" color={active ? colors.brand : colors.textSecondary} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  field: {
    gap: spacing.sm,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  endRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  guestSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  guestSelectedBody: {
    flex: 1,
    minWidth: 0,
  },
  results: {
    borderWidth: 1,
    borderRadius: radius.md,
    maxHeight: 168,
    overflow: 'hidden',
  },
  resultRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  resultEmpty: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pickChip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 36,
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  flex1: {
    flex: 1,
  },
});
