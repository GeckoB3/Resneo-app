import { Platform } from 'react-native';

import { getInstalledStoreVersion } from '@/lib/app-update/app-update-runtime';

/**
 * This build as the web reads it (POS plan §4.22, E.5, Appendix G; web `src/lib/pos/client-build.ts`).
 *
 * One string, in two places: the `X-ResNeo-Client` header on every POS call, and `client_build`
 * with every push registration (`POST /api/v1/me/devices`). The first part is the platform; the
 * rest are `key=value` pairs separated by semicolons, which the web parses and otherwise ignores:
 * `ios; store=1.2.0; update=0b6f...; pos=2`.
 *
 * Kept apart from the sale API client so push registration can use it without pulling that in.
 */

/**
 * The highest POS app step this bundle carries (`pos=N`). An over-the-air update id has no order,
 * so the web compares this number instead: from 2 it sends this phone sales from the web till
 * (`pos_collect_request`, plan §4.36; web `COLLECT_MIN_POS_STEP`). Raised with each app step.
 */
export const POS_APP_STEP = 2;

/** The web stores at most this many characters of it. */
const MAX_LENGTH = 200;

function updateId(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- read defensively, as build-channel.ts does
    const updates = require('expo-updates') as { updateId?: string | null };
    return updates.updateId?.trim() || null;
  } catch {
    return null;
  }
}

/** `ios; store=1.2.0; update=0b6f…; pos=2` (fields the web can parse; unknown parts are left out). */
export function clientHeaderValue(input: {
  platform: string;
  storeVersion: string | null;
  updateId: string | null;
  posStep?: number | null;
}): string {
  const parts = [input.platform];
  if (input.storeVersion) parts.push(`store=${input.storeVersion}`);
  if (input.updateId) parts.push(`update=${input.updateId}`);
  if (input.posStep != null) parts.push(`pos=${input.posStep}`);
  return parts.join('; ').slice(0, MAX_LENGTH);
}

/** This install's build string, with the POS app step it carries. */
export function clientBuild(): string {
  return clientHeaderValue({
    platform: Platform.OS,
    storeVersion: getInstalledStoreVersion(),
    updateId: updateId(),
    posStep: POS_APP_STEP,
  });
}
