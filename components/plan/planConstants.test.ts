import { planStaffLimit } from '@/components/plan/planConstants';

/**
 * Settings-14 (High): staff seat cap. `planStaffLimit` mirrors the web
 * `plan-limits.ts planStaffLimit` (Light=1, Plus=5, Pro/restaurant/founding=∞).
 * The screen derives `staffPlanLimitReached` from it vs the member count.
 */
describe('planStaffLimit', () => {
  it('returns the per-tier seat cap (case/whitespace-insensitive)', () => {
    expect(planStaffLimit('light')).toBe(1);
    expect(planStaffLimit('LIGHT')).toBe(1);
    expect(planStaffLimit('  light  ')).toBe(1);
    expect(planStaffLimit('plus')).toBe(5);
    expect(planStaffLimit('Plus')).toBe(5);
  });

  it('treats Pro / restaurant / founding / unknown as uncapped', () => {
    expect(planStaffLimit('appointments')).toBe(Infinity);
    expect(planStaffLimit('restaurant')).toBe(Infinity);
    expect(planStaffLimit('founding')).toBe(Infinity);
    expect(planStaffLimit('something-else')).toBe(Infinity);
  });

  it('treats null/undefined/empty as uncapped (never blocks before the tier loads)', () => {
    expect(planStaffLimit(null)).toBe(Infinity);
    expect(planStaffLimit(undefined)).toBe(Infinity);
    expect(planStaffLimit('')).toBe(Infinity);
  });
});

/**
 * Mirrors the screen's derivation:
 *   staffCap = planStaffLimit(tier)
 *   reached  = staffCap !== Infinity && memberCount >= staffCap
 */
function staffPlanLimitReached(tier: string | null | undefined, memberCount: number): boolean {
  const cap = planStaffLimit(tier);
  return cap !== Infinity && memberCount >= cap;
}

describe('staffPlanLimitReached', () => {
  it('is reached on Light once a single member exists', () => {
    expect(staffPlanLimitReached('light', 0)).toBe(false);
    expect(staffPlanLimitReached('light', 1)).toBe(true);
    expect(staffPlanLimitReached('light', 2)).toBe(true);
  });

  it('is reached on Plus at 5 members', () => {
    expect(staffPlanLimitReached('plus', 4)).toBe(false);
    expect(staffPlanLimitReached('plus', 5)).toBe(true);
    expect(staffPlanLimitReached('plus', 6)).toBe(true);
  });

  it('is never reached on an uncapped tier', () => {
    expect(staffPlanLimitReached('appointments', 999)).toBe(false);
    expect(staffPlanLimitReached(null, 999)).toBe(false);
  });
});
