import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { captureException } from '@/lib/observability';

/**
 * Block screenshots / screen recording while a PII-bearing screen is focused.
 *
 * On Android this sets `FLAG_SECURE` (screenshots blocked, app content hidden in
 * the recents thumbnail); on iOS it obscures the screen during a recording. The
 * protection is scoped to focus via expo-router's `useFocusEffect`, so leaving the
 * screen (navigating away, opening another tab) restores normal capture.
 *
 * Every native call is wrapped so a missing module or an unsupported platform
 * (e.g. web) NEVER crashes the screen — protection just silently no-ops.
 *
 * @param key Unique per screen so concurrent prevent/allow calls don't clobber
 *   each other (expo-screen-capture reference-counts by key; default 'default').
 */
export function useScreenCaptureProtection(key: string): void {
  useFocusEffect(
    useCallback(() => {
      // Loaded lazily + typed `any` so the bundle compiles even if the native
      // module isn't present (e.g. a future build that drops the dep).
      let ScreenCapture: {
        preventScreenCaptureAsync?: (key?: string) => Promise<void>;
        allowScreenCaptureAsync?: (key?: string) => Promise<void>;
      } | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        ScreenCapture = require('expo-screen-capture');
      } catch {
        // Module unavailable — nothing to protect, bail out quietly.
        return;
      }

      void ScreenCapture?.preventScreenCaptureAsync?.(key).catch((err: unknown) => {
        // Unsupported device / permission quirk — degrade open rather than throw.
        captureException(err, { scope: 'screen-capture.prevent', captureKey: key });
      });

      return () => {
        void ScreenCapture?.allowScreenCaptureAsync?.(key).catch(() => {
          // Best-effort restore; a failure here only leaves capture blocked,
          // which is the safe direction, so swallow it.
        });
      };
    }, [key]),
  );
}
