import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { apiFetch } from '@/lib/api/client';
import { clientBuild } from '@/lib/pos/client-build';
import { NO_CARD, sameCardReport, type DeviceCardReport } from '@/lib/pos/card-capability';
import { appVersionFromConfig } from '@/lib/env';
import { Notifications } from '@/lib/push/notificationsModule';
import { isExpoGoClient } from '@/lib/push/runtime';

export type DevicePlatform = 'ios' | 'android' | 'web';

export interface RegisterDeviceInput {
  accessToken: string;
  /**
   * Which app this device is, so the server knows which pushes to send it.
   *
   * REQUIRED, with no default on purpose. The column defaults to `'staff'`
   * server-side so that build 1.0.7, which sends nothing, keeps working; a
   * default here would quietly inherit that for a customer and send them a
   * venue's booking alerts, which carry a client's name and service. The caller
   * must know who this is, and if it does not it must not register.
   */
  audience: 'staff' | 'customer';
}

export interface RegisterDeviceResult {
  registered: boolean;
  pushToken: string | null;
  reason?: 'simulator' | 'denied' | 'no-token' | 'web' | 'expo-go' | 'error';
}

function currentPlatform(): DevicePlatform | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'web') return 'web';
  return null;
}

function appVersionString(): string | null {
  // Per platform: the root `version` alone is iOS's when the two differ.
  return appVersionFromConfig(Constants.expoConfig, Platform.OS)?.slice(0, 80) ?? null;
}

function projectIdFromConfig(): string | undefined {
  const eas = Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined;
  return eas?.projectId;
}

/**
 * Request permission, fetch an Expo push token, and POST it to /api/v1/me/devices.
 *
 * Safe to call multiple times — backend simply inserts a fresh row per call (web parity).
 * Skips simulator, web, and Expo Go because push tokens are unavailable there.
 *
 * `input.audience` stamps the row with which app it belongs to. The server fans
 * out by that stamp, so it decides whether this device receives a venue's staff
 * alerts or a customer's own booking reminders.
 */
export async function registerCurrentDeviceForPush(
  input: RegisterDeviceInput,
): Promise<RegisterDeviceResult> {
  if (isExpoGoClient()) {
    return { registered: false, pushToken: null, reason: 'expo-go' };
  }

  const platform = currentPlatform();
  if (!platform || platform === 'web') {
    return { registered: false, pushToken: null, reason: 'web' };
  }

  if (!Device.isDevice) {
    return { registered: false, pushToken: null, reason: 'simulator' };
  }

  if (!Notifications) {
    return { registered: false, pushToken: null, reason: 'web' };
  }

  let permission;
  try {
    permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted') {
      permission = await Notifications.requestPermissionsAsync();
    }
  } catch (error) {
    console.warn('[push] permission check failed:', error);
    return { registered: false, pushToken: null, reason: 'error' };
  }
  if (permission.status !== 'granted') {
    return { registered: false, pushToken: null, reason: 'denied' };
  }

  let pushToken: string | null = null;
  try {
    const projectId = projectIdFromConfig();
    const tokenResult = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    pushToken = tokenResult.data ?? null;
  } catch (error) {
    console.warn('[push] getExpoPushTokenAsync failed:', error);
    return { registered: false, pushToken: null, reason: 'error' };
  }

  if (!pushToken) {
    return { registered: false, pushToken: null, reason: 'no-token' };
  }

  const payload: Record<string, unknown> = {
    platform,
    audience: input.audience,
    push_token: pushToken,
    app_version: appVersionString(),
    os_version: Device.osVersion ?? null,
    device_name: Device.modelName ?? null,
    // POS (plan E.5, Appendix G): which build this is (the POS app step it carries), so the web
    // sends new push types only to builds that handle them. Every registration sends it.
    client_build: clientBuild(),
    ...cardFields(),
  };

  try {
    const response = await apiFetch<{ device?: { id?: string } }>('/api/v1/me/devices', {
      accessToken: input.accessToken,
      method: 'POST',
      body: JSON.stringify(payload),
    });
    // Remember the row so signing out can remove it — see `unregisterDevice`.
    registeredDeviceId = response?.device?.id ?? null;
    lastRegistration = { payload, sentReport: cardReport };
  } catch (error) {
    console.warn('[push] /api/v1/me/devices POST failed:', error);
    return { registered: false, pushToken, reason: 'error' };
  }

  return { registered: true, pushToken };
}

