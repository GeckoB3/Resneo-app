import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * The site this phone acts on (web roles plan §6.2a, §6.2c: Docs/user-roles-and-multi-site-plan.md).
 *
 * One login can belong to several businesses ("sites"). Every request to the API names the chosen
 * one in `X-ResNeo-Venue`; with no header the server answers for the person's home site, which is
 * what an older build, and anyone who has never chosen, gets. So nothing changes for someone with
 * one site: they never choose, and no header is sent.
 *
 * This module is the one place that knows the choice. It holds it in memory for the request path,
 * keeps it in SecureStore across launches, and tells everything tied to the old site to let go when
 * it changes (`onBeforeSiteChange`, `onSiteChange`): the query cache, the card reader, the linked
 * venue, the per-site stores. No React here except the subscription hook, and nothing that imports
 * the API client, so the client can read it without a cycle.
 */

/** The request header that names the site (`src/lib/sites/pick-site.ts` on the web). */
export const SITE_HEADER = 'X-ResNeo-Venue';

const STORAGE_KEY = 'resneo_chosen_site_v1';

type StoredSite = { userId: string | null; venueId: string };

let chosen: StoredSite | null = null;
/** Bumped on every change, so a response that set off under the old site can be recognised. */
let epoch = 0;
/** The SecureStore read on launch; null until started. */
let hydration: Promise<void> | null = null;
let hydrated = false;
/** The signed-in user, from AuthProvider; undefined until it has said. */
let currentUserId: string | null | undefined;
/** The site the server last said this login acts on (`active_venue_id`), for "is this the same site". */
let knownActiveVenueId: string | null = null;
/** Set by a fresh sign-in: offer the site picker once the app has loaded. */
let siteOfferDue = false;
/** Set when the server said the chosen site is no longer this login's: say so once. */
let siteLost = false;

const listeners = new Set<() => void>();
const offerListeners = new Set<() => void>();

export type SiteChange = { from: string | null; to: string | null };
type SiteChangeHandler = (change: SiteChange) => void | Promise<void>;
const beforeHandlers = new Set<SiteChangeHandler>();
/** After handlers and their order: lower first, registration order within one value. */
const afterHandlers = new Map<SiteChangeHandler, number>();

/** A handler that has not finished in this long is left to finish on its own. */
const BEFORE_HANDLER_TIMEOUT_MS = 5_000;

function emit(set: Set<() => void>): void {
  for (const listener of [...set]) listener();
}

/** The chosen site's venue id, or null for "the home site" (no header). */
export function getChosenSiteId(): string | null {
  return chosen?.venueId ?? null;
}

/** Changes on every switch. `apiFetch` drops any response that started under an earlier value. */
export function getSiteEpoch(): number {
  return epoch;
}

/** The header that names the chosen site, or nothing when none is chosen. */
export function siteHeaders(): Record<string, string> {
  const id = getChosenSiteId();
  return id ? { [SITE_HEADER]: id } : {};
}

/**
 * A SecureStore key for state that belongs to one site (the reader serial, the last payment method,
 * the rebook payload, the stock prompt, the linked venue). With no site chosen it is the key as it
 * always was, so a single-site phone keeps what it has stored.
 */
export function siteScopedKey(base: string): string {
  const id = getChosenSiteId();
  // SecureStore keys allow letters, digits, ".", "-" and "_"; a venue id is a uuid.
  return id ? `${base}.${id.replace(/[^A-Za-z0-9._-]/g, '_')}` : base;
}

/** The site this phone acts on, as far as it knows: the chosen one, or what the server last said. */
export function getActingVenueId(): string | null {
  return getChosenSiteId() ?? knownActiveVenueId;
}

/** Record which site the server says this login acts on (`GET /api/v1/me/sites` → `active_venue_id`). */
export function noteActiveVenueId(venueId: string | null): void {
  knownActiveVenueId = venueId;
}

async function readStored(): Promise<StoredSite | null> {
  if (Platform.OS === 'web') return null;
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSite> | null;
    return parsed && typeof parsed.venueId === 'string' && parsed.venueId
      ? { venueId: parsed.venueId, userId: typeof parsed.userId === 'string' ? parsed.userId : null }
      : null;
  } catch {
    return null;
  }
}

async function writeStored(value: StoredSite | null): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (value) await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(value));
    else await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch {
    // Kept in memory for this run at least; the next launch starts on the home site.
  }
}

/** Forget a choice that belongs to someone else (a different login, or nobody). */
function reconcileUser(): void {
  if (!hydrated || currentUserId === undefined || !chosen) return;
  if (chosen.userId !== currentUserId) {
    chosen = null;
    epoch += 1;
    void writeStored(null);
    emit(listeners);
  }
}

/**
 * Read the stored choice. Started once, at launch (`app/_layout.tsx`), before any request can go
 * out, so the first request already names the right site. Safe to call again.
 */
export function startChosenSiteHydration(): Promise<void> {
  if (!hydration) {
    hydration = readStored().then((stored) => {
      // A choice made in this run before the read finished wins over the stored one.
      if (!hydrated && !chosen && stored) chosen = stored;
      hydrated = true;
      reconcileUser();
      emit(listeners);
    });
  }
  return hydration;
}

