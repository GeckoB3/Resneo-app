import {
  parseAvailabilityTab,
  resolveAvailabilityTab,
  visibleAvailabilityTabs,
} from '@/lib/availability/availability-tabs';

describe('availability tabs (web `parseTabQueryParam` parity)', () => {
  it('accepts every alias the web page does', () => {
    expect(parseAvailabilityTab('availability')).toBe('hours');
    expect(parseAvailabilityTab('hours')).toBe('hours');
    expect(parseAvailabilityTab('calendars')).toBe('team');
    expect(parseAvailabilityTab('team')).toBe('team');
    expect(parseAvailabilityTab('breaks')).toBe('breaks');
    expect(parseAvailabilityTab('closures')).toBe('daysoff');
    expect(parseAvailabilityTab('time-off')).toBe('daysoff');
    expect(parseAvailabilityTab('unavailability')).toBe('daysoff');
    expect(parseAvailabilityTab(' Daysoff ')).toBe('daysoff');
  });

  it('ignores anything else, and takes the first of a repeated param', () => {
    expect(parseAvailabilityTab('table')).toBeNull();
    expect(parseAvailabilityTab(undefined)).toBeNull();
    expect(parseAvailabilityTab(['breaks', 'team'])).toBe('breaks');
  });

  it('lands an admin on Calendars and everyone else on Availability', () => {
    expect(resolveAvailabilityTab(undefined, true)).toBe('team');
    expect(resolveAvailabilityTab(undefined, false)).toBe('hours');
  });

  it('bounces a non-admin asking for Calendars to Availability', () => {
    expect(resolveAvailabilityTab('team', false)).toBe('hours');
    expect(resolveAvailabilityTab('team', true)).toBe('team');
    expect(resolveAvailabilityTab('closures', false)).toBe('daysoff');
  });

  it('hides the Calendars tab from a non-admin', () => {
    expect(visibleAvailabilityTabs(true).map((t) => t.key)).toEqual([
      'team',
      'hours',
      'breaks',
      'daysoff',
    ]);
    expect(visibleAvailabilityTabs(false).map((t) => t.key)).toEqual([
      'hours',
      'breaks',
      'daysoff',
    ]);
  });
});
