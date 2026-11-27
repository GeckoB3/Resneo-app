import {
  addonExtraLabel,
  addonRequirementLabel,
  formatDuration,
  MAX_MINUTES,
  stepStartMinutes,
} from '@/lib/booking/modify-booking-form';
import type { AppointmentCatalogAddonGroup } from '@/types/appointment-catalog';

describe('stepStartMinutes', () => {
  it('steps by five minutes from a clean mark', () => {
    expect(stepStartMinutes(600, 1)).toBe(605);
    expect(stepStartMinutes(600, -1)).toBe(595);
  });

  it('snaps an off-grid start to the next mark in the direction of travel', () => {
    expect(stepStartMinutes(602, 1)).toBe(605);
    expect(stepStartMinutes(602, -1)).toBe(600);
  });

  it('stays within the day', () => {
    expect(stepStartMinutes(0, -1)).toBe(0);
    expect(stepStartMinutes(MAX_MINUTES, 1)).toBe(MAX_MINUTES);
  });
});

describe('formatDuration', () => {
  it('reads minutes, hours, and both', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(95)).toBe('1h 35m');
  });
});

describe('addonExtraLabel', () => {
  it('names what an add-on adds', () => {
    expect(addonExtraLabel(1500, 10)).toBe('+£15.00 · +10 min');
    expect(addonExtraLabel(0, 10)).toBe('+10 min');
  });

  it('is null when it adds nothing', () => {
    expect(addonExtraLabel(0, 0)).toBeNull();
  });
});

describe('addonRequirementLabel', () => {
  function group(extra: Partial<AppointmentCatalogAddonGroup['group']>): AppointmentCatalogAddonGroup['group'] {
    return { selection_type: 'multiple', min_select: 0, max_select: null, ...extra } as AppointmentCatalogAddonGroup['group'];
  }

  it('reads each selection rule', () => {
    expect(addonRequirementLabel(group({ min_select: 2, max_select: 2 }))).toBe('Choose 2');
    expect(addonRequirementLabel(group({ min_select: 1 }))).toBe('Choose at least 1');
    expect(addonRequirementLabel(group({ selection_type: 'single' }))).toBe('Optional · choose one');
    expect(addonRequirementLabel(group({ max_select: 3 }))).toBe('Optional · up to 3');
    expect(addonRequirementLabel(group({}))).toBe('Optional');
  });
});
