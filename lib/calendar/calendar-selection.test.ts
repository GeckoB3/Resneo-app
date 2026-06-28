import { nextVisibleCalendars } from '@/lib/calendar/calendar-selection';

const ALL = ['a', 'b', 'c'];

describe('nextVisibleCalendars', () => {
  it('isolates to one calendar when starting from "all" (null)', () => {
    expect(nextVisibleCalendars(null, 'b', ALL)).toEqual(['b']);
  });

  it('adds a calendar to an existing subset, preserving allIds order', () => {
    expect(nextVisibleCalendars(['c'], 'a', ALL)).toEqual(['a', 'c']);
  });

  it('removes a calendar from a subset of more than one', () => {
    expect(nextVisibleCalendars(['a', 'b'], 'a', ALL)).toEqual(['b']);
  });

  it('clears back to "all" when the sole selection is tapped again', () => {
    expect(nextVisibleCalendars(['b'], 'b', ALL)).toBeNull();
  });

  it('normalizes to "all" (null) when the last missing calendar is added', () => {
    expect(nextVisibleCalendars(['a', 'b'], 'c', ALL)).toBeNull();
  });

  it('is a no-op-to-all when toggling on a single-calendar venue', () => {
    expect(nextVisibleCalendars(null, 'a', ['a'])).toBeNull();
  });

  it('treats linked-venue keys as ordinary members of the combined set', () => {
    const combined = ['a', 'b', 'linked:v1'];
    // From "all", tapping the linked venue isolates to just it.
    expect(nextVisibleCalendars(null, 'linked:v1', combined)).toEqual(['linked:v1']);
    // Adding own + linked builds a mixed subset (ordered by the combined list).
    expect(nextVisibleCalendars(['a'], 'linked:v1', combined)).toEqual(['a', 'linked:v1']);
    // Selecting everything (own + linked) collapses back to "all".
    expect(nextVisibleCalendars(['a', 'b'], 'linked:v1', combined)).toBeNull();
  });
});