/**
 * The `user_devices` row this session registered, held for the process so
 * sign-out can delete it.
 */
let registeredDeviceId: string | null = null;

/**
 * Detach this device from the signed-in user's push registrations.
 *
 * MUST be called while the session is still valid — the DELETE is scoped
 * `user_id = auth.uid()`, so it is a no-op once the token is revoked.
 *
 * Without this the row outlives the sign-out, and the server fans out purely by
 * `user_id` (`staff-push-notification.ts`), pruning tokens only when Expo reports
 * them INVALID — which never happens here, because the token is still perfectly
 * valid; only its owner changed. On a shared salon tablet that means the next
 * person to sign in keeps receiving the previous venue's booking alerts, and
 * those carry the client's name and service in the body. The unique index is on
 * `(user_id, push_token)`, so re-registering under the new user ADDS a row rather
 * than reassigning the old one — both fire, indefinitely.
 *
 * Best-effort: a failure here must never block sign-out, so it is swallowed.
 */
export async function unregisterDevice(accessToken: string | null): Promise<void> {
  const deviceId = registeredDeviceId;
  registeredDeviceId = null;
  lastRegistration = null;
  cardReport = null;
  if (!deviceId || !accessToken) return;
  try {
    await apiFetch(`/api/v1/me/devices/${encodeURIComponent(deviceId)}`, {
      accessToken,
      method: 'DELETE',
    });
  } catch (error) {
    console.warn('[push] device unregister failed:', error);
  }
}

// ─── POS: what this phone can do with a card (app step 2, plan §4.36) ────────

/** The latest card report, sent with every registration from now on. Null until known. */
let cardReport: DeviceCardReport | null = null;

/** The last registration sent, so a changed card report can be sent again on the same row. */
let lastRegistration: { payload: Record<string, unknown>; sentReport: DeviceCardReport | null } | null = null;

function cardFields(): Record<string, unknown> {
  if (!cardReport) return {};
  return {
    card_capability: cardReport.card_capability,
    tap_to_pay_terms_accepted: cardReport.tap_to_pay_terms_accepted,
  };
}

/**
 * The `user_devices` row this session registered, or null (no push permission, a simulator, Expo
 * Go, or not registered yet). A sale sent from the web till is claimed with it (`device_id`).
 */
export function getRegisteredDeviceId(): string | null {
  return registeredDeviceId;
}

/**
 * Records what this phone can do with a card and, when it changed since the last registration,
 * sends the registration again: the web keys the row on the push token, so this refreshes the same
 * row. Each registration is the device's latest word (web `account/devices` route), which is why
 * the whole payload goes again rather than only the changed fields. Best effort: never throws.
 */
export async function reportDeviceCardCapability(
  accessToken: string | null,
  report: DeviceCardReport,
): Promise<boolean> {
  cardReport = report;
  const last = lastRegistration;
  // A registration that carried no card fields reads as "none" on the web, so a phone that cannot
  // take cards sends nothing extra.
  if (!last || !accessToken || sameCardReport(last.sentReport ?? NO_CARD, report)) return false;
  const payload = { ...last.payload, client_build: clientBuild(), ...cardFields() };
  lastRegistration = { payload, sentReport: report };
  try {
    const response = await apiFetch<{ device?: { id?: string } }>('/api/v1/me/devices', {
      accessToken,
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (response?.device?.id) registeredDeviceId = response.device.id;
    return true;
  } catch (error) {
    // The next change, or the next sign-in, sends it again.
    if (lastRegistration?.payload === payload) lastRegistration = { payload, sentReport: last.sentReport };
    console.warn('[push] card capability update failed:', error);
    return false;
  }
}

/** Test seam: forget this process's registration and card report. */
export function __resetDeviceRegistrationForTests(): void {
  registeredDeviceId = null;
  lastRegistration = null;
  cardReport = null;
}
