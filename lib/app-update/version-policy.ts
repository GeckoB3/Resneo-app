/**
 * "Is there a newer app in the store, and must this install move to it?"
 *
 * The answer comes from a small public file on the website,
 * `{web}/app-version.json` (see `Docs/APP_UPDATE_PROMPT_WEB_HANDOVER.md`), so a
 * prompt can be switched on for every install of a platform by a web deploy
 * rather than an app release. That matters because an over-the-air update can
 * only reach installs on its own runtime: once iOS moves to a new store
 * version, nothing published from `main` reaches the old one again.
 *
 *     {
 *       "ios":     { "latest": "1.2.0", "minimum": "1.1.0", "message": "…" },
 *       "android": { "latest": "1.1.2", "minimum": "1.1.0" }
 *     }
 *
 *  - below `latest`: a prompt that can be put off ("Not now");
 *  - below `minimum`: a screen that cannot, for builds that no longer work
 *    against the server;
 *  - anything missing, malformed or unreachable: nothing at all. The check must
 *    never be the thing that stops someone using the app.
 *
 * Pure, so every rule here is unit-tested without React Native.
 */

export type PlatformVersionPolicy = {
  /** The version in the store now. Installs below it are offered the update. */
  latest: string | null;
  /** The oldest version that still works. Installs below it must update. */
  minimum: string | null;
  /** Optional line under the heading, e.g. what the new version brings. */
  message: string | null;
};

export type AppVersionPolicy = {
  ios: PlatformVersionPolicy | null;
  android: PlatformVersionPolicy | null;
};

export type UpdateDecision =
  | { kind: 'none' }
  | { kind: 'recommended'; latest: string; message: string | null }
  | { kind: 'required'; latest: string; message: string | null };

/** "1", "1.2" or "1.2.0": what a store version looks like. */
const VERSION = /^\d+(\.\d+){0,2}$/;

/** Longest `message` shown; anything longer is a mistake in the file, not copy. */
export const MAX_MESSAGE_LENGTH = 300;

/** How long "Not now" puts the prompt off for, per store version. */
export const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

function parseVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return VERSION.test(trimmed) ? trimmed : null;
}

function parseMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > MAX_MESSAGE_LENGTH) return null;
  return trimmed;
}

function parsePlatform(value: unknown): PlatformVersionPolicy | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const policy = {
    latest: parseVersion(raw.latest),
    minimum: parseVersion(raw.minimum),
    message: parseMessage(raw.message),
  };
  return policy.latest || policy.minimum ? policy : null;
}

/** The file's body, validated field by field. Null when nothing usable is in it. */
export function parseVersionPolicy(body: unknown): AppVersionPolicy | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as Record<string, unknown>;
  const policy = { ios: parsePlatform(raw.ios), android: parsePlatform(raw.android) };
  return policy.ios || policy.android ? policy : null;
}

/** Negative when `a` is older than `b`, 0 when equal, positive when newer. Missing parts are 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((p) => Number.parseInt(p, 10) || 0);
  const pb = b.split('.').map((p) => Number.parseInt(p, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export type DecideInput = {
  policy: AppVersionPolicy | null;
  platform: string;
  /** The installed store build's version; null where it cannot be known (dev, Expo Go, web). */
  installed: string | null;
  /** "Not now" pressed for this store version, and when. */
  snoozed?: { version: string; at: number } | null;
  now?: number;
};

export function decideUpdate({
  policy,
  platform,
  installed,
  snoozed = null,
  now = Date.now(),
}: DecideInput): UpdateDecision {
  const installedVersion = parseVersion(installed);
  if (!policy || !installedVersion) return { kind: 'none' };
  const rules = platform === 'ios' ? policy.ios : platform === 'android' ? policy.android : null;
  if (!rules) return { kind: 'none' };

  // The store must actually have something newer to send them to: a `minimum`
  // above `latest` is a typo in the file, and blocking on it would strand
  // everyone with nowhere to go.
  const latest = rules.latest;
  if (!latest || compareVersions(installedVersion, latest) >= 0) return { kind: 'none' };

  if (
    rules.minimum &&
    compareVersions(rules.minimum, latest) <= 0 &&
    compareVersions(installedVersion, rules.minimum) < 0
  ) {
    return { kind: 'required', latest, message: rules.message };
  }

  if (snoozed && snoozed.version === latest && now - snoozed.at < SNOOZE_MS) {
    return { kind: 'none' };
  }
  return { kind: 'recommended', latest, message: rules.message };
}
