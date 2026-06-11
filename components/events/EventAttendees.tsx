import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { ACTION_COLORS } from '@/lib/booking/booking-action-colors';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useEventAttendees, useToggleAttendeeArrived } from '@/lib/queries/useExperienceEvents';
import { minTouchTarget, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingListRow } from '@/types/booking-list';

type EventAttendeesProps = {
  /** experience_events.id */
  eventId: string;
  /** Opens the full booking detail (BookingDetailSheet) for a ticket holder. */
  onOpenBooking: (bookingId: string) => void;
};

/** Same gate as the web event-manager's attendee Arrived/Clear actions. */
function canToggleArrived(status: string): boolean {
  return status === 'Pending' || status === 'Booked' || status === 'Confirmed';
}

function contactLine(row: BookingListRow): string | null {
  const parts = [row.guest_email, row.guest_phone].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function arrivedLabel(arrivedAt: string): string {
  const d = new Date(arrivedAt);
  if (Number.isNaN(d.getTime())) return 'Arrived';
  return `Arrived ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Ticket-holder roster for one event. Rows tap through to the full booking
 * detail; Pending/Booked/Confirmed rows get the web-parity Arrived/Clear
 * toggle. Errors surface inline (no Alert-only feedback).
 */
export function EventAttendees({ eventId, onOpenBooking }: EventAttendeesProps) {
  const { colors } = useTheme();
  const query = useEventAttendees(eventId);
  const toggleArrived = useToggleAttendeeArrived();
  const [actionError, setActionError] = useState<string | null>(null);

  const handleToggle = (row: BookingListRow, arrived: boolean) => {
    setActionError(null);
    toggleArrived.mutate(
      { bookingId: row.id, arrived },
      {
        onSuccess: () => {
          hapticSuccess();
        },
        onError: (error) => {
          hapticWarning();
          setActionError(
            error instanceof ApiError ? error.message : 'Could not update arrived status.',
          );
        },
      },
    );
  };

  if (query.isLoading) {
    return (
      <View style={styles.stateRow}>
        <ActivityIndicator size="small" color={colors.brand} />
        <Text variant="caption" tone="muted">
          Loading attendees…
        </Text>
      </View>
    );
  }

  if (query.isError) {
    return (
      <View style={styles.stateBlock}>
        <Text variant="bodySmall" tone="danger">
          {query.error instanceof ApiError
            ? query.error.message
            : 'Could not load the attendee list.'}
        </Text>
        <Button
          label="Try again"
          size="sm"
          variant="secondary"
          onPress={() => void query.refetch()}
        />
      </View>
    );
  }

  const attendees = query.data ?? [];

  if (attendees.length === 0) {
    return (
      <View style={styles.stateBlock}>
        <Text variant="bodySmall" tone="secondary">
          No ticket holders yet. Bookings appear here as guests book this event.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {actionError ? (
        <Text variant="caption" tone="danger">
          {actionError}
        </Text>
      ) : null}
      {attendees.map((row) => {
        const isArrived = Boolean(row.client_arrived_at);
        const rowBusy =
          toggleArrived.isPending && toggleArrived.variables?.bookingId === row.id;
        const tickets = `${row.party_size} ticket${row.party_size === 1 ? '' : 's'}`;
        const contact = contactLine(row);

        return (
          <View
            key={row.id}
            style={[styles.row, { borderBottomColor: colors.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open booking for ${row.guest_name}`}
              onPress={() => onOpenBooking(row.id)}
              style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}>
              <View style={styles.rowHeader}>
                <Text variant="bodyMedium" numberOfLines={1} style={styles.rowName}>
                  {row.guest_name || 'Guest'}
                </Text>
                <StatusPill status={row.status} />
              </View>
              <Text variant="caption" tone="secondary">
                {tickets}
                {isArrived && row.client_arrived_at
                  ? ` · ${arrivedLabel(row.client_arrived_at)}`
                  : ''}
              </Text>
              {contact ? (
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {contact}
                </Text>
              ) : null}
            </Pressable>
            {canToggleArrived(row.status) ? (
              <View style={styles.rowAction}>
                {rowBusy ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : isArrived ? (
                  <Button
                    label="Clear"
                    size="sm"
                    variant="ghost"
                    onPress={() => handleToggle(row, false)}
                  />
                ) : (
                  <Button
                    label="Arrived"
                    size="sm"
                    variant="secondary"
                    customColors={ACTION_COLORS.arrived}
                    onPress={() => handleToggle(row, true)}
                  />
                )}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.base,
  },
  stateBlock: {
    gap: spacing.sm,
    paddingTop: spacing.base,
    alignItems: 'flex-start',
  },
  list: {
    paddingTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  rowMain: {
    flex: 1,
    gap: 2,
    minHeight: minTouchTarget,
    justifyContent: 'center',
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowName: {
    flex: 1,
  },
  rowAction: {
    minWidth: 76,
    alignItems: 'flex-end',
  },
});
