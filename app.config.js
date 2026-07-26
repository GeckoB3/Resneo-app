/**
 * Thin dynamic config layered over `app.json`.
 *
 * `app.json` stays the source of truth for everything; Expo reads it first and
 * hands it in as `config`. The ONLY job here is to let the Firebase Android
 * client config come from an environment variable.
 *
 * Why: `google-services.json` carries a Google API key and this repo is public,
 * so the file is gitignored rather than committed. EAS builds therefore cannot
 * find it on disk. An EAS **file-type** environment variable named
 * `GOOGLE_SERVICES_JSON` writes the file into the build workspace and sets the
 * variable to its absolute path, which is what gets used here.
 *
 * Locally the variable is unset, so it falls back to the path in `app.json`
 * (`./google-services.json`) for `npx expo run:android`.
 *
 * Keep this file boring. Anything that belongs to every build belongs in
 * `app.json`, where it stays declarative and diffable.
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
  },
});
