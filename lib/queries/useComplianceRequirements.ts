import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import type { ComplianceOnlineCollection } from '@/lib/compliance/constants';
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
  {
    value: 'warn_staff',
    label: 'Warn staff',
    description:
      'The booking still goes through. Your team sees an outstanding-form flag on the calendar and booking so they can collect the record before the appointment. The client is not told.',
  },
  {
    value: 'warn_client',
    label: 'Warn client',
    description:
      'The booking still goes through. When the client books online they see a note that a form is needed, and your team sees the flag too.',
  },
  {
    value: 'block_online',
    label: 'Block online booking',
    description:
      'Clients cannot book this service online until a valid record is on file. Your team can still book them in from the dashboard.',
  },
  {
    value: 'block_all',
    label: 'Block all bookings',
    description:
      'No one can book this service until a valid record is on file, online or from the dashboard. An admin can override when booking from the dashboard.',
  },
] as const;

export type ComplianceEnforcement =
  (typeof COMPLIANCE_ENFORCEMENT_OPTIONS)[number]['value'];

export const COMPLIANCE_ENFORCEMENT_LABELS: Record<string, string> = Object.fromEntries(
  COMPLIANCE_ENFORCEMENT_OPTIONS.map((o) => [o.value, o.label]),
);

/** Per-level explanation shown under the enforcement selector (mirrors web shared.ts). */
export const COMPLIANCE_ENFORCEMENT_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  COMPLIANCE_ENFORCEMENT_OPTIONS.map((o) => [o.value, o.description]),
);

export type { ComplianceOnlineCollection };

/**
 * Where a client-completable form is offered during online booking. Mirrors the
 * web `ONLINE_COLLECTION_OPTIONS` (labels + descriptions) in shared.ts.
 */
export const COMPLIANCE_ONLINE_COLLECTION_OPTIONS: {
  value: ComplianceOnlineCollection;
  label: string;
  description: string;
}[] = [
  {
    value: 'confirmation_link',
    label: 'Email a link in the confirmation',
    description:
      'The client books straight away and gets a secure link in their confirmation email to complete the form before their visit.',
  },
  {
    value: 'inline',
    label: 'Show in the booking flow',
    description:
      'The client completes the form as a step while they book. If this requirement blocks online booking, they cannot finish booking until it is done.',
  },
  {
    value: 'none',
    label: 'Do not collect online',
    description: 'The form is never shown to the client online. Your team collects it in venue.',
  },
];

export const COMPLIANCE_ONLINE_COLLECTION_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  COMPLIANCE_ONLINE_COLLECTION_OPTIONS.map((o) => [o.value, o.description]),
);

/** One row from GET /requirements (web `RequirementRow`). */
export interface ComplianceRequirementRow {
  id: string;
  compliance_type_id: string;
  enforcement: ComplianceEnforcement;
  lock_period_hours: number | null;
  online_collection: ComplianceOnlineCollection;
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

/**
 * Shared fetcher so the single-service hook and the bulk counts hook stay in
 * lockstep — the SAME query key must always map to the same payload, letting
 * the panel's count queries seed the editor's cache (expanding a service is
 * then instant) and vice versa.
 */
async function fetchRequirementsForService(
  accessToken: string,
  serviceId: string,
): Promise<{ requirements: ComplianceRequirementRow[] }> {
  return apiFetch<{ requirements: ComplianceRequirementRow[] }>(
    `/api/venue/compliance/requirements?service_id=${encodeURIComponent(serviceId)}`,
    { accessToken },
  );
}

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
      return fetchRequirementsForService(accessToken, serviceId);
    },
  });
}

/**
 * Requirement COUNTS for many services at once — drives the at-a-glance
 * markers on the Settings → Compliance Requirements tab (which services have a
 * requirement without expanding each one). The backend's GET requires a
 * `service_id` (no list-all route), so this fans out one light query per
 * service, sharing {@link requirementKeys.forService} with the editor's hook so
 * the caches feed each other and every requirement mutation (which invalidates
 * `queryKeys.compliance.all()`) refreshes the markers automatically.
 *
 * Returns a Map of serviceId → requirement count; a service is absent until
 * its query resolves (render no marker rather than a wrong one).
 */
export function useComplianceRequirementCounts(
  serviceIds: string[],
  enabled = true,
): Map<string, number> {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQueries({
    queries: serviceIds.map((serviceId) => ({
      queryKey: requirementKeys.forService(accessToken, serviceId),
      enabled: queryEnabled && !!serviceId,
      retry: false, // 403/402 = plan gate
      queryFn: async (): Promise<{ requirements: ComplianceRequirementRow[] }> => {
        if (!accessToken || !serviceId) {
          throw new Error('Missing parameters');
        }
        return fetchRequirementsForService(accessToken, serviceId);
      },
    })),
    combine: (results) => {
      const counts = new Map<string, number>();
      results.forEach((result, index) => {
        const serviceId = serviceIds[index];
        if (serviceId && result.data) {
          counts.set(serviceId, result.data.requirements.length);
        }
      });
      return counts;
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
      online_collection?: ComplianceOnlineCollection;
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
      online_collection?: ComplianceOnlineCollection;
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
