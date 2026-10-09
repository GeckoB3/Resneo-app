/**
 * The diary's colour key: what each closed stripe's tint means.
 *
 * Port of the web `CalendarKeyDialog` (`CALENDAR_KEY_ENTRIES`, spec §8.2,
 * amended 2026-09-19): the same five entries, in the same order, with the same
 * labels. The web offers the key to everyone, with no venue gate, so the app
 * does too.
 *
 * Each entry names the band type the app's grids actually draw for that cause
 * (`closure-band.ts`), so the swatch in the key is the app's own look rather
 * than a copy of the web's classes. A linked venue's column draws each of
 * these causes in the same look as an own column (`scheduleClosureDisplayType`),
 * as the description says.
 */
import type { ClosureBandLook } from '@/components/calendar/closure-band';
import { closureBandLook } from '@/components/calendar/closure-band';

export interface CalendarKeyEntry {
  label: string;
  meaning: string;
  /** The band type whose look the swatch shows (see `closureBandLook`). */
  blockType: string;
}

export const CALENDAR_KEY_TITLE = 'What the colours mean';

export const CALENDAR_KEY_DESCRIPTION =
  "Linked venues' calendars use the same colours as your own, drawn from their own hours and closures.";

export const CALENDAR_KEY_FOOTNOTE =
  "Staff can book over a closed stripe on your own calendars, with a note, but never inside a linked venue's closed hours.";

export const CALENDAR_KEY_ENTRIES: readonly CalendarKeyEntry[] = [
  {
    label: 'Venue closed',
    meaning:
      'The business is shut, from its opening hours, a closure or amended hours. The calendar would otherwise be working.',
    blockType: 'venue_closed',
  },
  {
    label: 'Calendar unavailable',
    meaning:
      'The business is open but this calendar is not working: its hours, a day off, or amended hours for the day.',
    blockType: 'practitioner_closed',
  },
  {
    label: 'Closed, Unavailable or On leave',
    meaning:
      'A closure entered for this calendar, with the words its Label gives it. Nothing can be booked over it.',
    blockType: 'practitioner_leave',
  },
  {
    label: 'Calendar closed',
    meaning:
      'The business is shut and the calendar is not working either.',
    blockType: 'venue_and_calendar_closed',
  },
  {
    label: 'Break',
    meaning: 'A break set in Calendar availability.',
    blockType: 'break',
  },
];

/** The swatch for an entry: exactly the band the grids draw for its cause. */
export function calendarKeySwatch(entry: CalendarKeyEntry, isDark: boolean): ClosureBandLook {
  const look = closureBandLook(entry.blockType, isDark);
  if (!look) {
    // Every entry names a band type `closure-band.ts` knows; the test pins it.
    throw new Error(`No closure band look for ${entry.blockType}`);
  }
  return look;
}
