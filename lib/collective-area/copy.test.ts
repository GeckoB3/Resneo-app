/** `areaCopy` names a person once beside a member business (web `collectiveCopy` parity, 2026-11-22). */
import { areaCopy } from '@/lib/collective-area/copy';

describe('areaCopy', () => {
  it('names Jenny once beside a member told apart by her (COLLECTIVE-SETUP-3)', () => {
    expect(areaCopy('values.help.host', { calendar: 'Jenny', venue: 'Aura Hair Studio (Jenny)' })).toBe(
      'What Jenny at Aura Hair Studio charges and takes for this service. Aura Hair Studio (Jenny) is told when you change it.',
    );
  });

  it('keeps an older label that already names the person, and leaves a missing value visible', () => {
    expect(areaCopy('svc.save.calendarFailed', { calendar: 'Jenny', venue: 'Jenny at Aura', reason: 'it is in use' })).toBe(
      'Jenny at Aura could not be changed: it is in use.',
    );
    expect(areaCopy('svc.save.calendarFailed', { venue: 'Light 16', reason: 'it is in use' })).toBe(
      '{calendar} at Light 16 could not be changed: it is in use.',
    );
  });
});
