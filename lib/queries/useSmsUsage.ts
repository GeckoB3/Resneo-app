import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * Live SMS usage for the current Stripe billing period — mirrors the web
 * `SmsUsageDisplay` payload from `/api/venue/sms-usage-display`.
 * @see _reference/Resneo/src/lib/billing/sms-usage-display.ts
 */
export interface SmsUsageDisplay {
  messages_sent: number;
  messages_included: number;
  remaining: number;
  overage_count: number;
  overage_amount_pence: number;
  /** Included allowance with metered overage beyond the bundle. */
  billing_mode: 'bundle_allowance';
  /** GBP per billable SMS segment beyond the included allowance. */
  billable_unit_gbp: number;
}

interface SmsUsageResponse {
  usage: SmsUsageDisplay | null;
}

/**
 * GET /api/venue/sms-usage-display — admin-only live SMS usage (Bearer).
 *
 * The route resolves staff via `createVenueRouteClient`, which honours the
 * `Authorization: Bearer` header, so it is reachable from the app. It degrades
 * gracefully: a 401/403/network error surfaces as `isError`, and a non-SMS or
 * not-yet-tracked venue returns `usage: null` — both cases let the Plan screen
 * fall back to the static allowance copy.
 */
export function useSmsUsage(enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: [...queryKeys.dashboard.all(), 'smsUsage', keyScope(accessToken)],
    enabled: queryEnabled,
    // Live billing-period figure; revalidate sparingly (web dedupes for 2 min).
    staleTime: 120_000,
    queryFn: async (): Promise<SmsUsageDisplay | null> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const res = await apiFetch<SmsUsageResponse>('/api/venue/sms-usage-display', {
        accessToken,
      });
      return res.usage ?? null;
    },
  });
}
