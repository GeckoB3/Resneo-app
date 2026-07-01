import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Sheet } from '@/components/ui/Sheet';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { ApiError, complianceBlockMessage } from '@/lib/api/client';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useRescheduleBooking } from '@/lib/queries/useBookingMutations';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export type RescheduleTarget = {
  id: string;
  guestName: string;
  /** Current date (YYYY-MM-DD) and time (HH:mm[:ss]). */
  date: string;
  time: string;
  /** Current length in minutes; null/undefined hides the duration stepper. */
  durationMinutes?: number | null;
  /** Original practitioner/calendar id — set only by a cross-column drag so its
   *  Undo restores the booking to its SOURCE column, not just its time. */
  practitionerId?: string | null;
};

type RescheduleSheetProps = {
  target: RescheduleTarget | null;
  onClose: () => void;
  /** Fired after a successful move with the PREVIOUS slot (for undo). */
  onMoved?: (previous: RescheduleTarget, meta: { durationChanged: boolean }) => void;
};

// API bounds: appointments accept 15–840; table bookings cap at 300 (server-validated).
const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 14 * 60;

function formatDuration(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Bottom-sheet to move/resize a booking (long-press a calendar block). */
export function RescheduleSheet({ target, onClose, onMoved }: RescheduleSheetProps) {
  const { colors } = useTheme();
  const mutation = useRescheduleBooking(target?.id ?? '');
  const isAdmin = useStaffMe().data?.staff?.role === 'admin';

  const [date, setDate] = useState('');
  const [minutes, setMinutes] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [complianceError, setComplianceError] = useState<string | null>(null);
  const [seededId, setSeededId] = useState<string | null>(null);

  // Seed editable state when the target booking changes (open/swap).
  // useEffect avoids setState-during-render in Fabric/concurrent mode —
  // it ensures user edits survive parent re-renders that keep the same id.
  useEffect(() => {
    if (!target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset seed when sheet closes
      setSeededId(null);
      return;
    }
    if (target.id === seededId) return;
    setSeededId(target.id);
    setDate(target.date);
    setMinutes(timeToMinutes(target.time));
    setDuration(target.durationMinutes ?? null);
    setError(null);
    setComplianceError(null);
  }, [target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const durationChanged =
    duration != null && target?.durationMinutes != null && duration !== target.durationMinutes;
  const unchanged = target
    ? date === target.date && minutesToTime(minutes) === target.time.slice(0, 5) && !durationChanged
    : true;

  // Flag a span that runs past midnight so "Ends at 00:30" isn't read as "before
  // it starts" (the booking ends the next day).
  const crossesMidnight = duration != null && minutes + duration >= 24 * 60;
  const endPreview =
    duration != null
      ? `${minutesToTime((minutes + duration) % (24 * 60))}${crossesMidnight ? ' (next day)' : ''}`
      : null;

  async function handleConfirm(overrideCompliance?: boolean) {
    if (!target) return;
    setError(null);
    setComplianceError(null);
    try {
      await mutation.mutateAsync({
        date,
        time: `${minutesToTime(minutes)}:00`,
        // Only send the duration when it changed — table bookings have a lower
        // server-side cap, so an untouched duration must not be re-asserted.
        ...(durationChanged ? { durationMinutes: duration } : {}),
        ...(overrideCompliance ? { overrideCompliance: true } : {}),
      });
      hapticSuccess();
      onMoved?.(target, { durationChanged });
      onClose();
    } catch (e) {
      hapticWarning();
      const compMsg = complianceBlockMessage(e);
      if (compMsg) {
        // An edit-time compliance block (block_all). An admin can override.
        setComplianceError(compMsg);
      } else {
        setError(e instanceof ApiError ? e.message : 'Could not reschedule. Try another time.');
      }
    }
  }

  return (
    <Sheet visible={!!target} onClose={onClose}>
      {target && seededId === target.id ? (
        <View style={styles.body}>
              <View style={styles.headerBlock}>
                <Text variant="overline" tone="muted">
                  Reschedule
                </Text>
                <Text variant="title">{target.guestName}</Text>
                <Text variant="bodySmall" tone="muted">
                  Now: {formatDayHeading(target.date)} · {target.time.slice(0, 5)}
                  {target.durationMinutes != null
                    ? ` · ${formatDuration(target.durationMinutes)}`
                    : ''}
                </Text>
              </View>

              {/* Date + Start are OS-native pickers (tap the value to set any
                  date/time directly) — no stepping through a long range. */}
              <View style={styles.pickerRow}>
                <Text variant="label" tone="secondary">
                  Date
                </Text>
                <DatePickerField value={date} onChange={setDate} accessibilityLabel="New date" />
              </View>
              <View style={styles.pickerRow}>
                <Text variant="label" tone="secondary">
                  Start
                </Text>
                <TimePickerField
                  value={minutes}
                  onChange={setMinutes}
                  accessibilityLabel="New start time"
                />
              </View>
              {duration != null ? (
                <Stepper
                  label="Duration"
                  value={formatDuration(duration)}
                  onDecrement={() =>
                    setDuration((d) => Math.max(MIN_DURATION_MINUTES, (d ?? 0) - 1))
                  }
                  onIncrement={() =>
                    setDuration((d) => Math.min(MAX_DURATION_MINUTES, (d ?? 0) + 1))
                  }
                />
              ) : null}
              {endPreview ? (
                <Text variant="caption" tone="muted" style={styles.endPreview}>
                  Ends at {endPreview}. Hold − / + to change duration faster.
                </Text>
              ) : null}

              {complianceError ? (
                <View
                  style={[
                    styles.complianceBlock,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}>
                  <Text variant="bodySmall" tone="danger">
                    {complianceError}
                  </Text>
                  {isAdmin ? (
                    <Button
                      label="Reschedule anyway (admin override)"
                      variant="secondary"
                      onPress={() => void handleConfirm(true)}
                      loading={mutation.isPending}
                    />
                  ) : (
                    <Text variant="caption" tone="muted">
                      Ask an admin to override, or collect the required record first.
                    </Text>
                  )}
                </View>
              ) : null}

              {error ? (
                <Text variant="bodySmall" tone="danger">
                  {error}
                </Text>
              ) : null}

              <View style={styles.actions}>
                <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.actionButton} />
                <Button
                  label="Confirm move"
                  onPress={() => void handleConfirm()}
                  loading={mutation.isPending}
                  disabled={unchanged}
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
    gap: spacing.lg,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBlock: {
    gap: spacing.xs,
  },
  endPreview: {
    marginTop: -spacing.md,
  },
  complianceBlock: {
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
});
