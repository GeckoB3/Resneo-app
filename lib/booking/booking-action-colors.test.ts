import { ACTION_COLORS, primaryActionColors } from '@/lib/booking/booking-action-colors';

/**
 * Web-parity action colours (pure). `primaryActionColors` maps a forward status
 * transition (keyed by its TARGET status) onto a colour pair; non-forward /
 * terminal targets have no primary colour.
 */

describe('primaryActionColors', () => {
  it('uses the confirm colour for Booked and Confirmed targets', () => {
    expect(primaryActionColors('Booked')).toBe(ACTION_COLORS.confirm);
    expect(primaryActionColors('Confirmed')).toBe(ACTION_COLORS.confirm);
  });

  it('uses the start colour for Seated and the complete colour for Completed', () => {
    expect(primaryActionColors('Seated')).toBe(ACTION_COLORS.start);
    expect(primaryActionColors('Completed')).toBe(ACTION_COLORS.complete);
  });

  it('returns undefined for terminal / non-forward targets', () => {
    expect(primaryActionColors('Pending')).toBeUndefined();
    expect(primaryActionColors('No-Show')).toBeUndefined();
    expect(primaryActionColors('Cancelled')).toBeUndefined();
  });
});

describe('ACTION_COLORS', () => {
  it('defines a background/text pair for every named action', () => {
    for (const key of ['confirm', 'start', 'complete', 'arrived', 'attendance', 'noShow'] as const) {
      expect(ACTION_COLORS[key]).toEqual({
        background: expect.stringMatching(/^#[0-9A-F]{6}$/i),
        text: expect.stringMatching(/^#[0-9A-F]{6}$/i),
      });
    }
  });
});
