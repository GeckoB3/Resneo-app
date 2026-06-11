import { StyleSheet, View } from 'react-native';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { ClassSession } from '@/lib/queries/useClassSchedule';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type ClassSessionCardProps = {
  session: ClassSession;
  /** Resolved instructor/calendar column name, when known. */
  instructorName?: string | null;
  onPress: () => void;
};

/** "3/10 booked" tone — warn when nearly full, danger when full. */
function capacityTone(booked: number, capacity: number | null): BadgeTone {
  if (capacity == null || capacity <= 0) return 'neutral';
  if (booked >= capacity) return 'danger';
  if (booked / capacity >= 0.8) return 'warning';
  return 'success';
}

/**
 * One upcoming class session on the timetable: colour strip (class type
 * colour), time range, name, instructor column and booked/capacity badge.
 * Tapping opens the session roster.
 */
export function ClassSessionCard({ session, instructorName, onPress }: ClassSessionCardProps) {
  const { colors } = useTheme();
  const stripColor = session.accentColour ?? colors.brand;
  const capacityLabel =
    session.capacity != null && session.capacity > 0
      ? `${session.bookedSpots}/${session.capacity} booked`
      : `${session.bookedSpots} booked`;

  return (
    <Card
      padded={false}
      style={styles.card}
      onPress={onPress}
      accessibilityLabel={`${session.name}, ${session.startTime} to ${session.endTime}, ${capacityLabel}`}
      accessibilityHint="Opens the session roster">
      <View style={[styles.strip, { backgroundColor: stripColor }]} />
      <View style={styles.body}>
        <View style={styles.timeColumn}>
          <Text variant="bodyMedium">{session.startTime}</Text>
          <Text variant="caption" tone="muted">
            {session.endTime}
          </Text>
        </View>
        <View style={styles.main}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {session.name}
          </Text>
          {instructorName ? (
            <Text variant="caption" tone="secondary" numberOfLines={1}>
              {instructorName}
            </Text>
          ) : null}
        </View>
        <Badge label={capacityLabel} tone={capacityTone(session.bookedSpots, session.capacity)} />
      </View>
    </Card>
  );
}

const STRIP_WIDTH = 4;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    overflow: 'hidden',
    minHeight: minTouchTarget,
  },
  strip: {
    width: STRIP_WIDTH,
    alignSelf: 'stretch',
    borderTopLeftRadius: radius.card,
    borderBottomLeftRadius: radius.card,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.base,
  },
  timeColumn: {
    width: 52,
  },
  main: {
    flex: 1,
    gap: 2,
  },
});
