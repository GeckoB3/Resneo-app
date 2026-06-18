/**
 * Domain 11 (Services High): per-calendar staff override diffing. Pins the
 * null-when-equals-base rule from the web StaffServiceOverrideModal.buildPatch —
 * a field equal to the venue default sends `null` (clearing the override); a
 * changed field sends the new value; fields whose `staff_may_customize_*` flag is
 * off are never sent.
 */
import {
  buildServiceOverridePatch,
  mergeServiceWithOverride,
  poundsToPenceOrNull,
  staffMayCustomizeAny,
  staffMayCustomizeFlags,
  type ServiceOverrideDraft,
} from '@/lib/services/service-override';
import type { ManagedService, PractitionerServiceLink } from '@/types/services-manage';

const BASE: ManagedService = {
  id: 'svc-1',
  name: 'Haircut',
  description: 'A trim',
  duration_minutes: 30,
  buffer_minutes: 10,
  price_pence: 2500,
  deposit_pence: 500,
  colour: '#3B82F6',
  // All seven override flags on, so each branch of buildPatch is exercised.
  staff_may_customize_name: true,
  staff_may_customize_description: true,
  staff_may_customize_duration: true,
  staff_may_customize_buffer: true,
  staff_may_customize_price: true,
  staff_may_customize_deposit: true,
  staff_may_customize_colour: true,
};

/** A draft that matches the venue base exactly. */
function baseDraft(): ServiceOverrideDraft {
  return {
    name: 'Haircut',
    description: 'A trim',
    durationMinutes: 30,
    bufferMinutes: 10,
    price: '25.00',
    requireDeposit: true,
    deposit: '5.00',
    colour: '#3B82F6',
  };
}

describe('staffMayCustomizeFlags / staffMayCustomizeAny', () => {
  it('reads the seven flags and reports any-enabled', () => {
    expect(staffMayCustomizeAny(BASE)).toBe(true);
    const none: ManagedService = { ...BASE };
    for (const k of [
      'staff_may_customize_name',
      'staff_may_customize_description',
      'staff_may_customize_duration',
      'staff_may_customize_buffer',
      'staff_may_customize_price',
      'staff_may_customize_deposit',
      'staff_may_customize_colour',
    ] as const) {
      none[k] = false;
    }
    expect(staffMayCustomizeAny(none)).toBe(false);
    expect(staffMayCustomizeFlags(none).price).toBe(false);
  });
});

describe('poundsToPenceOrNull', () => {
  it('parses valid amounts, blanks → null, invalid/negative → null', () => {
    expect(poundsToPenceOrNull('12.50')).toBe(1250);
    expect(poundsToPenceOrNull('')).toBeNull();
    expect(poundsToPenceOrNull('  ')).toBeNull();
    expect(poundsToPenceOrNull('-3')).toBeNull();
    expect(poundsToPenceOrNull('abc')).toBeNull();
  });
});

describe('buildServiceOverridePatch — null-when-equals-base', () => {
  it('sends null for every field that equals the venue base', () => {
    const patch = buildServiceOverridePatch({ service: BASE, draft: baseDraft() });
    expect(patch).toEqual({
      service_id: 'svc-1',
      custom_name: null,
      custom_description: null,
      custom_duration_minutes: null,
      custom_buffer_minutes: null,
      custom_price_pence: null,
      custom_deposit_pence: null,
      custom_colour: null,
    });
  });

  it('sends the new value for each changed field', () => {
    const draft: ServiceOverrideDraft = {
      name: 'Premium cut',
      description: 'Longer trim',
      durationMinutes: 45,
      bufferMinutes: 5,
      price: '40.00',
      requireDeposit: true,
      deposit: '10.00',
      colour: '#EF4444',
    };
    const patch = buildServiceOverridePatch({ service: BASE, draft });
    expect(patch).toEqual({
      service_id: 'svc-1',
      custom_name: 'Premium cut',
      custom_description: 'Longer trim',
      custom_duration_minutes: 45,
      custom_buffer_minutes: 5,
      custom_price_pence: 4000,
      custom_deposit_pence: 1000,
      custom_colour: '#EF4444',
    });
  });

  it('omits fields whose staff_may_customize_* flag is off', () => {
    const service: ManagedService = {
      ...BASE,
      staff_may_customize_name: false,
      staff_may_customize_buffer: false,
      staff_may_customize_colour: false,
    };
    const draft: ServiceOverrideDraft = { ...baseDraft(), name: 'X', bufferMinutes: 99, colour: '#000000' };
    const patch = buildServiceOverridePatch({ service, draft });
    expect('custom_name' in patch).toBe(false);
    expect('custom_buffer_minutes' in patch).toBe(false);
    expect('custom_colour' in patch).toBe(false);
    // Permitted fields still present.
    expect('custom_duration_minutes' in patch).toBe(true);
  });

  it('clearing the deposit toggles sends 0 when the base had a deposit', () => {
    const draft: ServiceOverrideDraft = { ...baseDraft(), requireDeposit: false, deposit: '' };
    const patch = buildServiceOverridePatch({ service: BASE, draft });
    // Base deposit > 0 → override OFF means send 0 (not null) to clear it.
    expect(patch.custom_deposit_pence).toBe(0);
  });

  it('clearing the deposit sends null when the base had no deposit', () => {
    const service: ManagedService = { ...BASE, deposit_pence: 0 };
    const draft: ServiceOverrideDraft = { ...baseDraft(), requireDeposit: false, deposit: '' };
    const patch = buildServiceOverridePatch({ service, draft });
    expect(patch.custom_deposit_pence).toBeNull();
  });

  it('description cleared to empty maps to null (not "")', () => {
    const service: ManagedService = { ...BASE, description: 'A trim' };
    const draft: ServiceOverrideDraft = { ...baseDraft(), description: '' };
    const patch = buildServiceOverridePatch({ service, draft });
    expect(patch.custom_description).toBeNull();
  });

  it('appends calendar_id only when multipleCalendars is set', () => {
    const single = buildServiceOverridePatch({ service: BASE, draft: baseDraft(), calendarId: 'cal-1' });
    expect('calendar_id' in single).toBe(false);

    const multi = buildServiceOverridePatch({
      service: BASE,
      draft: baseDraft(),
      calendarId: 'cal-1',
      multipleCalendars: true,
    });
    expect(multi.calendar_id).toBe('cal-1');
  });
});

describe('mergeServiceWithOverride', () => {
  it('uses the override value when present, else the venue base', () => {
    const link: PractitionerServiceLink = {
      practitioner_id: 'cal-1',
      service_id: 'svc-1',
      custom_price_pence: 9999,
      custom_duration_minutes: null,
      custom_name: 'My cut',
    };
    const merged = mergeServiceWithOverride(BASE, link);
    expect(merged.name).toBe('My cut'); // overridden
    expect(merged.price_pence).toBe(9999); // overridden
    expect(merged.duration_minutes).toBe(30); // null override → base
    expect(merged.colour).toBe('#3B82F6'); // no override → base
  });

  it('falls back entirely to the base when there is no link', () => {
    const merged = mergeServiceWithOverride(BASE, null);
    expect(merged).toMatchObject({
      name: 'Haircut',
      duration_minutes: 30,
      price_pence: 2500,
      deposit_pence: 500,
    });
  });
});
