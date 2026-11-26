/**
 * "This version is too old to save changes": the server's answer to a write from a build below
 * the write minimum (web codebase standards plan P4.9, `Docs/MOBILE_API.md` "Old app builds told
 * to update"). The server answers 426 with `code: 'APP_UPDATE_REQUIRED'` and a sentence in
 * `error`; `apiFetch` shows that sentence here, once at a time, with a button to the store.
 *
 * Reads are never refused, so the app stays usable for looking things up until it is updated.
 */
import { Alert } from 'react-native';

import { openStoreListing } from '@/lib/app-update/app-update-runtime';

export const APP_UPDATE_REQUIRED_CODE = 'APP_UPDATE_REQUIRED';

/** Used when the server's sentence is missing (it never should be). */
export const APP_UPDATE_REQUIRED_FALLBACK =
  'This version of the ResNeo app is too old to save changes. Please update the app, then try again.';

/** True for the server's "update the app" answer. */
export function isAppUpdateRequired(status: number, body: unknown): boolean {
  return (
    status === 426 &&
    typeof body === 'object' &&
    body !== null &&
    (body as { code?: unknown }).code === APP_UPDATE_REQUIRED_CODE
  );
}

let showing = false;

/**
 * Show the update message with "Update" (opens the store listing) and "Not now". Several writes
 * refused together show one alert, not a stack of them.
 */
export function showAppUpdateRequired(message?: string | null): void {
  if (showing) return;
  showing = true;
  const done = () => {
    showing = false;
  };
  Alert.alert(
    'Update the app',
    message?.trim() || APP_UPDATE_REQUIRED_FALLBACK,
    [
      { text: 'Not now', style: 'cancel', onPress: done },
      {
        text: 'Update',
        onPress: () => {
          done();
          void openStoreListing();
        },
      },
    ],
    { cancelable: true, onDismiss: done },
  );
}

/** Tests only: forget that an alert is showing. */
export function resetAppUpdateRequiredAlert(): void {
  showing = false;
}
