import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  ComplianceDashboardData,
  ComplianceFormLinksResponse,
} from '@/types/compliance';

/** GET /api/venue/compliance/dashboard — expiring / missing / awaiting (plan-gated). */
export function useComplianceDashboard() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.compliance.dashboard(accessToken),
    enabled,
    retry: false, // a 403 means the plan doesn't include compliance — don't hammer it
    queryFn: async (): Promise<ComplianceDashboardData> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<ComplianceDashboardData>('/api/venue/compliance/dashboard', { accessToken });
    },
  });
}

/** GET /api/venue/compliance/form-links — outstanding & completed form links. */
export function useComplianceFormLinks() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.compliance.formLinks(accessToken),
    enabled,
    retry: false,
    queryFn: async (): Promise<ComplianceFormLinksResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<ComplianceFormLinksResponse>('/api/venue/compliance/form-links', {
        accessToken,
      });
    },
  });
}

/** POST /api/venue/compliance/form-links/[id]/resend — re-send a pending form. */
export function useResendFormLink() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      send_via: 'email' | 'sms';
    }): Promise<{ dispatched: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ dispatched: boolean }>(
        `/api/venue/compliance/form-links/${input.id}/resend`,
        { accessToken, method: 'POST', body: JSON.stringify({ send_via: input.send_via }) },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    },
  });
}

/** POST /api/venue/compliance/form-links/[id]/revoke — revoke an unconsumed link. */
export function useRevokeFormLink() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (linkId: string): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>(`/api/venue/compliance/form-links/${linkId}/revoke`, {
        accessToken,
        method: 'POST',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    },
  });
}
