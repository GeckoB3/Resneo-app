import * as SecureStore from 'expo-secure-store';

import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { getRegisteredDeviceId } from '@/lib/push/registerDevice';

/**
 * The `device_id` a phone claims a sale with (`POST /api/venue/pos/payments/[id]/claim`, plan
 * §4.36 "Claiming").
 *
 * It is this session's push registration row (`user_devices.id`), as the web expects. A phone
 * with no registration (push turned off, so it found the request in "Waiting for you") claims with
 * a stable id of its own instead: the web only compares the id between claims, so the same phone
 * claiming again (after a dropped answer) still gets the same PaymentIntent back.
 *
 * The id used for a payment is remembered for the life of the app, so a retry never switches ids
 * halfway (a registration finishing between two claims would otherwise look like a second phone).
 */

const FALLBACK_KEY = 'resneo_pos_collect_device_id';

const usedFor = new Map<string, string>();
let fallback: string | null = null;

async function fallbackId(): Promise<string> {
  if (fallback) return fallback;
  try {
    const stored = await SecureStore.getItemAsync(FALLBACK_KEY);
    if (stored) {
      fallback = stored;
      return stored;
    }
  } catch {
    // Not available here (web, tests): a process id is enough.
  }
  const made = `app-${newPaymentAttemptId()}`;
  fallback = made;
  try {
    await SecureStore.setItemAsync(FALLBACK_KEY, made);
  } catch {
    // Best effort.
  }
  return made;
}

/** The device id to claim `paymentId` with, the same one every time for that payment. */
export async function collectDeviceId(paymentId: string): Promise<string> {
  const known = usedFor.get(paymentId);
  if (known) return known;
  const id = getRegisteredDeviceId() ?? (await fallbackId());
  usedFor.set(paymentId, id);
  return id;
}

/** Test seam. */
export function __resetCollectDeviceForTests(): void {
  usedFor.clear();
  fallback = null;
}
