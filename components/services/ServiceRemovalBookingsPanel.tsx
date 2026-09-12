/**
 * ServiceRemovalBookingsPanel — "these bookings are already in the diary".
 *
 * Shown when a save would take a service off a calendar that still has upcoming
 * bookings for it. The save is never refused: this lists what is already booked,
 * grouped by service × calendar, and lets the operator move each group to
 * another calendar or leave it exactly where it is.
 *
 * A PANEL, not a Sheet, on purpose. Two of the three surfaces that need it ask
 * from inside an open Sheet, and a second modal over the first is dropped
 * silently on iOS ([[ios-no-stacked-modals]]) — the same reason `ConfirmPanel`
 * exists. Drop it into a `fill` Sheet's body and it brings its own bounded
 * scroll and pinned actions ([[sheet-fill-bounded-scroll]]).
 *
 * @see C:\Resneo\src\components\scheduling\ServiceRemovalBookingsDialog.tsx (web parity)
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import {
  affectedBookingWhen,
  groupServiceRemovalBookings,
  serviceRemovalListKey,
  serviceRemovalMoves,
  serviceRemovalPrimaryLabel,
  type ServiceRemovalConfirmation,
  type ServiceRemovalMove,
  type ServiceRemovalMoveFailure,
} from '@/lib/services/service-removal';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export type ServiceRemovalCalendarOption = {
  id: string;
  name: string;
};

type Props = {
  confirmation: ServiceRemovalConfirmation;
  /**
   * Candidate destinations: ACTIVE calendars only. `/api/venue/bookings/[id]`
   * refuses a move onto a paused calendar ("Staff not available"), so offering
   * one is offering a dead end.
   */
  calendars: ServiceRemovalCalendarOption[];
  /**
   * Does `calendarId` currently offer `serviceId`? This FILTERS the destinations
   * rather than labelling them: the same route refuses a move onto a calendar
   * that does not offer the service ("Service not available with this staff member").
   */
  offersService: (calendarId: string, serviceId: string) => boolean;
  saving: boolean;
  /** Bookings that could not be moved on the last attempt, with the reason given. */
  failures: ServiceRemovalMoveFailure[];
  /** Anything that went wrong saving the removal itself. */
  error: string | null;
  onCancel: () => void;
  onConfirm: (moves: ServiceRemovalMove[]) => void;
};

