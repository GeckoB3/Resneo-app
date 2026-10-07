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
 * 2. Let a LOCAL Xcode build pick its signing team from `APPLE_TEAM_ID`
 *    (`scripts/ios-tap-to-pay-local.sh`). EAS builds never set it and sign with
 *    the team their credentials belong to.
 *
 *    This used to be the `EXPO_PUBLIC_TAP_TO_PAY_IOS` lever, which added the Tap
 *    to Pay entitlement and switched updates off for a local build while Apple's
 *    grant was development-only. From 1.2.0 the entitlement is in `app.json` for
 *    every build, so that variable is no longer read anywhere.
 *
 * Keep this file boring. Anything that belongs to every build belongs in
 * `app.json`, where it stays declarative and diffable.
 */
module.exports = ({ config }) => ({
  ...config,
  ios: process.env.APPLE_TEAM_ID
    ? { ...config.ios, appleTeamId: process.env.APPLE_TEAM_ID }
    : config.ios,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
  },
});
