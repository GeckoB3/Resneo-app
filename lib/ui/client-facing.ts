import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/**
 * While a client holds the phone to choose a tip and pay (POS test round, 2026-10-11, Part 3):
 *
 * - `isClientFacing()` lets the push handler keep other clients' names off the screen;
 * - Back (Android) asks the staff "Stop this card payment?" panel instead of closing anything:
 *   a sheet in takeover mode calls `requestClientBack()` from its Modal, a full screen gets it from
 *   `BackHandler`;
 * - the screen stays awake, where the build has the keep-awake module.
 *
 * Module state, not React state: the push handler runs outside the tree.
 */

let facing = 0;
const backListeners = new Set<() => void>();
const KEEP_AWAKE_TAG = 'resneo-client-facing';

/** True while any screen has the phone in a client's hands. */
export function isClientFacing(): boolean {
  return facing > 0;
}

/** Ask the client screen to open its staff stop panel. False when nothing listens. */
export function requestClientBack(): boolean {
  const listeners = [...backListeners];
  for (const listener of listeners) listener();
  return listeners.length > 0;
}

/** Keep-awake is in Expo Go and the store builds through `expo`; a build without it just dims. */
function keepAwake(on: boolean): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module
    const mod = require('expo-keep-awake') as {
      activateKeepAwakeAsync?: (tag?: string) => Promise<void>;
      deactivateKeepAwake?: (tag?: string) => Promise<void> | void;
    };
    if (on) void mod.activateKeepAwakeAsync?.(KEEP_AWAKE_TAG)?.catch(() => undefined);
    else void Promise.resolve(mod.deactivateKeepAwake?.(KEEP_AWAKE_TAG)).catch(() => undefined);
  } catch {
    // No native module in this build.
  }
}

/**
 * Marks the client-facing stretch while `active`, and sends Back to `onBack` (the stop panel).
 * `hardwareBack` adds a `BackHandler` for a full screen; a sheet gets Back from its Modal instead.
 */
export function useClientFacing(active: boolean, onBack: () => void, options: { hardwareBack?: boolean } = {}): void {
  const hardwareBack = options.hardwareBack === true;
  useEffect(() => {
    if (!active) return undefined;
    facing += 1;
    if (facing === 1) keepAwake(true);
    backListeners.add(onBack);
    const sub = hardwareBack
      ? BackHandler.addEventListener('hardwareBackPress', () => {
          onBack();
          return true;
        })
      : null;
    return () => {
      sub?.remove();
      backListeners.delete(onBack);
      facing = Math.max(0, facing - 1);
      if (facing === 0) keepAwake(false);
    };
  }, [active, onBack, hardwareBack]);
}

/** Test seam. */
export function __resetClientFacingForTests(): void {
  facing = 0;
  backListeners.clear();
}
