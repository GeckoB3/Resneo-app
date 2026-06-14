import {
  dedupeSlotsByStartTime,
  formatSlotTime,
  groupSlotsByPeriod,
} from '@/components/booking-wizard/TimeSlotStep';
import type { AppointmentSlot } from '@/types/appointment-availability';

/**
 * Pure, render-free helpers from the booking-wizard time-slot step.
 *
 * Only the exported pure functions are exercised here — the React component
 * (TimeSlotStep / WaitlistJoinSheet) and the clock-dependent helpers
 * (venueLocalTime / venueTodayDate) are intentionally skipped: the former need
 * rendering, the latter read `new Date()` and the local timezone, so they would
 * be non-deterministic in CI.
 *
 * Every input below is a fixed literal — nothing reads the current clock.
 */

/** Minimal AppointmentSlot fixture; only `start_time` (and the dedupe key it
 *  feeds) actually drive the functions under test, so the rest are filler. */
function slot(overrides: Partial<AppointmentSlot> & { start_time: string }): AppointmentSlot {
  return {
    practitioner_id: 'prac-1',
    practitioner_name: 'Alex',
    service_id: 'svc-1',
    service_name: 'Cut',
    duration_minutes: 30,
    price_pence: null,
    ...overrides,
  };
}

describe('formatSlotTime', () => {
  it('formats afternoon/evening times with a pm suffix', () => {
    expect(formatSlotTime('13:30')).toBe('1:30pm');
    expect(formatSlotTime('17:05')).toBe('5:05pm');
    expect(formatSlotTime('23:45')).toBe('11:45pm');
  });

  it('formats morning times with an am suffix', () => {
    expect(formatSlotTime('09:15')).toBe('9:15am');
    expect(formatSlotTime('11:59')).toBe('11:59am');
  });

  it('renders midnight (00:xx) as 12:xxam', () => {
    expect(formatSlotTime('00:00')).toBe('12:00am');
    expect(formatSlotTime('00:30')).toBe('12:30am');
  });

  it('renders noon (12:xx) as 12:xxpm', () => {
    expect(formatSlotTime('12:00')).toBe('12:00pm');
    expect(formatSlotTime('12:45')).toBe('12:45pm');
  });

  it('drops a single-digit leading zero on the hour but keeps minute padding', () => {
    expect(formatSlotTime('08:00')).toBe('8:00am');
    expect(formatSlotTime('01:09')).toBe('1:09am');
  });

  it('strips seconds (HH:mm:ss) and uses only HH:mm', () => {
    expect(formatSlotTime('14:30:00')).toBe('2:30pm');
    expect(formatSlotTime('09:05:59')).toBe('9:05am');
  });
});

describe('dedupeSlotsByStartTime', () => {
  it('collapses duplicate HH:mm start times, keeping the first occurrence', () => {
    const first = slot({ start_time: '10:00', practitioner_id: 'prac-1', practitioner_name: 'Alex' });
    const dupe = slot({ start_time: '10:00', practitioner_id: 'prac-2', practitioner_name: 'Bea' });
    const later = slot({ start_time: '10:30', practitioner_id: 'prac-3', practitioner_name: 'Cal' });

    const out = dedupeSlotsByStartTime([first, dupe, later]);

    expect(out).toHaveLength(2);
    expect(out[0]).toBe(first); // identity preserved — the kept slot is the first one
    expect(out[0].practitioner_id).toBe('prac-1');
    expect(out[1]).toBe(later);
  });

  it('treats HH:mm and HH:mm:ss with the same clock minute as duplicates', () => {
    const a = slot({ start_time: '11:15', practitioner_id: 'prac-1' });
    const b = slot({ start_time: '11:15:00', practitioner_id: 'prac-2' });

    const out = dedupeSlotsByStartTime([a, b]);

    expect(out).toHaveLength(1);
    expect(out[0]).toBe(a);
  });

  it('returns an empty array unchanged', () => {
    expect(dedupeSlotsByStartTime([])).toEqual([]);
  });

  it('keeps distinct start times in their original order', () => {
    const slots = [slot({ start_time: '09:00' }), slot({ start_time: '09:30' }), slot({ start_time: '10:00' })];
    const out = dedupeSlotsByStartTime(slots);
    expect(out.map((s) => s.start_time)).toEqual(['09:00', '09:30', '10:00']);
  });
});

describe('groupSlotsByPeriod', () => {
  it('splits slots into Morning (<12) / Afternoon (12–16) / Evening (17+)', () => {
    const periods = groupSlotsByPeriod([
      slot({ start_time: '09:00' }),
      slot({ start_time: '13:00' }),
      slot({ start_time: '18:00' }),
    ]);

    expect(periods.map((p) => p.title)).toEqual(['Morning', 'Afternoon', 'Evening']);
    expect(periods[0].slots.map((s) => s.start_time)).toEqual(['09:00']);
    expect(periods[1].slots.map((s) => s.start_time)).toEqual(['13:00']);
    expect(periods[2].slots.map((s) => s.start_time)).toEqual(['18:00']);
  });

  it('places 11:59 in Morning and 12:00 in Afternoon (noon boundary)', () => {
    const periods = groupSlotsByPeriod([slot({ start_time: '11:59' }), slot({ start_time: '12:00' })]);
    const byTitle = Object.fromEntries(periods.map((p) => [p.title, p.slots.map((s) => s.start_time)]));

    expect(byTitle.Morning).toEqual(['11:59']);
    expect(byTitle.Afternoon).toEqual(['12:00']);
  });

  it('places 16:59 in Afternoon and 17:00 in Evening (evening boundary)', () => {
    const periods = groupSlotsByPeriod([slot({ start_time: '16:59' }), slot({ start_time: '17:00' })]);
    const byTitle = Object.fromEntries(periods.map((p) => [p.title, p.slots.map((s) => s.start_time)]));

    expect(byTitle.Afternoon).toEqual(['16:59']);
    expect(byTitle.Evening).toEqual(['17:00']);
  });

  it('filters out empty groups (only the populated periods are returned)', () => {
    const periods = groupSlotsByPeriod([slot({ start_time: '08:30' })]);
    expect(periods).toHaveLength(1);
    expect(periods[0].title).toBe('Morning');
  });

  it('returns no periods for an empty slot list', () => {
    expect(groupSlotsByPeriod([])).toEqual([]);
  });

  it('preserves intra-period ordering of slots', () => {
    const periods = groupSlotsByPeriod([
      slot({ start_time: '14:00' }),
      slot({ start_time: '12:30' }),
      slot({ start_time: '16:00' }),
    ]);
    expect(periods).toHaveLength(1);
    expect(periods[0].title).toBe('Afternoon');
    expect(periods[0].slots.map((s) => s.start_time)).toEqual(['14:00', '12:30', '16:00']);
  });
});
