import {
  CALENDAR_KEY_DESCRIPTION,
  CALENDAR_KEY_ENTRIES,
  CALENDAR_KEY_FOOTNOTE,
  CALENDAR_KEY_TITLE,
  calendarKeySwatch,
} from '@/components/calendar/calendar-key';
import { closureBandLook } from '@/components/calendar/closure-band';

/**
 * The colour key is the web's `CALENDAR_KEY_ENTRIES` (same labels, same order),
 * but each swatch is the band the app's grids draw for that cause.
 */
describe('calendar colour key', () => {
  it('lists the web entries in the web order', () => {
    expect(CALENDAR_KEY_ENTRIES.map((e) => e.label)).toEqual([
      'Venue closed',
      'Calendar unavailable',
      'Closed, Unavailable or On leave',
      'Calendar closed',
      'Break',
    ]);
    expect(CALENDAR_KEY_TITLE).toBe('What the colours mean');
  });

  it('draws each swatch with the band look the grids use, light and dark', () => {
    for (const entry of CALENDAR_KEY_ENTRIES) {
      for (const isDark of [false, true]) {
        expect(calendarKeySwatch(entry, isDark)).toEqual(closureBandLook(entry.blockType, isDark));
      }
    }
  });

  it('keeps the web tints for each cause', () => {
    const accents = Object.fromEntries(
      CALENDAR_KEY_ENTRIES.map((e) => [e.label, calendarKeySwatch(e, false).accent]),
    );
    expect(accents).toEqual({
      'Venue closed': '#E11D48',
      'Calendar unavailable': '#0284C7',
      'Closed, Unavailable or On leave': '#7C3AED',
      'Calendar closed': '#94A3B8',
      Break: '#D97706',
    });
  });

  it("draws a linked venue's resolved closures with their own-column entry's swatch", () => {
    const entry = (label: string) => CALENDAR_KEY_ENTRIES.find((e) => e.label === label)!;
    for (const isDark of [false, true]) {
      expect(closureBandLook('linked_business_closed', isDark)).toEqual(
        calendarKeySwatch(entry('Venue closed'), isDark),
      );
      expect(closureBandLook('linked_calendar_closed', isDark)).toEqual(
        calendarKeySwatch(entry('Calendar unavailable'), isDark),
      );
      expect(closureBandLook('linked_leave', isDark)).toEqual(
        calendarKeySwatch(entry('Closed, Unavailable or On leave'), isDark),
      );
      expect(closureBandLook('linked_both_closed', isDark)).toEqual(
        calendarKeySwatch(entry('Calendar closed'), isDark),
      );
    }
  });

  it("keeps an older feed's linked_venue_closed slate, and no longer singles linked venues out", () => {
    const slate = CALENDAR_KEY_ENTRIES.find((e) => e.label === 'Calendar closed')!;
    expect(closureBandLook('linked_venue_closed')).toEqual(calendarKeySwatch(slate, false));
    expect(slate.meaning).not.toMatch(/linked venue/i);
    expect(CALENDAR_KEY_DESCRIPTION).toMatch(/same colours as your own/);
  });

  it('uses no em-dash anywhere', () => {
    const copy = [
      CALENDAR_KEY_TITLE,
      CALENDAR_KEY_DESCRIPTION,
      CALENDAR_KEY_FOOTNOTE,
      ...CALENDAR_KEY_ENTRIES.flatMap((e) => [e.label, e.meaning]),
    ].join('\n');
    expect(copy).not.toContain('—');
  });
});