/** Waits for the launch read, when one is running; otherwise resolves at once. */
export function whenChosenSiteReady(): Promise<void> {
  return hydration ?? Promise.resolve();
}

/** The launch read, while it is still running; null once it has finished (or never started). */
export function chosenSitePending(): Promise<void> | null {
  return hydration && !hydrated ? hydration : null;
}

/**
 * AuthProvider says who is signed in. Signing out (null), or a different login, drops the choice:
 * the next person to use the phone starts on their own home site.
 */
export function syncChosenSiteUser(userId: string | null): void {
  currentUserId = userId;
  if (!userId) {
    siteOfferDue = false;
    emit(offerListeners);
  }
  if (hydration && !hydrated) {
    void hydration.then(reconcileUser);
    return;
  }
  hydrated = true;
  reconcileUser();
}

/** Run before the site changes (and awaited): the card reader disconnects here. */
export function onBeforeSiteChange(handler: SiteChangeHandler): () => void {
  beforeHandlers.add(handler);
  return () => {
    beforeHandlers.delete(handler);
  };
}

/**
 * Run once the site has changed: caches, stores and contexts tied to the old site let go here.
 * `order` puts a handler later (default 0): the query cache is reset last, once the contexts its
 * queries read (the linked venue) have let go.
 */
export function onSiteChange(handler: SiteChangeHandler, order = 0): () => void {
  afterHandlers.set(handler, order);
  return () => {
    afterHandlers.delete(handler);
  };
}

function afterHandlersInOrder(): SiteChangeHandler[] {
  return [...afterHandlers.entries()].sort((a, b) => a[1] - b[1]).map(([handler]) => handler);
}

async function runHandlers(handlers: SiteChangeHandler[], change: SiteChange, timeoutMs: number | null): Promise<void> {
  for (const handler of handlers) {
    try {
      const result = handler(change);
      if (result && typeof (result as Promise<void>).then === 'function') {
        if (timeoutMs === null) {
          await result;
        } else {
          let timer: ReturnType<typeof setTimeout> | undefined;
          await Promise.race([
            Promise.resolve(result).catch(() => undefined),
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, timeoutMs);
            }),
          ]);
          if (timer) clearTimeout(timer);
        }
      }
    } catch {
      // One handler failing must never stop the switch, or leave the rest of the old site behind.
    }
  }
}

let switching: Promise<void> | null = null;

/**
 * Choose the site this phone acts on (`null` goes back to the home site). Everything tied to the
 * old site is let go before this resolves: the before handlers are awaited, then the choice and the
 * epoch change, then the after handlers run. Choosing the current choice again does nothing; the
 * screens never ask to switch to the site the phone already acts on (`getActingVenueId`).
 */
export async function setChosenSite(venueId: string | null): Promise<void> {
  // Two switches at once run one after the other, never interleaved.
  while (switching) await switching.catch(() => undefined);
  const run = (async () => {
    const from = getChosenSiteId();
    if (from === venueId) return;
    const change: SiteChange = { from: getActingVenueId(), to: venueId };
    await runHandlers([...beforeHandlers], change, BEFORE_HANDLER_TIMEOUT_MS);
    chosen = venueId ? { venueId, userId: currentUserId ?? null } : null;
    hydrated = true;
    epoch += 1;
    knownActiveVenueId = venueId;
    await writeStored(chosen);
    await runHandlers(afterHandlersInOrder(), change, null);
    emit(listeners);
  })();
  switching = run;
  try {
    await run;
  } finally {
    if (switching === run) switching = null;
  }
}

export function subscribeChosenSite(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The chosen site's venue id in a component, re-rendering when it changes. */
export function useChosenSiteId(): string | null {
  return useSyncExternalStore(subscribeChosenSite, getChosenSiteId, getChosenSiteId);
}

/** A fresh sign-in (not a launch with a stored session): offer the site picker once. */
export function markSiteOfferDue(): void {
  siteOfferDue = true;
  emit(offerListeners);
}

export function isSiteOfferDue(): boolean {
  return siteOfferDue;
}

/** Read and clear the offer, so it is made once. */
export function takeSiteOffer(): boolean {
  const due = siteOfferDue;
  siteOfferDue = false;
  if (due) emit(offerListeners);
  return due;
}

export function subscribeSiteOffer(listener: () => void): () => void {
  offerListeners.add(listener);
  return () => {
    offerListeners.delete(listener);
  };
}

/** The chosen site refused this login (403 SITE_NOT_AVAILABLE): tell the person once. */
export function markSiteLost(): void {
  siteLost = true;
  emit(offerListeners);
}

export function isSiteLost(): boolean {
  return siteLost;
}

/** Read and clear the notice, so it is shown once. */
export function takeSiteLost(): boolean {
  const lost = siteLost;
  siteLost = false;
  if (lost) emit(offerListeners);
  return lost;
}

/** Test seam: forget everything, handlers included. */
export function __resetActiveSiteForTests(): void {
  chosen = null;
  epoch = 0;
  hydration = null;
  hydrated = false;
  currentUserId = undefined;
  knownActiveVenueId = null;
  siteOfferDue = false;
  siteLost = false;
  switching = null;
  listeners.clear();
  offerListeners.clear();
  beforeHandlers.clear();
  afterHandlers.clear();
}
