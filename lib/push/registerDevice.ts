import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { apiFetch } from '@/lib/api/client';
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
  const expoVersion = Constants.expoConfig?.version;
  if (typeof expoVersion === 'string' && expoVersion.length > 0) {
    return expoVersion.slice(0, 80);
  }
  return null;
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
  };

  try {
    const response = await apiFetch<{ device?: { id?: string } }>('/api/v1/me/devices', {
      accessToken: input.accessToken,
      method: 'POST',
      body: JSON.stringify(payload),
    });
    // Remember the row so signing out can remove it — see `unregisterDevice`.
    registeredDeviceId = response?.device?.id ?? null;
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
