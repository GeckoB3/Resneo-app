/**
 * Mobile-side rebook bootstrap — mirrors the web's sessionStorage-based
 * staff-rebook-bootstrap.ts but uses expo-secure-store so the one-shot
 * payload survives a tab switch without relying on in-memory state.
 *
 * Usage:
 *   1. Booking detail screen: call writeRebookBootstrap(payload) then
 *      router.push('/booking/new').
 *   2. new.tsx: call readAndClearRebookBootstrap() once on mount; if the
 *      returned payload has .appointment, pre-select the service/variant and
 *      advance the step index; if it has .guest, pre-fill the guest state.
 */

import * as SecureStore from 'expo-secure-store';

export const REBOOK_BOOTSTRAP_KEY = 'resneo_staffRebook_v1';

export interface RebookGuestPrefill {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
}

export interface RebookBootstrapPayload {
  v: 1;
  appointment?: {
    serviceId: string;
    practitionerId: string;
    variantId?: string | null;
    durationMinutes?: number | null;
  };
  guest: RebookGuestPrefill;
  /** Default date for the date picker (YYYY-MM-DD). */
  initialDate?: string;
}

/** Write the rebook payload. Call before navigating to /booking/new. */
export async function writeRebookBootstrap(payload: RebookBootstrapPayload): Promise<void> {
  try {
    await SecureStore.setItemAsync(REBOOK_BOOTSTRAP_KEY, JSON.stringify(payload));
  } catch {
    // Quota / permissions — best-effort.
  }
}

/**
 * Read and immediately clear the bootstrap payload so it is only consumed once
 * (handles React Strict Mode double-mount via module-level guard).
 */
let _resolvedOnce = false;
let _resolvedPayload: RebookBootstrapPayload | null = null;

export async function readAndClearRebookBootstrap(): Promise<RebookBootstrapPayload | null> {
  if (_resolvedOnce) {
    return _resolvedPayload;
  }
  try {
    const raw = await SecureStore.getItemAsync(REBOOK_BOOTSTRAP_KEY);
    if (!raw?.trim()) {
      _resolvedOnce = true;
      _resolvedPayload = null;
      return null;
    }
    const parsed = JSON.parse(raw) as RebookBootstrapPayload;
    if (parsed?.v !== 1) {
      _resolvedOnce = true;
      _resolvedPayload = null;
      return null;
    }
    _resolvedPayload = parsed;
    _resolvedOnce = true;
    // Clear immediately so the next navigation to /booking/new starts fresh.
    await SecureStore.deleteItemAsync(REBOOK_BOOTSTRAP_KEY);
    return parsed;
  } catch {
    _resolvedOnce = true;
    _resolvedPayload = null;
    return null;
  }
}

/** Reset the module-level guard — call when the wizard unmounts or on sign-out. */
export function resetRebookBootstrapGuard(): void {
  _resolvedOnce = false;
  _resolvedPayload = null;
}
