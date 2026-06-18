import { Stack } from 'expo-router';

import { BookableCalendarsManager } from '@/components/availability/BookableCalendarsManager';
import { Screen } from '@/components/ui/Screen';

/**
 * Bookable-calendar management screen (web parity with the "Calendars" tab /
 * `BookableCalendarsPanel`). Reached from the header action on the Availability
 * screen. Admin-gated inside the manager component.
 */
export default function CalendarsScreen() {
  return (
    <Screen scroll={false} padded={false}>
      <Stack.Screen options={{ title: 'Calendars' }} />
      <BookableCalendarsManager />
    </Screen>
  );
}
