import { useCallback, useEffect, useRef, type ReactNode } from 'react';

import { isDiagnosticBuild } from '@/lib/build-channel';
import { getStripePublishableKey } from '@/lib/env';
import {
  clearTerminalLocationCache,
  fetchConnectionToken,
} from '@/lib/payments/connection-token';
import { getTerminalSdk } from '@/lib/payments/terminal-sdk';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';
import { TapToPayProvider } from '@/providers/TapToPayProvider';

/**
 * Stripe Terminal provider for in-person payments (Tap to Pay design doc §7.5).
 *
 * FRICTIONLESS OFF (hard requirement §1.3/§3.2): a venue that has not enabled
 * in-person payments gets no Terminal initialisation and no network calls.
 * Nothing here initialises the SDK or asks for a connection token: that only
 * happens when a card surface (all gated on the venue flag) connects a reader.
 *
 * The SDK provider itself mounts on the BUILD, not the venue flag: whenever the
 * native module and a publishable key are present, neither of which can change
 * while the app runs. Mounting it registers JS event listeners and nothing else.
 * It used to mount only while `in_person_payments_enabled` was on, which meant
 * turning the setting on or off changed the shape of the tree above the whole
 * app — React rebuilt every screen beneath it, so Settings jumped back to the top
 * and any state anywhere was lost. On a build without the SDK or key, children
 * are rendered untouched, as before.
 *
 * Mounted just inside `ToastProvider` so the token provider has the access
 * token, the venue, and the linked-venue scope available.
 */
export function TerminalProvider({ children }: { children: ReactNode }) {
  const accessToken = useAccessToken();
  const { ownerVenueId } = useLinkedVenueContext();

  // Hooks must run unconditionally and in a stable order, so everything is
  // computed BEFORE the early return below (the design doc's sketch inlines the
  // callback after the return, which React does not allow).
  const scopeRef = useRef<string | null>(ownerVenueId ?? null);

  /**
   * The SDK calls this whenever it needs a fresh connection token. It must
   * return only the secret; the location id is cached by `fetchConnectionToken`
   * for the reader hooks.
   */
  const tokenProvider = useCallback(async (): Promise<string> => {
    const res = await fetchConnectionToken({ accessToken, ownerVenueId: ownerVenueId ?? null });
    return res.secret;
  }, [accessToken, ownerVenueId]);

  // Switching linked venue changes the connected account, so any cached
  // Terminal Location for the previous scope must go (§7.5). The reader hooks
  // disconnect their reader on the same signal.
  useEffect(() => {
    const next = ownerVenueId ?? null;
    if (scopeRef.current !== next) {
      scopeRef.current = next;
      clearTerminalLocationCache();
    }
  }, [ownerVenueId]);

  // Fixed for the life of the process: see the note above on why the venue flag
  // must not decide whether this provider is in the tree.
  const sdk = getTerminalSdk();
  const available = sdk !== null && Boolean(getStripePublishableKey());

  if (!available || !sdk) {
    return <>{children}</>;
  }

  const StripeTerminalProvider = sdk.StripeTerminalProvider;
  return (
    /**
     * `error` in production, verbose everywhere else — including preview builds,
     * which are release builds and were therefore silent. That silence cost a
     * whole debugging round trip: the SDK aborts the process on some integration
     * errors and prints its reason immediately beforehand, so at `error` level
     * the crash arrives with no explanation attached.
     */
    <StripeTerminalProvider
      logLevel={isDiagnosticBuild() ? 'verbose' : 'error'}
      tokenProvider={tokenProvider}>
      {/* Tap to Pay on iPhone warm-up and status (iOS; inert elsewhere). Inside
          the SDK provider because it drives the reader. */}
      <TapToPayProvider>{children}</TapToPayProvider>
    </StripeTerminalProvider>
  );
}
