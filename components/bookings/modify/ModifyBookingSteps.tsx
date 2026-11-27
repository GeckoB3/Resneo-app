/**
 * The steps of the appointment modify sheet that replace its form: the notify
 * prompt after a save, the visit's service picker, the date and the time.
 * Moved out of `ModifyBookingSheet.tsx` unchanged (codebase standards P5.2).
 * Each is a step inside the one sheet, never a sheet of its own (see `Mode`).
 */
import { type Dispatch, type SetStateAction } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { MonthDatePicker } from '@/components/booking-wizard/MonthDatePicker';
import { type SlotPeriod } from '@/components/booking-wizard/TimeSlotStep';
import { type ModifyBookingTarget } from '@/components/bookings/ModifyBookingSheet';
import { timeToMinutes } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { formatDuration, type Mode } from '@/lib/booking/modify-booking-form';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { hapticSelect } from '@/lib/haptics';
import { spacing } from '@/theme/index';
import type { AppointmentCatalogService } from '@/types/appointment-catalog';

export interface ModifyNotifyStepProps {
  target: ModifyBookingTarget;
  isVisit: boolean;
  onClose: () => void;
  handleNotify: () => void;
  savedServiceChange: boolean;
  undoing: boolean;
  handleUndo: () => Promise<void>;
}

/** The save landed and the guest email is still held back: notify, skip, or undo. */
export function ModifyNotifyStep({
  target,
  isVisit,
  onClose,
  handleNotify,
  savedServiceChange,
  undoing,
  handleUndo,
}: ModifyNotifyStepProps) {
  return (
    <Sheet visible onClose={onClose}>
      <Text variant="subheading">{isVisit ? 'Visit moved' : 'Booking moved'}</Text>
      <Text variant="caption" tone="muted">
        Let {target.guestName} know about the change?
      </Text>
      <View style={styles.noticeActions}>
        <Button label={`Notify ${target.guestName}`} fullWidth onPress={handleNotify} />
        <Button label="Don't notify" variant="secondary" fullWidth onPress={onClose} />
        {/* No Undo once the SERVICES changed — see `savedServiceChange`. */}
        {savedServiceChange ? (
          <Text variant="caption" tone="muted">
            This visit&rsquo;s services changed too, so there is nothing to undo in one step.
            Reopen it to make further changes.
          </Text>
        ) : (
          <Button
            label="Undo change"
            variant="ghost"
            fullWidth
            loading={undoing}
            onPress={() => void handleUndo()}
          />
        )}
      </View>
    </Sheet>
  );
}

export interface ModifyVisitServiceStepProps {
  pickerServiceId: string | null;
  services: AppointmentCatalogService[];
  pickerLineIndex: number | null;
  visitServiceOptions: AppointmentCatalogService[];
  commitServicePick: (serviceId: string, variantId: string | null) => void;
  setPickerServiceId: Dispatch<SetStateAction<string | null>>;
  setPickerLineIndex: Dispatch<SetStateAction<number | null>>;
  setMode: Dispatch<SetStateAction<Mode>>;
  onClose: () => void;
}

