import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/** A single referral row, pre-shaped by the server for direct display. */
export interface ReferralRowForUi {
  id: string;
  refereeName: string;
  status: 'pending' | 'referee_signed_up' | 'credited' | 'failed' | 'void';
  statusLabel: string;
  rewardDisplay: string | null;
  occurredAt: string;
  voidReason: string | null;
}

/** GET /api/venue/referrals payload — the Refer & Earn dashboard (admin-only). */
export interface ReferralsDashboardData {
  code: string;
  shareableLink: string;
  rewardDisplay: string;
  referrerVenueName: string;
  referralsForUi: ReferralRowForUi[];
  totalCreditedPence: number;
  creditRemainingPence: number | null;
  counts: { total: number; credited: number; pending: number };
}

/**
 * GET /api/venue/referrals — the venue's "Refer & Earn" dashboard (Bearer).
 *
 * Admin-only on the server: it replies 403 for non-admins and when the referral
 * programme is disabled, so callers gate `enabled` on the admin role and surface
 * a disabled state on error.
 */
export function useReferrals(enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.referrals.dashboard(accessToken),
    enabled: queryEnabled,
    queryFn: async (): Promise<ReferralsDashboardData> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<ReferralsDashboardData>('/api/venue/referrals', { accessToken });
    },
  });
}
