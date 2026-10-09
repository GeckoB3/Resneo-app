import { capabilityGroups, capabilityMapChanged, frontDeskPreset, matchingPreset, presetMap } from '@/lib/pos/settings-capabilities';

const defaults = { create_sale: true, take_payment: true, refund: false, override_price: false, custom_line: false, see_own_commission: true };

describe('team permission presets', () => {
  it('recognises the stored map as a preset or the venue own mix', () => {
    expect(matchingPreset({ ...defaults }, defaults)).toBe('team');
    expect(matchingPreset(frontDeskPreset(defaults), defaults)).toBe('frontDesk');
    expect(matchingPreset({ ...defaults, refund: true }, defaults)).toBeNull();
  });

  it('builds Front desk from the defaults plus the money and stock extras', () => {
    const map = presetMap('frontDesk', defaults);
    expect(map.refund).toBe(true);
    expect(map.override_price).toBe(true);
    expect(map.see_own_commission).toBe(true);
    expect(presetMap('team', defaults)).toEqual(defaults);
  });

  it('says when the draft differs', () => {
    expect(capabilityMapChanged({ ...defaults }, defaults)).toBe(false);
    expect(capabilityMapChanged({ ...defaults, refund: true }, defaults)).toBe(true);
  });

  it('names the client word in the saved card rows', () => {
    const money = capabilityGroups({ client: 'patient' }).find((g) => g.id === 'money')!;
    expect(money.items.find((i) => i.key === 'charge_saved_card')!.label).toBe("Charge a patient's saved card when they're not here");
    expect(money.note).toBe('alwaysAdmin');
  });
});
