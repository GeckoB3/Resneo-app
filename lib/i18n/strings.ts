/**
 * EN string catalogue + locale config — the single source for user-facing copy.
 *
 * WHY THIS EXISTS (localization readiness, W6.4)
 * ---------------------------------------------
 * Today the app ships English-only, but every user-facing string and every
 * formatting locale lived inline. This file makes adding a locale (fr/es/…) a
 * pure DATA change: copy this object, translate the leaf strings, point
 * `formatLocale`/`currency` at the new region, and register it in
 * `lib/i18n/index.ts`. No code changes, no string re-extraction.
 *
 * CONVENTIONS — read before adding strings
 * ----------------------------------------
 * - Keys are nested by screen/feature, then by element, e.g.
 *   `account.profile.title`. The top-level `common.*` group holds strings shared
 *   across screens (Save / Cancel / Retry …). Resolve them with the dotted path
 *   `t('account.profile.title')`.
 * - Leaves are strings ONLY. Interpolate runtime values with `{name}`-style
 *   placeholders (e.g. `'Hi {name}'`) and pass `t(key, { name })`. Never
 *   concatenate translated fragments in code — word order differs per language.
 * - This is a SAMPLE catalogue, not the whole app. It seeds the migrated
 *   `account` screen plus the common actions. When you migrate another screen,
 *   add its group here (mirroring its labels) and switch the screen to `t(…)`.
 * - `Strings` (the type of this object) is the contract every locale must
 *   satisfy — see `LocaleCatalogue` in `index.ts`. TypeScript will flag a
 *   future `fr`/`es` catalogue that is missing a key or has a wrong shape.
 *
 * FORMATTING CONFIG
 * -----------------
 * `formatLocale` + `currency` are what `lib/format.ts` reads (via the active
 * catalogue) so money/number/date formatting follows the locale. EN is bound to
 * `en-GB` / `GBP`, which keeps today's output byte-for-byte identical.
 */

/** Money/number/date config for a catalogue (consumed by `lib/format.ts`). */
export interface LocaleFormatConfig {
  /** BCP-47 tag passed to `Intl` (e.g. 'en-GB'). */
  formatLocale: string;
  /** ISO 4217 currency code for `Intl.NumberFormat` (e.g. 'GBP'). */
  currency: string;
}

export const en = {
  /** Shared across screens — keep these generic (no screen-specific copy). */
  common: {
    save: 'Save',
    cancel: 'Cancel',
    retry: 'Retry',
    delete: 'Delete',
    done: 'Done',
    loading: 'Loading…',
  },

  account: {
    title: 'Account settings',

    profile: {
      title: 'Your profile',
      description:
        'Update how you appear in the dashboard, your sign-in email, and your contact number.',
      nameLabel: 'Display name',
      namePlaceholder: 'Your name',
      emailLabel: 'Sign-in email',
      emailPlaceholder: 'you@example.com',
      emailHelper: 'This is the address you use to log in.',
      phoneLabel: 'Phone',
      phonePlaceholder: 'e.g. +44 7700 900000',
      phoneHelper: 'Optional. Include country code.',
      save: 'Save profile',
      saved: 'Your profile has been updated.',
      saveError: 'Could not save profile.',
    },

    password: {
      title: 'Password',
      description: 'Change the password you use to sign in.',
      newLabel: 'New password',
      newPlaceholder: 'Min 8 characters',
      confirmLabel: 'Confirm password',
      confirmPlaceholder: 'Re-enter password',
      submit: 'Update password',
      changed: 'Password changed. Sign in with the new password next time.',
      changeError: 'Password change failed.',
      // `{min}` is interpolated at the call site (see `t(key, params)`), keeping
      // the rule's value out of the copy. Also the canonical example of the
      // `{param}` convention all catalogue strings follow.
      tooShort: 'Password must be at least {min} characters.',
      mismatch: 'Passwords do not match.',
    },
  },
} as const;

/**
 * The catalogue contract. The EN object is the reference shape; a future
 * `fr`/`es` catalogue must satisfy `Strings` so missing/renamed keys fail to
 * compile rather than silently fall back at runtime.
 */
export type Strings = typeof en;

/** Formatting config for the EN catalogue. Each future locale ships its own. */
export const enFormat: LocaleFormatConfig = {
  formatLocale: 'en-GB',
  currency: 'GBP',
};
