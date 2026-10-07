/**
 * The device-facing half of the update prompt: which store build is installed,
 * fetching the policy file, remembering "Not now", and opening the store.
 * Every function here fails quietly — see `version-policy.ts` for the rules.
 */
import * as SecureStore from 'expo-secure-store';
import { Linking, Platform } from 'react-native';

import { getWebUrl } from '@/lib/env';
import { parseVersionPolicy, type AppVersionPolicy } from '@/lib/app-update/version-policy';

/** App Store id (App Store Connect → App Information → Apple ID). */
export const IOS_APP_STORE_ID = '6780271109';
export const ANDROID_PACKAGE = 'com.resneo.app';

/** Where the policy lives, relative to the web origin. */
export const VERSION_POLICY_PATH = '/app-version.json';

const FETCH_TIMEOUT_MS = 10_000;
const SNOOZE_KEY = 'resneo_app_update_snooze';

/**
 * The installed STORE build's version, e.g. "1.1.2".
 *
 * `Updates.runtimeVersion` rather than `Constants.expoConfig.version`: inside an
 * over-the-air update the latter reports the update's config, which is not what
 * the store installed. Under this app's `appVersion` runtime policy the runtime
 * version IS the store version (iOS: `ios.version` or the root `version`;
 * Android: `android.version`). If that policy ever changes, read
 * `expo-application`'s `nativeApplicationVersion` here instead.
 *
 * Null in development, Expo Go and on web, where no prompt should appear.
 */
export function getInstalledStoreVersion(): string | null {
  if (__DEV__ || Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const updates = require('expo-updates') as { runtimeVersion?: string | null };
    return updates.runtimeVersion?.trim() || null;
  } catch {
    return null;
  }
}

/** The policy file, or null when it is missing, malformed or unreachable. */
export async function fetchVersionPolicy(
  fetchImpl: typeof fetch = fetch,
): Promise<AppVersionPolicy | null> {
  const base = getWebUrl();
  if (!base) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${base}${VERSION_POLICY_PATH}`, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return parseVersionPolicy(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type Snooze = { version: string; at: number };

export async function loadSnooze(): Promise<Snooze | null> {
  if (Platform.OS === 'web') return null;
  try {
    const raw = await SecureStore.getItemAsync(SNOOZE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Snooze>) : null;
    return typeof parsed?.version === 'string' && typeof parsed.at === 'number'
      ? { version: parsed.version, at: parsed.at }
      : null;
  } catch {
    return null;
  }
}

export async function saveSnooze(version: string, at = Date.now()): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.setItemAsync(SNOOZE_KEY, JSON.stringify({ version, at }));
  } catch {
    // Worst case the prompt shows again next launch.
  }
}

/** The store app first; the web listing when that cannot be opened. */
export function storeUrls(platform: string = Platform.OS): { app: string; web: string } {
  return platform === 'ios'
    ? {
        app: `itms-apps://apps.apple.com/app/id${IOS_APP_STORE_ID}`,
        web: `https://apps.apple.com/app/id${IOS_APP_STORE_ID}`,
      }
    : {
        app: `market://details?id=${ANDROID_PACKAGE}`,
        web: `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`,
      };
}

export async function openStoreListing(platform: string = Platform.OS): Promise<void> {
  const { app, web } = storeUrls(platform);
  try {
    await Linking.openURL(app);
  } catch {
    await Linking.openURL(web).catch(() => {
      // Nothing more to try; the prompt stays up so they can press again.
    });
  }
}
