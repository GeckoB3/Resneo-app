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
      emailRequired: 'Email is required.',
      emailInvalid: 'Enter a valid email address.',
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

    // Account deletion (Apple Guideline 5.1.1(v)) — the self-serve, in-app path
    // to permanently delete the account created at sign-up. Distinct from venue
    // deletion: this removes the user's own login/identity.
    delete: {
      dangerZone: 'Danger zone',
      title: 'Delete account',
      description:
        'Permanently delete your Resneo account. This ends your access and anonymises your personal data at venues per GDPR retention rules.',
      cta: 'Delete account',

      // Type-to-confirm sheet.
      sheetTitle: 'Delete your account',
      sheetIntro:
        'This requests a 30-day grace period, after which your account and personal data are permanently deleted and your linked guest records at venues are anonymised. This cannot be undone once the grace period ends.',
      // `{phrase}` is interpolated with `confirmPhrase` so the matched text and the
      // on-screen instruction can never drift apart.
      confirmPhrase: 'DELETE MY ACCOUNT',
      confirmLabel: 'Type “{phrase}” to confirm',
      confirmButton: 'Delete my account',
      working: 'Deleting…',
      error: 'Could not request account deletion. Please try again.',

      // Confirmation shown after a successful request (the user is then signed out).
      scheduledTitle: 'Account deletion scheduled',
      // `{date}` interpolated at the call site.
      scheduledBody:
        'Your account is scheduled for permanent deletion on {date}. You have been signed out on all devices.',
      scheduledBodyNoDate:
        'Your account deletion has been requested. You have been signed out on all devices.',
      cancelHint:
        'Changed your mind? Use the “Cancel deletion request” link in the confirmation email to cancel before then.',
      // `{email}` interpolated when the signed-in address is known.
      cancelHintEmail:
        'Changed your mind? Use the “Cancel deletion request” link in the email we sent to {email} to cancel before then.',
      done: 'Done',
      keep: 'Keep my account',

      // Pending banner on the Account screen — shown when the signed-in user is
      // inside the 30-day grace window (they signed back in after requesting).
      pendingTitle: 'Account deletion scheduled',
      // `{date}` interpolated at the call site.
      pendingBody:
        'Your account is scheduled for permanent deletion on {date}. Cancel before then to keep your account and data.',
      pendingBodyNoDate:
        'Your account is scheduled for permanent deletion. Cancel before the grace period ends to keep your account and data.',
      cancelCta: 'Cancel deletion request',
      cancelWorking: 'Cancelling…',
      cancelled: 'Account deletion cancelled. Your account stays active.',
      cancelError: 'Could not cancel the deletion request. Please try again.',
    },
  },

  setPassword: {
    title: 'Create your password',
    description:
      'Open this screen from the invitation or password-reset link in your email, then choose a password for your account. You can sign in with email and password next time, or keep using magic links.',
    newLabel: 'Password',
    newPlaceholder: 'At least 8 characters',
    confirmLabel: 'Confirm password',
    confirmPlaceholder: 'Re-enter password',
    submit: 'Save password and continue',
    success: 'Password set. Welcome to Resneo.',
    error: 'Could not set your password. Please try again.',
    // `{min}` is interpolated at the call site (see `t(key, params)`).
    tooShort: 'Password must be at least {min} characters.',
    mismatch: 'Passwords do not match.',
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
