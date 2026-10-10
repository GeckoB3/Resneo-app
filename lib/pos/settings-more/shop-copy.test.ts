import { postcodeEntries, zoneAreaText, zoneKind, zoneKindName, zoneSummary } from './shop-copy';

/**
 * The delivery zone words and kinds, as the web's ShopSettingsCard shows them (D24 as revised
 * 2026-10-10): the whole UK, the Republic of Ireland, or chosen UK postcodes.
 */

const HIGHLANDS = ['HS', 'IV', 'KW', 'ZE'];

describe('delivery zones in the shop settings', () => {
  it('says what each zone covers', () => {
    expect(zoneAreaText({ area: 'uk' })).toBe('The whole UK');
    expect(zoneAreaText({ area: 'ie' })).toBe('Republic of Ireland');
    expect(zoneAreaText({ area: 'postcodes', include_postcode_prefixes: ['LS6', 'LS7'] })).toBe('Postcodes LS6, LS7');
    expect(zoneAreaText({ area: 'postcodes', include_postcode_prefixes: ['A', 'B', 'C', 'D', 'E', 'F'] })).toBe('Postcodes A, B, C, D and 2 more');
  });

  it('reads a postcode zone as the Highlands one only while its list is unchanged', () => {
    expect(zoneKind({ area: 'postcodes', include_postcode_prefixes: HIGHLANDS }, HIGHLANDS)).toBe('highlands');
    expect(zoneKind({ area: 'postcodes', include_postcode_prefixes: ['HS', 'IV'] }, HIGHLANDS)).toBe('local');
    expect(zoneKind({ area: 'ie' }, HIGHLANDS)).toBe('ie');
    expect(zoneKind({ area: 'uk' }, HIGHLANDS)).toBe('uk');
    expect(zoneKindName('local')).toBe('Local delivery');
    expect(zoneKindName('uk')).toBe('');
  });

  it('splits what the venue typed into one entry per postcode', () => {
    expect(postcodeEntries('LS6, LS7\nLS16;  ')).toEqual(['LS6', 'LS7', 'LS16']);
  });

  it('writes the zone row line with the area first', () => {
    expect(zoneSummary({ area: 'ie', price_pence: 995, free_over_pence: null, estimate_text: '3 to 5 working days' }, 'GBP')).toBe(
      'Republic of Ireland · £9.95 · 3 to 5 working days',
    );
  });
});