/** Choose what goes on (or off) a visit, with the option list under the chosen service. */
export function ModifyVisitServiceStep({
  pickerServiceId,
  services,
  pickerLineIndex,
  visitServiceOptions,
  commitServicePick,
  setPickerServiceId,
  setPickerLineIndex,
  setMode,
  onClose,
}: ModifyVisitServiceStepProps) {
  const picked = pickerServiceId ? services.find((s) => s.id === pickerServiceId) : null;
  const pickedVariants = picked?.variants ?? [];
  return (
    <Sheet visible fill onClose={onClose}>
      <View style={styles.stepBody}>
        <Text variant="heading">
          {pickerLineIndex != null && pickerLineIndex >= 0 ? 'Change service' : 'Add a service'}
        </Text>
        <Text variant="bodySmall" tone="muted">
          {pickerLineIndex != null && pickerLineIndex >= 0
            ? 'The visit keeps this slot; only what happens in it changes.'
            : 'Added to the end of the visit, which grows by its length.'}
        </Text>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
          <View style={styles.fieldBlock}>
            <Text variant="label" tone="secondary">
              Service
            </Text>
            <View style={styles.chipWrap}>
              {visitServiceOptions.map((svc) => (
                <Chip
                  key={svc.id}
                  label={svc.name}
                  selected={svc.id === pickerServiceId}
                  onPress={() => {
                    hapticSelect();
                    const variants = svc.variants ?? [];
                    // Nothing to choose between: take it and go back.
                    if (variants.length === 0) {
                      commitServicePick(svc.id, null);
                      return;
                    }
                    setPickerServiceId(svc.id);
                  }}
                />
              ))}
            </View>
          </View>

          {picked && pickedVariants.length > 0 ? (
            <View style={styles.fieldBlock}>
              <Text variant="label" tone="secondary">
                Option
              </Text>
              <View style={styles.chipWrap}>
                {pickedVariants.map((v) => (
                  <Chip
                    key={v.id}
                    label={`${v.name} (${v.duration_minutes}m)`}
                    onPress={() => {
                      hapticSelect();
                      commitServicePick(picked.id, v.id);
                    }}
                  />
                ))}
              </View>
              <Text variant="caption" tone="muted">
                A service brings its own length with it, so swapping one does not keep a
                length set by hand.
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => {
              setPickerLineIndex(null);
              setPickerServiceId(null);
              setMode('form');
            }}
            style={styles.actionButton}
          />
        </View>
      </View>
    </Sheet>
  );
}

export interface ModifyDateStepProps {
  monthAnchor: string;
  target: ModifyBookingTarget;
  setMonthAnchor: Dispatch<SetStateAction<string>>;
  today: string;
  date: string;
  setDate: Dispatch<SetStateAction<string>>;
  isVisit: boolean;
  availableDates: Set<string> | null;
  monthQuery: { isLoading: boolean };
  timeZone: string;
  setMode: Dispatch<SetStateAction<Mode>>;
  onClose: () => void;
}

/** The wizard's month calendar, reused whole. */
export function ModifyDateStep({
  monthAnchor,
  target,
  setMonthAnchor,
  today,
  date,
  setDate,
  isVisit,
  availableDates,
  monthQuery,
  timeZone,
  setMode,
  onClose,
}: ModifyDateStepProps) {
  return (
    <Sheet visible fill onClose={onClose}>
      {/* MonthDatePicker takes its gutter from its parent (in the wizard, a
          padded Screen), so the date pane needs a padded wrapper of its own. */}
      <View style={styles.pickerPane}>
        <MonthDatePicker
          title="Choose a date"
          monthAnchor={monthAnchor || target.date}
          onChangeMonth={setMonthAnchor}
          today={today}
          selectedDate={date}
          onSelectDate={setDate}
          // A visit gets no green markers: the month endpoint answers for ONE
          // service and would mark days by whether that service fits, not the
          // whole visit. `null` leaves every future date selectable and the
          // visit's own check decides, which is the only thing that can.
          availableDates={isVisit ? null : availableDates}
          isLoading={isVisit ? false : monthQuery.isLoading}
          timeZone={timeZone}
          weekShortcuts
          availabilityHint={
            isVisit
              ? 'Pick a day, then set the start time. The whole visit is checked against it.'
              : 'Green dates can fit this appointment.'
          }
          // No slot list for a visit — see the availability query above.
          onContinue={() => setMode(isVisit ? 'form' : 'time')}
        />
      </View>
    </Sheet>
  );
}

export interface ModifyTimeStepProps {
  date: string;
  effectiveDuration: number | null;
  availability: { isLoading: boolean };
  slotPeriods: SlotPeriod[];
  target: ModifyBookingTarget;
  originalTime: string;
  selectedTime: string;
  setMinutes: Dispatch<SetStateAction<number>>;
  setMode: Dispatch<SetStateAction<Mode>>;
  onClose: () => void;
}

/** Free slots on the chosen day, grouped and marked. */
export function ModifyTimeStep({
  date,
  effectiveDuration,
  availability,
  slotPeriods,
  target,
  originalTime,
  selectedTime,
  setMinutes,
  setMode,
  onClose,
}: ModifyTimeStepProps) {
  return (
    <Sheet visible fill onClose={onClose}>
      <View style={styles.stepBody}>
        <Text variant="heading">Choose a time</Text>
        <Text variant="bodySmall" tone="muted">
          {formatDayHeading(date)}
          {effectiveDuration != null ? ` · ${formatDuration(effectiveDuration)}` : ''}
        </Text>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
          {availability.isLoading ? (
            <Text variant="bodySmall" tone="muted">
              Loading free slots…
            </Text>
          ) : slotPeriods.length === 0 ? (
            <Text variant="bodySmall" tone="muted">
              No free slots on this day. Pick another date, or set the time by hand on the
              previous screen.
            </Text>
          ) : (
            slotPeriods.map((period) => (
              <View key={period.title} style={styles.fieldBlock}>
                <Text variant="label" tone="secondary">
                  {period.title}
                </Text>
                <View style={styles.chipWrap}>
                  {period.slots.map((slot) => {
                    const key = slot.start_time.slice(0, 5);
                    // Web marks the booking's CURRENT slot so staff can find
                    // their way back to it after browsing other times.
                    const isOriginal = date === target.date && key === originalTime;
                    return (
                      <Chip
                        key={`${slot.practitioner_id}-${slot.start_time}`}
                        label={isOriginal ? `${key} · now` : key}
                        selected={key === selectedTime}
                        onPress={() => {
                          hapticSelect();
                          setMinutes(timeToMinutes(slot.start_time));
                          setMode('form');
                        }}
                      />
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </ScrollView>

        <View style={styles.actions}>
          <Button
            label="Back"
            variant="secondary"
            onPress={() => setMode('date')}
            style={styles.actionButton}
          />
          <Button label="Done" onPress={() => setMode('form')} style={styles.actionButton} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stepBody: {
    flex: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  pickerPane: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  scroll: {
    flex: 1,
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
  noticeActions: {
    gap: spacing.sm,
  },
});
