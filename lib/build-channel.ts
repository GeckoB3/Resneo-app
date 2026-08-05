/**
 * Which EAS build this is, from the update channel in `eas.json`
 * (`development` / `preview` / `production`).
 *
 * It is the only runtime signal that separates a preview build from a
 * production one: both are release builds, so `__DEV__` is false in each and
 * cannot tell them apart. Used to tag Sentry events and to decide how loudly
 * native SDKs should log.
 *
 * Read defensively — `channel` is null for local and non-EAS builds, and
 * reading it must never be the thing that breaks a caller.
 */
export function getBuildChannel(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const updates = require('expo-updates') as { channel?: string | null };
    return updates.channel?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * True for anything that is not the production channel — dev builds, preview
 * builds, and local builds with no channel at all.
 *
 * Deliberately "not production" rather than "is preview": a build we cannot
 * identify is one we want diagnostics from, and the only case that must stay
 * quiet is the one we can positively identify as customers' (`production`).
 */
export function isDiagnosticBuild(): boolean {
  if (__DEV__) return true;
  return getBuildChannel() !== 'production';
}
