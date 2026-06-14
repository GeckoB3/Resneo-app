import { useEffect } from 'react';

import { ANALYTICS_EVENTS, track } from '@/lib/analytics';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';

/**
 * Bridges auth-level notices down to the Toast host. AuthProvider sits ABOVE
 * ToastProvider in the tree, so it can't toast directly; this renders nothing
 * but lives under ToastProvider and shows a single "session expired" toast when
 * the session is lost unexpectedly (refresh-token revoked/expired), then clears
 * the flag so it fires once.
 */
export function AuthNoticeBridge() {
  const { sessionExpired, acknowledgeSessionExpiry } = useAuth();
  const toast = useToast();

  useEffect(() => {
    if (!sessionExpired) return;
    toast.error('Your session expired — please sign in again.');
    track(ANALYTICS_EVENTS.sessionExpired);
    acknowledgeSessionExpiry();
  }, [sessionExpired, acknowledgeSessionExpiry, toast]);

  return null;
}
