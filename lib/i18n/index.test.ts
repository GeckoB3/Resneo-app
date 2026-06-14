import {
  getActiveFormatConfig,
  getActiveLocale,
  resetLocaleCache,
  t,
  type TranslationKey,
} from '@/lib/i18n';

/**
 * i18n layer (pure). `expo-localization`'s `getLocales()` is a native bridge
 * call, so we back it with a mutable mock and drive it per-case. `mock`-prefixed
 * so jest's hoisted factory may reference it (see jest.mock docs). The layer
 * memoizes the resolved locale, so each scenario sets the mock then calls
 * resetLocaleCache() to force a fresh resolve.
 */
const mockGetLocales = jest.fn();
jest.mock('expo-localization', () => ({
  getLocales: () => mockGetLocales(),
}));

/** Default to a British English device unless a case overrides it. */
function setLocales(value: unknown): void {
  mockGetLocales.mockReturnValue(value);
  resetLocaleCache();
}

beforeEach(() => {
  setLocales([{ languageTag: 'en-GB', languageCode: 'en', currencyCode: 'GBP' }]);
});

describe('t — key lookup', () => {
  it('resolves a nested catalogue key to its string', () => {
    expect(t('common.save')).toBe('Save');
    expect(t('account.title')).toBe('Account settings');
    expect(t('account.profile.title')).toBe('Your profile');
    expect(t('account.profile.saved')).toBe('Your profile has been updated.');
  });
});

describe('t — interpolation', () => {
  it('substitutes {param} placeholders with the matching param', () => {
    // account.password.tooShort = 'Password must be at least {min} characters.'
    expect(t('account.password.tooShort', { min: 8 })).toBe(
      'Password must be at least 8 characters.',
    );
    // Numeric params are coerced to strings.
    expect(t('account.password.tooShort', { min: 12 })).toBe(
      'Password must be at least 12 characters.',
    );
  });

  it('leaves a placeholder intact when no matching param is supplied', () => {
    // No params at all → the raw {min} token is preserved verbatim.
    expect(t('account.password.tooShort')).toBe('Password must be at least {min} characters.');
    // An unrelated param does not satisfy {min}, so it is left as-is.
    expect(t('account.password.tooShort', { other: 1 })).toBe(
      'Password must be at least {min} characters.',
    );
  });

  it('returns plain strings unchanged when params are passed but no placeholder exists', () => {
    expect(t('common.save', { ignored: 'x' })).toBe('Save');
  });
});

describe('t — missing key fallback', () => {
  it('returns the raw key when the path does not exist', () => {
    expect(t('account.nope.title' as TranslationKey)).toBe('account.nope.title');
    expect(t('does.not.exist' as TranslationKey)).toBe('does.not.exist');
  });
});

describe('locale resolution', () => {
  it('reports the device BCP-47 tag when available', () => {
    setLocales([{ languageTag: 'en-GB', languageCode: 'en', currencyCode: 'GBP' }]);
    expect(getActiveLocale()).toBe('en-GB');
  });

  it('falls back to en-GB / GBP when the native module throws', () => {
    mockGetLocales.mockImplementation(() => {
      throw new Error('native module unavailable');
    });
    resetLocaleCache();
    expect(getActiveLocale()).toBe('en-GB');
    expect(getActiveFormatConfig()).toEqual({ formatLocale: 'en-GB', currency: 'GBP' });
    // Strings still resolve via the EN fallback catalogue.
    expect(t('common.save')).toBe('Save');
  });

  it('falls back to the EN catalogue for an unregistered language but keeps the device tag', () => {
    setLocales([{ languageTag: 'fr-FR', languageCode: 'fr', currencyCode: 'EUR' }]);
    // No fr catalogue registered yet → EN strings, EN format config…
    expect(t('common.save')).toBe('Save');
    expect(getActiveFormatConfig()).toEqual({ formatLocale: 'en-GB', currency: 'GBP' });
    // …but the device's own tag is still surfaced for reference.
    expect(getActiveLocale()).toBe('fr-FR');
  });

  it('falls back to en-GB when the locale list is empty', () => {
    setLocales([]);
    expect(getActiveLocale()).toBe('en-GB');
    expect(t('common.save')).toBe('Save');
  });
});
