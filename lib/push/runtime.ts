import Constants from 'expo-constants';

/**
 * True when the app runs inside the Expo Go store client.
 * Remote push is not supported there on Android (SDK 53+) — use a development build instead.
 */
export function isExpoGoClient(): boolean {
  return Constants.executionEnvironment === 'storeClient';
}
