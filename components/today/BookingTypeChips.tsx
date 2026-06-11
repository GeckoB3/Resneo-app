import { ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const BOOKING_MODEL_ORDER = [
  'table_reservation',
  'practitioner_appointment',
  'unified_scheduling',
  'experience_event',
  'class_instance',
  'resource_booking',
] as const;

const BOOKING_MODEL_SHORT_LABELS: Record<string, string> = {
  table_reservation: 'Tables',
  practitioner_appointment: 'Appointments',
  unified_scheduling: 'Appointments',
  experience_event: 'Events',
  class_instance: 'Classes',
  resource_booking: 'Resources',
};

function sortEntries(entries: [string, number][]): [string, number][] {
  return [...entries].sort((a, b) => {
    const ia = BOOKING_MODEL_ORDER.indexOf(a[0] as (typeof BOOKING_MODEL_ORDER)[number]);
    const ib = BOOKING_MODEL_ORDER.indexOf(b[0] as (typeof BOOKING_MODEL_ORDER)[number]);
    const ra = ia >= 0 ? ia : BOOKING_MODEL_ORDER.length;
    const rb = ib >= 0 ? ib : BOOKING_MODEL_ORDER.length;
    return ra - rb;
  });
}

type BookingTypeChipsProps = {
  todayByBookingModel: Record<string, number>;
};

export function BookingTypeChips({ todayByBookingModel }: BookingTypeChipsProps) {
  const { colors } = useTheme();
  const entries = Object.entries(todayByBookingModel);

  if (entries.length <= 1) return null;

  const sorted = sortEntries(entries);

  return (
    <View style={styles.container}>
      <Text variant="overline" tone="muted">
        Today by booking type
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        <View style={styles.chips}>
          {sorted.map(([model, count]) => {
            const hasBookings = count > 0;
            return (
              <View
                key={model}
                style={[
                  styles.chip,
                  {
                    borderColor: hasBookings ? colors.border : colors.border,
                    backgroundColor: hasBookings ? colors.surface : colors.surfaceSunken,
                    borderStyle: hasBookings ? 'solid' : 'dashed',
                  },
                ]}
              >
                <Text
                  variant="label"
                  tone={hasBookings ? 'default' : 'muted'}
                >
                  {BOOKING_MODEL_SHORT_LABELS[model] ?? model}
                </Text>
                <Text
                  variant="label"
                  style={{
                    color: hasBookings ? colors.textSecondary : colors.textMuted,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {count}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  scroll: {
    marginHorizontal: -spacing.base,
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
  },
});
