import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { calendarDateInTimeZone } from '@/lib/dates/venue-dates';
import { spacing } from '@/theme/index';

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Hour-of-day (0–23) of "now" in the given IANA tz; device clock when unset. */
function hourInZone(timeZone?: string): number {
  if (!timeZone) return new Date().getHours();
  const parsed = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(new Date()),
  );
  return Number.isFinite(parsed) ? parsed % 24 : new Date().getHours();
}

export function formatGreeting(timeZone?: string): string {
  const hour = hourInZone(timeZone);
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Weekday/day/month/year of "now" in the given tz. The venue-local Y-M-D is
 * anchored at noon UTC (then read via getUTC*) to avoid the day slips a raw
 * device-local Date hits near midnight. Falls back to the device clock when no
 * timezone is supplied.
 */
function nowParts(timeZone?: string): { weekday: number; day: number; month: number; year: number } {
  if (!timeZone) {
    const d = new Date();
    return { weekday: d.getDay(), day: d.getDate(), month: d.getMonth(), year: d.getFullYear() };
  }
  // Reuse the shared, tested venue-tz date helper, then read the calendar parts at
  // noon UTC (the repo's day-boundary convention) so they never slip near midnight.
  const noon = new Date(`${calendarDateInTimeZone(new Date(), timeZone)}T12:00:00Z`);
  return {
    weekday: noon.getUTCDay(),
    day: noon.getUTCDate(),
    month: noon.getUTCMonth(),
    year: noon.getUTCFullYear(),
  };
}

export function formatWeekday(timeZone?: string): string {
  return WEEKDAYS[nowParts(timeZone).weekday];
}

export function formatTodayDate(timeZone?: string): string {
  const { weekday, day, month, year } = nowParts(timeZone);
  return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month]} ${year}`;
}

type GreetingHeaderProps = {
  isAppointment: boolean;
  /** Venue IANA timezone, so the weekday/date/greeting match the venue-local
   *  "today" the dashboard figures are computed for (not the device clock). */
  timeZone?: string;
};

export function GreetingHeader({ isAppointment, timeZone }: GreetingHeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.textBlock}>
        <Text variant="overline" tone="muted">
          {formatWeekday(timeZone)}
        </Text>
        <Text variant="heading">{formatGreeting(timeZone)}</Text>
        <Text variant="caption" tone="muted">
          {formatTodayDate(timeZone)}
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
