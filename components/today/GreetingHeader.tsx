import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export function formatGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatTodayDate(d: Date = new Date()): string {
  const weekday = WEEKDAYS[d.getDay()];
  const day = d.getDate();
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return `${weekday} ${day} ${month} ${year}`;
}

type GreetingHeaderProps = {
  isAppointment: boolean;
};

export function GreetingHeader({ isAppointment }: GreetingHeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.textBlock}>
        <Text variant="overline" tone="muted">
          {WEEKDAYS[new Date().getDay()]}
        </Text>
        <Text variant="heading">{formatGreeting()}</Text>
        <Text variant="caption" tone="muted">
          {formatTodayDate()}
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          label="Calendar"
          variant="secondary"
          size="sm"
          onPress={() => router.push('/(app)/(tabs)/' as Href)}
        />
        <Button
          label={isAppointment ? 'All appointments' : 'All bookings'}
          variant="primary"
          size="sm"
          onPress={() => router.push('/(app)/(tabs)/bookings' as Href)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  textBlock: {
    gap: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
