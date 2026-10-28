/**
 * The host's ticks across the collective, held as a diff (web `CollectiveCalendarsSection`): a
 * change back to how it is saved drops out, and backing out of the bookings question ticks again
 * the calendars it was about.
 */
import {
  collectiveCalendarState,
  EMPTY_CALENDARS_DIFF,
  isCalendarsDiffEmpty,
  keepCalendarsOffering,
  lastChangedLine,
  toggleCollectiveCalendar,
} from './collective-calendars';

const mo = { calendar_id: 'cal-m', venue_id: 'v-member' };
const amy = { calendar_id: 'cal-a', venue_id: 'v-host' };

describe('collective calendar ticks', () => {
  it('adds a calendar that does not offer it yet, and removes one that does', () => {
    const added = toggleCollectiveCalendar(EMPTY_CALENDARS_DIFF, mo, false, true);
    expect(added).toEqual({ add: [mo], remove: [] });
    const both = toggleCollectiveCalendar(added, amy, true, false);
    expect(both).toEqual({ add: [mo], remove: [amy] });
    expect(collectiveCalendarState(both, mo, false)).toEqual({ checked: true, pendingAdd: true, pendingRemove: false });
    expect(collectiveCalendarState(both, amy, true)).toEqual({ checked: false, pendingAdd: false, pendingRemove: true });
  });

  it('drops a change ticked back to how it is saved', () => {
    const added = toggleCollectiveCalendar(EMPTY_CALENDARS_DIFF, mo, false, true);
    const back = toggleCollectiveCalendar(added, mo, false, false);
    expect(isCalendarsDiffEmpty(back)).toBe(true);
    expect(collectiveCalendarState(back, mo, false).checked).toBe(false);
  });

  it('ticks again the calendars the bookings question was about, and keeps every other change', () => {
    const diff = { add: [amy], remove: [mo, { calendar_id: 'cal-z', venue_id: 'v-member' }] };
    expect(keepCalendarsOffering(diff, ['cal-m'])).toEqual({
      add: [amy],
      remove: [{ calendar_id: 'cal-z', venue_id: 'v-member' }],
    });
  });
});

describe('last changed', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const assignment = (at: string) => ({
    item_id: 'item-1',
    service_id: 's1',
    values: { custom_price_pence: null, custom_duration_minutes: null, custom_buffer_minutes: null, custom_deposit_pence: null },
    last_changed: { venue_name: 'Light 3', at },
  });

  it('names a change from the last 30 days', () => {
    expect(lastChangedLine(assignment('2026-10-20T09:00:00Z'), now)).toBe('Last changed by Light 3, 20 Oct');
  });

  it('says nothing of an older change, or none', () => {
    expect(lastChangedLine(assignment('2026-09-01T09:00:00Z'), now)).toBeNull();
    expect(lastChangedLine(null, now)).toBeNull();
  });
});
