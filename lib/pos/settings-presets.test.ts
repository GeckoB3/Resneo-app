import { draftFromPreset, presetBody } from '@/lib/pos/settings-presets';

describe('preset discount drafts', () => {
  it('sends a percentage as basis points and no amount', () => {
    const draft = { ...draftFromPreset(null), name: 'Staff', percentText: '12,5' };
    expect(presetBody(draft)).toEqual({
      name: 'Staff',
      kind: 'percent',
      percent_bps: 1250,
      amount_pence: null,
      applies_to: 'all',
      max_amount_pence: null,
      reason_required: false,
      is_active: true,
    });
  });

  it('sends an amount in pence and no percentage', () => {
    const draft = { ...draftFromPreset(null), name: 'Fiver', kind: 'amount' as const, amount_pence: 500, percentText: '10' };
    expect(presetBody(draft)).toMatchObject({ kind: 'amount', percent_bps: null, amount_pence: 500 });
  });

  it('starts an edit from the preset', () => {
    const draft = draftFromPreset({
      id: 'p',
      name: 'Loyal',
      kind: 'percent',
      percent_bps: 1500,
      amount_pence: null,
      applies_to: 'services',
      max_amount_pence: 2000,
      reason_required: true,
      is_active: false,
      sort_order: 0,
      version: 4,
    });
    expect(draft).toMatchObject({ percentText: '15', applies_to: 'services', max_amount_pence: 2000, is_active: false });
  });
});