export function ServiceRemovalBookingsPanel({
  confirmation,
  calendars,
  offersService,
  saving,
  failures,
  error,
  onCancel,
  onConfirm,
}: Props) {
  const { colors } = useTheme();

  const groups = useMemo(
    () => groupServiceRemovalBookings(confirmation.bookings),
    [confirmation.bookings],
  );
  // Identity of the current list: when the caller drops the bookings that did
  // move, this changes and every choice resets with it.
  const listKey = useMemo(() => serviceRemovalListKey(groups), [groups]);
  const [draft, setDraft] = useState<{ key: string; targets: Record<string, string> }>({
    key: '',
    targets: {},
  });
  const targets = draft.key === listKey ? draft.targets : {};

  function setTarget(groupKey: string, calendarId: string | null) {
    const next = { ...targets };
    if (calendarId) next[groupKey] = calendarId;
    else delete next[groupKey];
    setDraft({ key: listKey, targets: next });
  }

  const moves = serviceRemovalMoves(groups, targets);
  const failureById = useMemo(
    () => new Map(failures.map((f) => [f.bookingId, f] as const)),
    [failures],
  );

  return (
    <View style={styles.root}>
      <Text variant="overline" tone="muted">
        These bookings are already in the diary
      </Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled">
        <Text variant="bodySmall">{confirmation.message}</Text>
        <Text variant="bodySmall" tone="secondary">
          Nothing is cancelled or moved unless you choose to move it. Saving stops this calendar
          offering the service for new bookings.
        </Text>

        {error ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.notice,
              { backgroundColor: colors.dangerSurface, borderColor: colors.danger },
            ]}>
            <Text variant="bodySmall" tone="danger">
              {error}
            </Text>
          </View>
        ) : null}

        {failures.length > 0 ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.notice,
              { backgroundColor: colors.dangerSurface, borderColor: colors.danger },
            ]}>
            <Text variant="label" tone="danger">
              {failures.length === 1
                ? 'One booking could not be moved'
                : `${failures.length} bookings could not be moved`}
            </Text>
            {failures.map((failure) => (
              <Text key={failure.bookingId} variant="caption" tone="danger">
                {failure.label}: {failure.reason}
              </Text>
            ))}
            <Text variant="caption" tone="danger">
              Pick a different calendar for them, or leave them where they are and save.
            </Text>
          </View>
        ) : null}

        {confirmation.truncated ? (
          <View
            style={[
              styles.notice,
              { backgroundColor: colors.warningSurface, borderColor: colors.warning },
            ]}>
            <Text variant="caption">
              {`Showing the first ${confirmation.bookings.length} of ${confirmation.total} bookings. Only the ones listed here can be moved from this screen.`}
            </Text>
          </View>
        ) : null}

        {groups.map((group) => {
          const others = calendars.filter(
            (c) => c.id !== group.calendarId && offersService(c.id, group.serviceId),
          );
          const chosen = targets[group.key] ?? null;
          return (
            <View key={group.key} style={[styles.group, { borderColor: colors.border }]}>
              <View
                style={[
                  styles.groupHeader,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}>
                <Text variant="label">
                  {group.serviceName} on {group.calendarName}
                </Text>
                <Text variant="caption" tone="muted">
                  {group.bookings.length === 1
                    ? '1 upcoming booking'
                    : `${group.bookings.length} upcoming bookings`}
                </Text>
              </View>

              {group.bookings.map((booking) => {
                const failure = failureById.get(booking.id);
                return (
                  <View
                    key={booking.id}
                    style={[
                      styles.bookingRow,
                      { borderColor: colors.border },
                      failure ? { backgroundColor: colors.dangerSurface } : null,
                    ]}>
                    <Text variant="bodySmall">{affectedBookingWhen(booking)}</Text>
                    <Text variant="caption" tone="secondary">
                      {booking.guest_name}
                      {booking.party_size > 1 ? ` (${booking.party_size} people)` : ''} ·{' '}
                      {booking.status}
                    </Text>
                  </View>
                );
              })}

              <View style={styles.chooser}>
                <Text variant="caption" tone="muted">
                  What should happen to these bookings?
                </Text>
                <View style={styles.chips}>
                  <Chip
                    label={`Leave them on ${group.calendarName}`}
                    selected={chosen === null}
                    onPress={saving ? undefined : () => setTarget(group.key, null)}
                  />
                  {others.map((c) => (
                    <Chip
                      key={c.id}
                      label={`Move to ${c.name}`}
                      selected={chosen === c.id}
                      onPress={saving ? undefined : () => setTarget(group.key, c.id)}
                    />
                  ))}
                </View>
                {others.length === 0 ? (
                  <Text variant="caption" tone="muted">
                    {`No other calendar offers ${group.serviceName}, so there is nowhere to move these bookings. Add the service to another calendar first if you want to move them.`}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.actions}>
        <Button
          label="Cancel"
          variant="secondary"
          style={styles.flex1}
          disabled={saving}
          onPress={onCancel}
        />
        <Button
          label={serviceRemovalPrimaryLabel(moves.length)}
          style={styles.flex1}
          loading={saving}
          onPress={() => onConfirm(moves)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: spacing.sm },
  scroll: { flex: 1 },
  body: { gap: spacing.md, paddingBottom: spacing.md },
  notice: {
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  group: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  groupHeader: {
    gap: 2,
    borderBottomWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bookingRow: {
    gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chooser: { gap: spacing.sm, padding: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex1: { flex: 1 },
});
