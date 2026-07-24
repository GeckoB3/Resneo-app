/**
 * Stripe Terminal connection tokens (Tap to Pay design doc §6.2 / §7.5).
 *
 * `POST /api/payments/connection-token` mints a token on the ACTIVE venue's
 * connected account and returns the Terminal Location the readers attach to.
 * Two callers need it:
 *  - the SDK's `tokenProvider` (needs `secret`), and
 *  - the reader hooks (need `location_id` to pass to `connectReader`).
 *
 * The location id is cached per venue scope so connecting a reader does not
 * have to mint an extra, unused token. Switching linked venue (`ownerVenueId`)
 * changes the scope key, so a stale location can never leak across accounts.
 */

import { apiFetch } from '@/lib/api/client';

export interface ConnectionTokenResponse {
  secret: string;
  location_id: string;
}

/** Cache key for a venue scope: own venue is null, a linked venue is its id. */
function scopeKey(ownerVenueId: string | null | undefined): string {
  return ownerVenueId ?? '__own__';
}

/** location_id per venue scope, populated by the most recent token fetch. */
const locationByScope = new Map<string, string>();

/**
 * Fetch a connection token for the active venue. Caches the returned
 * `location_id` for {@link getCachedTerminalLocationId}.
 */
export async function fetchConnectionToken(args: {
  accessToken: string | null;
  ownerVenueId: string | null;
}): Promise<ConnectionTokenResponse> {
  const res = await apiFetch<ConnectionTokenResponse>('/api/payments/connection-token', {
    accessToken: args.accessToken,
    method: 'POST',
    body: JSON.stringify(args.ownerVenueId ? { owner_venue_id: args.ownerVenueId } : {}),
  });
  if (res?.location_id) {
    locationByScope.set(scopeKey(args.ownerVenueId), res.location_id);
  }
  return res;
}

/** The last known Terminal Location for this venue scope, if one was fetched. */
export function getCachedTerminalLocationId(
  ownerVenueId: string | null | undefined,
): string | null {
  return locationByScope.get(scopeKey(ownerVenueId)) ?? null;
}

/**
 * The Terminal Location for this scope, fetching a token if it is not cached
 * yet. `connectReader` requires a location id, and the SDK may satisfy its own
 * `tokenProvider` from an internal cache, so the hook cannot assume a fetch has
 * already happened.
 */
export async function ensureTerminalLocationId(args: {
  accessToken: string | null;
  ownerVenueId: string | null;
}): Promise<string> {
  const cachedId = getCachedTerminalLocationId(args.ownerVenueId);
  if (cachedId) return cachedId;
  const res = await fetchConnectionToken(args);
  if (!res?.location_id) {
    throw new Error('This venue is not set up for in-person payments yet.');
  }
  return res.location_id;
}

/** Drop cached locations (venue switch / sign-out) so nothing crosses accounts. */
export function clearTerminalLocationCache(): void {
  locationByScope.clear();
}
