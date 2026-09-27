/**
 * Thin dynamic config layered over `app.json`.
 *
 * `app.json` stays the source of truth for everything; Expo reads it first and
 * hands it in as `config`. This file has exactly two jobs.
 *
 * 1. Let the Firebase Android client config come from an environment variable.
 *
 *    Why: `google-services.json` carries a Google API key and this repo is
 *    public, so the file is gitignored rather than committed. EAS builds
 *    therefore cannot find it on disk. An EAS **file-type** environment variable
 *    named `GOOGLE_SERVICES_JSON` writes the file into the build workspace and
 *    sets the variable to its absolute path, which is what gets used here.
 *
 *    Locally the variable is unset, so it falls back to the path in `app.json`
 *    (`./google-services.json`) for `npx expo run:android`.
 *
 * 2. The LOCAL iOS Tap to Pay build (`EXPO_PUBLIC_TAP_TO_PAY_IOS=true`).
 *
 *    Apple granted the Tap to Pay entitlement with a development distribution
 *    restriction, so it only survives into a Development-signed build made in
 *    Xcode on a Mac — never into an EAS Ad Hoc or App Store build (see
 *    `lib/payments/tap-to-pay-build-support.ts` and Docs/TAP_TO_PAY.md). This
 *    one variable switches on BOTH halves together: the entitlement here, and
 *    the Tap to Pay option in the JS (the same variable is inlined there).
 *    Updates are switched off in that build so an OTA update cannot replace
 *    the bundle and take the Tap to Pay option away mid-test.
 *
 *    Pass it on the command line of the local build only. Never put it in a
 *    `.env*` file or an EAS environment: an EAS iOS build carrying the
 *    entitlement fails to archive, and an OTA update carrying the flag would
 *    offer iOS staff a Tap to Pay button that cannot work.
 *
 * Keep this file boring. Anything that belongs to every build belongs in
 * `app.json`, where it stays declarative and diffable.
 */
const localTapToPayIos = process.env.EXPO_PUBLIC_TAP_TO_PAY_IOS === 'true';

module.exports = ({ config }) => ({
  ...config,
  ios: localTapToPayIos
    ? {
        ...config.ios,
        appleTeamId: process.env.APPLE_TEAM_ID ?? config.ios?.appleTeamId,
        entitlements: {
          ...config.ios?.entitlements,
          'com.apple.developer.proximity-reader.payment.acceptance': true,
        },
      }
    : config.ios,
  updates: localTapToPayIos ? { ...config.updates, enabled: false } : config.updates,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
  },
});
