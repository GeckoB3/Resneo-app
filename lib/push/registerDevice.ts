import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { apiFetch } from '@/lib/api/client';
import { isExpoGoClient } from '@/lib/push/runtime';

export type DevicePlatform = 'ios' | 'android' | 'web';

export interface RegisterDeviceInput {
  accessToken: string;
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

  const Notifications = await import('expo-notifications');

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') {
    permission = await Notifications.requestPermissionsAsync();
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
    push_token: pushToken,
    app_version: appVersionString(),
    os_version: Device.osVersion ?? null,
    device_name: Device.modelName ?? null,
  };

  try {
    await apiFetch('/api/v1/me/devices', {
      accessToken: input.accessToken,
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('[push] /api/v1/me/devices POST failed:', error);
    return { registered: false, pushToken, reason: 'error' };
  }

  return { registered: true, pushToken };
}
