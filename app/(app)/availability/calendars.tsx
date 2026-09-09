import { Redirect } from 'expo-router';

/**
 * The bookable-calendar manager used to be its own route; it is now the
 * Calendars tab of the Availability screen (web parity). Anything still
 * linking here lands on that tab.
 */
export default function CalendarsScreen() {
  return <Redirect href="/availability?tab=team" />;
}
