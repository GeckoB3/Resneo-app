import { useCallback, useEffect, useRef, type ReactNode } from 'react';

import { getStripePublishableKey } from '@/lib/env';
import {
  clearTerminalLocationCache,
  fetchConnectionToken,
} from '@/lib/payments/connection-token';
import { getTerminalSdk } from '@/lib/payments/terminal-sdk';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';
import { useVenueContext } from '@/providers/VenueProvider';

/**
 * Stripe Terminal provider for in-person payments (Tap to Pay design doc §7.5).
 *
 * FRICTIONLESS OFF (hard requirement §1.3/§3.2): when the venue has not enabled
 * in-person payments — or the Terminal SDK is unavailable on this build, or no
 * Stripe publishable key is configured — this renders `children` UNTOUCHED. No
 * Terminal initialisation, no listeners, no network calls. A venue that never
 * opts in gets byte-for-byte the app they had before the feature existed.
 *
 * Mounted just inside `ToastProvider` so the token provider has the access
 * token, the venue, and the linked-venue scope available.
 */
export function TerminalProvider({ children }: { children: ReactNode }) {
  const { venue } = useVenueContext();
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

  const sdk = getTerminalSdk();
  const enabled =
    Boolean(venue?.in_person_payments_enabled) && sdk !== null && Boolean(getStripePublishableKey());

  if (!enabled || !sdk) {
    return <>{children}</>;
  }

  const StripeTerminalProvider = sdk.StripeTerminalProvider;
  return (
    <StripeTerminalProvider logLevel={__DEV__ ? 'verbose' : 'error'} tokenProvider={tokenProvider}>
      {children}
    </StripeTerminalProvider>
  );
}
