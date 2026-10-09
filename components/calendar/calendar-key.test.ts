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

  it('says a linked venue closed hours share the slate look, as the app draws them', () => {
    const slate = CALENDAR_KEY_ENTRIES.find((e) => e.label === 'Calendar closed')!;
    expect(closureBandLook('linked_venue_closed')).toEqual(calendarKeySwatch(slate, false));
    expect(slate.meaning).toMatch(/linked venue/i);
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
