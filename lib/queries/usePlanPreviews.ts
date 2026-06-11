import { useQueries } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { billingKeys, type AppointmentsPlanPreview } from '@/lib/queries/useBillingStatus';

/**
 * Proration previews for moving to each other Appointments tier — mirrors the
 * web Plan tab, which fetches /api/venue/appointments-plan/preview for every
 * tier other than the current one as soon as the section renders.
 *
 * A failed preview (e.g. downgrade blocked by calendar/team limits) resolves
 * to `null` for that tier so the rest of the section still renders — the web
 * shows fallback copy in that case too.
 */
export function useAppointmentsPlanPreviews(
  targetTiers: string[],
  enabled = true,
): Partial<Record<string, AppointmentsPlanPreview | null>> {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  const results = useQueries({
    queries: targetTiers.map((tier) => ({
      queryKey: [...billingKeys.all, 'planPreview', accessToken ?? null, tier] as const,
      enabled: queryEnabled,
      staleTime: 60_000,
      gcTime: 60_000,
      retry: false,
      queryFn: async (): Promise<AppointmentsPlanPreview | null> => {
        if (!accessToken) return null;
        try {
          return await apiFetch<AppointmentsPlanPreview>('/api/venue/appointments-plan/preview', {
            accessToken,
            method: 'POST',
            body: JSON.stringify({ target_tier: tier }),
          });
        } catch {
          return null;
        }
      },
    })),
  });

  const map: Partial<Record<string, AppointmentsPlanPreview | null>> = {};
  targetTiers.forEach((tier, i) => {
    map[tier] = results[i]?.data ?? null;
  });
  return map;
}
