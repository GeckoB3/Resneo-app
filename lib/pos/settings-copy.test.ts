import { SETTINGS_COPY, clientWords, settingsCopyFor, tippingPolicyTemplate } from '@/lib/pos/settings-copy';

const EM_DASH = String.fromCharCode(0x2014);
const CURLY = new RegExp(`[${String.fromCharCode(0x2018)}${String.fromCharCode(0x2019)}]`);

describe('Checkout settings copy', () => {
  it('has no em-dash and only straight apostrophes', () => {
    for (const [id, text] of Object.entries(SETTINGS_COPY)) {
      expect({ id, dash: text.includes(EM_DASH) }).toEqual({ id, dash: false });
      expect({ id, curly: CURLY.test(text) }).toEqual({ id, curly: false });
    }
    expect(tippingPolicyTemplate('Studio', 'client', 'Rule.')).not.toContain(EM_DASH);
  });

  it('fills the venue client word', () => {
    const t = settingsCopyFor(clientWords('Patient'));
    expect(t('set.biz.tradingName.help')).toBe("The name your patients know you by, if it's different.");
    expect(t('set.tips.custom')).toBe('Let patients choose another amount');
    expect(clientWords(null).clients).toBe('clients');
  });

  it('builds the tipping policy template with the venue and the rule', () => {
    const text = tippingPolicyTemplate('Studio One', 'client', 'Each tip goes to the person who took the payment.');
    expect(text.startsWith('Tipping policy at Studio One')).toBe(true);
    expect(text).toContain('How tips are shared: Each tip goes to the person who took the payment.');
  });
});
