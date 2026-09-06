/**
 * WorkingHoursEditor — the standard weekly working hours of one calendar.
 *
 * The seven weekday rows come from {@link WeeklyHoursFields} (shared with the
 * schedule-change form, so a planned week edits exactly like the standard
 * week). Saves the FULL set of ranges per open day via usePatchPractitioner
 * (PATCH /api/venue/practitioners), with the 409 "save anyway" flow.
 *
 * Web parity: `AppointmentAvailabilitySettings.tsx` "Availability" tab,
 * `WorkingHoursControl` + `saveWorkingHours`.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  WeeklyHoursFields,
  hoursFromWeekState,
  weekStateFromHours,
  type WeekState,
} from '@/components/availability/WeeklyHoursFields';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import { ApiError, isRequiresConfirmationBody } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { usePatchPractitioner } from '@/lib/queries/useAvailabilityManage';
import { useToast } from '@/providers/ToastProvider';
import { spacing, radius } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { WorkingHoursMap } from '@/types/availability-manage';
import type { OpeningHours } from '@/types/venue';

type Props = {
  practitionerId: string;
  practitionerName: string;
  currentWorkingHours?: WorkingHoursMap;
  /**
   * The venue's weekly opening hours, shown as read-only context beside each
   * day. Taken as a prop rather than read from `VenueProvider` so this stays
   * renderable on its own; the caller already holds the bootstrap.
   */
  venueOpeningHours?: OpeningHours | null;
  onClose: () => void;
};

export function WorkingHoursEditor({
  practitionerId,
  practitionerName,
  currentWorkingHours,
  venueOpeningHours,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const toast = useToast();
  const patchPractitioner = usePatchPractitioner();

  const [days, setDays] = useState<WeekState>(() => weekStateFromHours(currentWorkingHours));

  // "Save anyway?" — narrowing this calendar's hours can orphan upcoming
  // bookings; the route replies 409 `{ requires_confirmation, message }`. We
  // keep the validated payload so the confirm can re-save with `acknowledge`.
  const [ackConfirm, setAckConfirm] = useState<{ message: string; payload: WorkingHoursMap } | null>(
    null,
  );

  async function handleSave() {
    const built = hoursFromWeekState(days, 'empty');
    if (!built.ok) {
      toast.error(built.error);
      return;
    }
    const workingHours = built.hours;
    try {
      await patchPractitioner.mutateAsync({ id: practitionerId, working_hours: workingHours });
      hapticSuccess();
      onClose();
      toast.success('Working hours saved.');
    } catch (e) {
      // 409 with requires_confirmation → ask, then re-save acknowledged.
      if (e instanceof ApiError && e.status === 409 && isRequiresConfirmationBody(e.body)) {
        hapticWarning();
        setAckConfirm({
          message:
            e.body.message ??
            'Some upcoming bookings fall outside the new hours. Save these hours anyway?',
          payload: workingHours,
        });
        return;
      }
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not save. Please try again.');
    }
  }

  /** User confirmed the orphan-bookings warning — re-save with the acknowledge flag. */
  async function handleConfirmAck() {
    if (!ackConfirm) return;
    try {
      await patchPractitioner.mutateAsync({
        id: practitionerId,
        working_hours: ackConfirm.payload,
        acknowledge: true,
      });
      setAckConfirm(null);
      hapticSuccess();
      onClose();
      toast.success('Working hours saved.');
    } catch (e) {
      setAckConfirm(null);
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not save. Please try again.');
    }
  }

  return (
    <View style={styles.root}>
      <Text variant="overline" tone="muted">
        Working hours — {practitionerName}
      </Text>

      <View
        style={[
          styles.infoNote,
          { backgroundColor: colors.brandSubtle, borderColor: colors.brandBorder },
        ]}>
        <Text variant="caption" tone="secondary" style={styles.infoText}>
          These hours are when this calendar can take bookings, but a time is only bookable where
          it also falls within your venue&apos;s business hours. To open bookings earlier or later,
          widen Settings → Business hours as well.
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        <WeeklyHoursFields
          value={days}
          onChange={setDays}
          venueOpeningHours={venueOpeningHours}
          disabled={patchPractitioner.isPending}
        />
      </ScrollView>

      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} />
        <Button
          label="Save hours"
          style={styles.flex1}
          loading={patchPractitioner.isPending}
          onPress={() => void handleSave()}
        />
      </View>

      {/* "Save anyway?" — orphan-bookings confirmation (409 requires_confirmation). */}
      <ConfirmSheet
        visible={ackConfirm != null}
        title="Save these hours anyway?"
        message={ackConfirm?.message}
        confirmLabel="Save anyway"
        destructive={false}
        loading={patchPractitioner.isPending}
        onConfirm={() => void handleConfirmAck()}
        onClose={() => {
          if (!patchPractitioner.isPending) setAckConfirm(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: spacing.md,
    // `fill` Sheets supply no horizontal padding (they delegate it to the
    // child), so pad the editor itself to match the standard sheet inset.
    paddingHorizontal: spacing.lg,
  },
  infoNote: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  infoText: {
    lineHeight: 18,
  },
  list: {
    gap: 0,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  flex1: { flex: 1 },
});
