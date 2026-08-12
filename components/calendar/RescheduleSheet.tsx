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
import {
  minimumVisitFloorMinutes,
  type VisitEditTarget,
} from '@/lib/booking/appointment-visit';
import { MIN_CORE_DURATION_MINUTES } from '@/lib/booking/booking-core-duration';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useRescheduleBooking } from '@/lib/queries/useBookingMutations';
import { useVisitSchedule } from '@/lib/queries/useVisitMutations';
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
  /**
   * Set when this booking is one service of a multi-service visit. The move then
   * goes through the visit endpoint and carries every service with it: PATCHing
   * this row alone took the visit's head away and left its tail behind.
   */
  visit?: VisitEditTarget | null;
};

type RescheduleSheetProps = {
  target: RescheduleTarget | null;
  onClose: () => void;
  /** Fired after a successful move with the PREVIOUS slot (for undo). */
  onMoved?: (previous: RescheduleTarget, meta: { durationChanged: boolean }) => void;
};

// API bounds: appointments accept 5–840; table bookings cap at 300 (server-validated).
// The floor is the ONE shared floor, so a 5-minute service can actually be
// booked at its own length here, on the drag-resize and in the Modify sheet.
const MIN_DURATION_MINUTES = MIN_CORE_DURATION_MINUTES;
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
  const visitMutation = useVisitSchedule(target?.visit?.groupBookingId);
  const isAdmin = useStaffMe().data?.staff?.role === 'admin';
  const visit = target?.visit ?? null;
  const pending = visit ? visitMutation.isPending : mutation.isPending;
  /**
   * A visit's floor is its services' floors added up. Deliberately ignores the
   * gaps between them, which the server adds: staying below the server's floor
   * means no reachable length is blocked here, and asking for one that is
   * genuinely too short comes back naming the real minimum.
   */
  const minDuration = visit
    ? minimumVisitFloorMinutes(visit.serviceCount)
    : MIN_DURATION_MINUTES;

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
      if (visit) {
        /**
         * One write for every service. The endpoint plans them all, checks each
         * against the availability engine and rolls back anything it already
         * wrote if one is refused, so the visit either moves whole or not at all.
         *
         * No `overrideCompliance` here: the visit endpoint has no such flag. A
         * compliance block on a visit is reported and the move is refused, which
         * is the safe direction — the admin override stays available on the
         * single-booking path.
         */
        await visitMutation.mutateAsync({
          booking_date: date,
          booking_time: `${minutesToTime(minutes)}:00`,
          ...(durationChanged && duration != null
            ? { total_duration_minutes: duration }
            : {}),
          // Staff moving a visit by hand have decided where it goes; the same
          // posture as the single-booking path above.
          allow_outside_hours: true,
        });
      } else {
        await mutation.mutateAsync({
          date,
          time: `${minutesToTime(minutes)}:00`,
          // Only send the duration when it changed — table bookings have a lower
          // server-side cap, so an untouched duration must not be re-asserted.
          ...(durationChanged ? { durationMinutes: duration } : {}),
          ...(overrideCompliance ? { overrideCompliance: true } : {}),
        });
      }
      hapticSuccess();
      onMoved?.(target, { durationChanged });
      onClose();
    } catch (e) {
      hapticWarning();
      // A visit's compliance block is shown as a plain refusal: the visit
      // endpoint takes no override flag, so offering an admin an override button
      // that cannot be honoured would be worse than not offering one.
      const compMsg = visit ? null : complianceBlockMessage(e);
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
                  {visit ? 'Reschedule visit' : 'Reschedule'}
                </Text>
                <Text variant="title">{target.guestName}</Text>
                <Text variant="bodySmall" tone="muted">
                  Now: {formatDayHeading(target.date)} · {target.time.slice(0, 5)}
                  {target.durationMinutes != null
                    ? ` · ${formatDuration(target.durationMinutes)}`
                    : ''}
                </Text>
                {visit ? (
                  <Text variant="caption" tone="muted">
                    All {visit.serviceCount} services move together:{' '}
                    {visit.serviceNames.join(', ')}.
                  </Text>
                ) : null}
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
                  label={visit ? 'Visit length' : 'Duration'}
                  value={formatDuration(duration)}
                  onDecrement={() => setDuration((d) => Math.max(minDuration, (d ?? 0) - 1))}
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
              {visit && durationChanged ? (
                <Text variant="caption" tone="muted" style={styles.endPreview}>
                  Extra time goes on the last service; time taken off comes off the last
                  service first, then the ones before it.
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
                      loading={pending}
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
                  label={visit ? 'Move whole visit' : 'Confirm move'}
                  onPress={() => void handleConfirm()}
                  loading={pending}
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
