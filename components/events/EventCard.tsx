import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import type { ExperienceEventSummary } from '@/lib/queries/useExperienceEvents';
import { minTouchTarget, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type EventCardProps = {
  event: ExperienceEventSummary;
  /** Today's venue-local date (YYYY-MM-DD) — flags the "Today" badge. */
  today: string;
  /** Expanded shows the attendee roster passed as children. */
  expanded: boolean;
  onToggle: () => void;
  /** Roster content rendered below the header when expanded. */
  children?: ReactNode;
};

function ticketsLabel(event: ExperienceEventSummary): string {
  if (event.capacity !== null && event.capacity > 0) {
    return `${event.ticketsSold}/${event.capacity} tickets`;
  }
  return `${event.ticketsSold} tickets`;
}

/**
 * One row in the staff Events list: name, date/time window, tickets
 * sold vs capacity, and an expandable attendee roster (web parity with the
 * event-manager's event cards + inline detail).
 */
export function EventCard({ event, today, expanded, onToggle, children }: EventCardProps) {
  const { colors } = useTheme();

  const isToday = event.date === today;
  const soldOut = event.capacity !== null && event.capacity > 0 && event.ticketsSold >= event.capacity;
  const bookingsLine =
    event.bookingCount === 0
      ? 'No bookings yet'
      : `${event.bookingCount} booking${event.bookingCount === 1 ? '' : 's'}` +
        (event.arrivedCount > 0 ? ` · ${event.arrivedCount} arrived` : '');

  return (
    <Card padded={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${event.name}, ${formatDayHeading(event.date)}, ${ticketsLabel(event)}`}
        onPress={onToggle}
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.8 }]}>
        <View style={styles.headerText}>
          <Text variant="bodyMedium" numberOfLines={2}>
            {event.name}
          </Text>
          <Text variant="bodySmall" tone="secondary">
            {formatDayHeading(event.date)} · {event.startTime} – {event.endTime}
          </Text>
          <Text variant="caption" tone="muted">
            {bookingsLine}
          </Text>
        </View>
        <View style={styles.badges}>
          {isToday ? <Badge label="Today" tone="brand" solid /> : null}
          <Badge label={ticketsLabel(event)} tone={soldOut ? 'danger' : 'brand'} />
          <Text variant="caption" tone="muted">
            {expanded ? 'Hide attendees' : 'Attendees'}
          </Text>
        </View>
      </Pressable>
      {expanded ? (
        <View style={[styles.body, { borderTopColor: colors.border }]}>{children}</View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.base,
    minHeight: minTouchTarget,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  badges: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  body: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
  },
});
