import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * Per-service compliance requirements — the app port of the web
 * `ComplianceRequirementsEditor` (Settings → Compliance per-service + inline in
 * the service editor). All four routes use `createVenueRouteClient` on the web,
 * so they're Bearer-callable directly:
 *  - GET    /requirements?service_id=…   list a service's requirements (any staff)
 *  - POST   /requirements                add one (admin)
 *  - PATCH  /requirements/[id]           change enforcement / lock period (admin)
 *  - DELETE /requirements/[id]           remove one (admin)
 *
 * The server resolves the polymorphic service FK (`appointment_service_id` vs
 * `service_item_id`) by venue type, so callers just pass the booked-service row
 * id as `service_id`.
 */

/** Enforcement levels (mirrors COMPLIANCE_ENFORCEMENT_LEVELS on the web). */
export const COMPLIANCE_ENFORCEMENT_OPTIONS = [
  { value: 'warn_staff', label: 'Warn staff' },
  { value: 'warn_client', label: 'Warn client' },
  { value: 'block_online', label: 'Block online booking' },
  { value: 'block_all', label: 'Block all bookings' },
] as const;

export type ComplianceEnforcement =
  (typeof COMPLIANCE_ENFORCEMENT_OPTIONS)[number]['value'];

export const COMPLIANCE_ENFORCEMENT_LABELS: Record<string, string> = Object.fromEntries(
  COMPLIANCE_ENFORCEMENT_OPTIONS.map((o) => [o.value, o.label]),
);

/** One row from GET /requirements (web `RequirementRow`). */
export interface ComplianceRequirementRow {
  id: string;
  compliance_type_id: string;
  enforcement: ComplianceEnforcement;
  lock_period_hours: number | null;
  appointment_service_id: string | null;
  service_item_id: string | null;
  compliance_type_name: string;
  compliance_type_category: string;
  compliance_type_is_active: boolean;
}

const requirementKeys = {
  forService: (accessToken: string | null, serviceId: string | null) =>
    [
      ...queryKeys.compliance.all(),
      'requirements',
      keyScope(accessToken),
      serviceId ?? null,
    ] as const,
};

/** GET /api/venue/compliance/requirements?service_id=… */
export function useComplianceRequirements(serviceId: string | null, enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled =
    enabled && isBackendConfigured() && accessToken !== null && !!serviceId;

  return useQuery({
    queryKey: requirementKeys.forService(accessToken, serviceId),
    enabled: queryEnabled,
    retry: false, // 403/402 = plan gate
    queryFn: async (): Promise<{ requirements: ComplianceRequirementRow[] }> => {
      if (!accessToken || !serviceId) {
        throw new Error('Missing parameters');
      }
      return apiFetch<{ requirements: ComplianceRequirementRow[] }>(
        `/api/venue/compliance/requirements?service_id=${encodeURIComponent(serviceId)}`,
        { accessToken },
      );
    },
  });
}

/** POST /api/venue/compliance/requirements — add a requirement (admin). */
export function useAddComplianceRequirement() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      service_id: string;
      compliance_type_id: string;
      enforcement: ComplianceEnforcement;
      lock_period_hours?: number | null;
    }): Promise<{ requirement: ComplianceRequirementRow }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ requirement: ComplianceRequirementRow }>(
        '/api/venue/compliance/requirements',
        { accessToken, method: 'POST', body: JSON.stringify(input) },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    },
  });
}

/** PATCH /api/venue/compliance/requirements/[id] — change enforcement / lock period (admin). */
export function useUpdateComplianceRequirement() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      enforcement?: ComplianceEnforcement;
      lock_period_hours?: number | null;
    }): Promise<{ requirement: ComplianceRequirementRow }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const { id, ...patch } = input;
      return apiFetch<{ requirement: ComplianceRequirementRow }>(
        `/api/venue/compliance/requirements/${id}`,
        { accessToken, method: 'PATCH', body: JSON.stringify(patch) },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    },
  });
}

/** DELETE /api/venue/compliance/requirements/[id] — remove a requirement (admin). */
export function useDeleteComplianceRequirement() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<{ success: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ success: boolean }>(`/api/venue/compliance/requirements/${id}`, {
        accessToken,
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    },
  });
}
