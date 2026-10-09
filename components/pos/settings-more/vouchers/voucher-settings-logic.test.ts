import {
  guessColumns,
  importTemplateCsv,
  normaliseHex,
  presetsWith,
  readCsvHeaders,
  voucherSettingsPatch,
} from './voucher-settings-logic';

const source = {
  preset_pence: [2500],
  custom_allowed: true,
  min_pence: 1000,
  max_pence: 50000,
  expiry_months: 12,
  terms: null,
  online_sale_enabled: false,
  accent_colour: null,
  version: 2,
  set_up: true,
};

describe('readCsvHeaders', () => {
  it('reads quoted headers with commas, doubled quotes and a line break', () => {
    expect(readCsvHeaders('\uFEFFCode,"Amount, left","Say ""hi""","Two\nlines"\r\nA,1,2,3')).toEqual([
      'Code',
      'Amount, left',
      'Say "hi"',
      'Two\nlines',
    ]);
  });

  it('guesses a semicolon or tab delimiter and drops empty cells', () => {
    expect(readCsvHeaders('Code;Balance;;Note\n1;2;;3')).toEqual(['Code', 'Balance', 'Note']);
    expect(readCsvHeaders('\n\nCode\tBalance\n')).toEqual(['Code', 'Balance']);
    expect(readCsvHeaders('')).toEqual([]);
  });

  it('reads its own template', () => {
    expect(readCsvHeaders(importTemplateCsv())).toEqual(['Code', 'Amount left', 'Use by', "Holder's name", "Holder's email", 'Note']);
  });
});

describe('guessColumns', () => {
  it('matches email before name, each header once', () => {
    expect(guessColumns(['Voucher', 'Value', 'Valid until', "Holder's email", "Holder's name", 'Comments'])).toEqual({
      code: 'Voucher',
      balance: 'Value',
      expiry: 'Valid until',
      holder_email: "Holder's email",
      holder_name: "Holder's name",
      note: 'Comments',
    });
  });
});

describe('voucherSettingsPatch', () => {
  it('sends only what changed once set up', () => {
    expect(voucherSettingsPatch(source, { custom_allowed: true, min_pence: 500 })).toEqual({ min_pence: 500 });
  });

  it('sends every field before set-up', () => {
    expect(Object.keys(voucherSettingsPatch({ ...source, set_up: false }, {}))).toHaveLength(8);
  });

  it('counts an emptied months field as a change', () => {
    expect(voucherSettingsPatch({ ...source, expiry_months: null }, { expiry_months: Number.NaN })).toHaveProperty('expiry_months');
  });
});

it('adds presets in order, up to five, never twice', () => {
  expect(presetsWith([5000], 2500)).toEqual([2500, 5000]);
  expect(presetsWith([5000], 5000)).toBeNull();
  expect(presetsWith([1, 2, 3, 4, 5], 600)).toBeNull();
  expect(presetsWith([], null)).toBeNull();
});

it('reads a colour code', () => {
  expect(normaliseHex('003b6f')).toBe('#003B6F');
  expect(normaliseHex('#00C2C7')).toBe('#00C2C7');
  expect(normaliseHex('#12')).toBeNull();
});
