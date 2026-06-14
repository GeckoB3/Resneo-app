import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { ApiError, apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useComplianceDashboard, useComplianceFormLinks } from '@/lib/queries/useCompliance';

/**
 * Compliance TEMPLATE (type) management — the Bearer-accessible subset of the
 * web dashboard's Settings → Compliance → Templates & types surface.
 *
 * Bearer capability of /api/venue/compliance/types* (verified in the reference
 * repo, _reference/Resneo/src/app/api/venue/compliance):
 *  - GET   /types/[id]            createVenueRouteClient → Bearer OK (detail + current form schema)
 *  - PATCH /types/[id]            createVenueRouteClient → Bearer OK (admin; non-schema fields incl. is_active)
 *  - GET   /types (list)          bare createClient()    → cookie-only, 401 from the app
 *  - POST  /types (create)        bare createClient()    → cookie-only
 *  - POST  /types/[id]/archive    bare createClient()    → cookie-only (PATCH is_active works instead)
 *  - POST  /types/[id]/restore    bare createClient()    → cookie-only (PATCH is_active works instead)
 *  - GET/POST /types/[id]/versions bare createClient()   → cookie-only (form-field editing is web-only)
 *  - GET /library, POST /library/[slug]/clone             → cookie-only (template library is web-only)
 *
 * Because the list route is cookie-only, the app discovers template ids from
 * Bearer-accessible payloads instead: the compliance dashboard, outstanding
 * form links and the venue's captured records. Each discovered id is then
 * hydrated through GET /types/[id].
 */

// ---------------------------------------------------------------------------
// Constants (mirror _reference/Resneo/src/lib/compliance/constants.ts +
// zod-schemas.ts — keep in sync with the web)
// ---------------------------------------------------------------------------

export const COMPLIANCE_TYPE_CATEGORIES = [
  'test',
  'consent',
  'intake',
  'declaration',
  'certificate',
] as const;
export type ComplianceTypeCategory = (typeof COMPLIANCE_TYPE_CATEGORIES)[number];

export const COMPLIANCE_TYPE_CAPTURE_METHODS = ['staff_in_venue', 'client_online'] as const;
export type ComplianceTypeCaptureMethod = (typeof COMPLIANCE_TYPE_CAPTURE_METHODS)[number];

/** PATCH /types/[id] bounds (complianceTypePatchSchema on the web). */
export const VALIDITY_DAYS_MAX = 36_500;
export const FORM_LINK_EXPIRY_MIN = 1;
export const FORM_LINK_EXPIRY_MAX = 365;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComplianceTemplateField {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  staff_only?: boolean;
  options?: { value: string; label: string }[];
}

export interface ComplianceTemplateFormSchema {
  schema_version?: string;
  title?: string;
  description?: string;
  intro_markdown?: string;
  fields?: ComplianceTemplateField[];
}

/** Full compliance_types row — GET /types/[id] does a select('*'). */
export interface ComplianceTemplateRow {
  id: string;
  name: string;
  category: string;
  result_type: string;
  description: string | null;
  validity_period_days: number | null;
  capture_methods: string[];
  form_link_expiry_days: number | null;
  is_active: boolean;
  archived_at?: string | null;
  source_template_slug?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** GET /api/venue/compliance/types/[id] response. */
export interface ComplianceTemplateDetail {
  type: ComplianceTemplateRow;
  version: {
    id: string;
    version_number: number;
    form_schema: ComplianceTemplateFormSchema | null;
  } | null;
}

/** Editable (non-schema) fields — complianceTypePatchSchema on the web. */
export interface ComplianceTemplatePatch {
  name?: string;
  category?: ComplianceTypeCategory;
  description?: string | null;
  validity_period_days?: number | null;
  capture_methods?: ComplianceTypeCaptureMethod[];
  form_link_expiry_days?: number | null;
  is_active?: boolean;
}

/** A template id+name discovered from Bearer-accessible compliance payloads. */
export interface DiscoveredComplianceTemplate {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Local query keys — keys.ts is shared with other surfaces, so compose from
// its compliance root here instead of editing it. The detail key deliberately
// matches useComplianceType() in useCompliance.ts so the cache is shared with
// the capture sheet and both refresh on invalidateQueries(compliance.all()).
// ---------------------------------------------------------------------------

const complianceTemplateKeys = {
  recordsDiscovery: (accessToken: string | null) =>
    [...queryKeys.compliance.all(), 'recordsDiscovery', keyScope(accessToken)] as const,
  detail: (accessToken: string | null, typeId: string | null) =>
    [...queryKeys.compliance.all(), 'type', keyScope(accessToken), typeId ?? null] as const,
};

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

type JoinedTypeName = { name?: string } | { name?: string }[] | null | undefined;

interface RecordsDiscoveryRow {
  compliance_type_id: string;
  compliance_types?: JoinedTypeName;
}

function joinedName(join: JoinedTypeName): string | null {
  const t = Array.isArray(join) ? join[0] : join;
  return t?.name ?? null;
}

function isPlanGate(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 402);
}

const FALLBACK_NAME = 'Compliance template';

/**
 * Discover the venue's compliance templates from Bearer-accessible payloads:
 * dashboard rows, outstanding form links and captured records. The cookie-only
 * GET /types list cannot be called from the app, so templates that have never
 * been used and have no current activity will not appear — the UI should say
 * the complete list lives on the web dashboard.
 */
export function useDiscoveredComplianceTemplates() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  const dashboard = useComplianceDashboard();
  const formLinks = useComplianceFormLinks();
  const records = useQuery({
    queryKey: complianceTemplateKeys.recordsDiscovery(accessToken),
    enabled,
    retry: false, // 403 = plan doesn't include compliance — don't hammer it
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ records: RecordsDiscoveryRow[] }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ records: RecordsDiscoveryRow[] }>('/api/venue/compliance/records', {
        accessToken,
      });
    },
  });

  const templates = useMemo<DiscoveredComplianceTemplate[]>(() => {
    const byId = new Map<string, string>();
    const add = (id: string | null | undefined, name: string | null | undefined) => {
      if (!id) return;
      const existing = byId.get(id);
      if (!existing || (name && existing === FALLBACK_NAME)) {
        byId.set(id, name || FALLBACK_NAME);
      }
    };

    for (const row of dashboard.data?.expiring_soon ?? []) {
      add(row.compliance_type_id, row.compliance_type_name);
    }
    for (const row of dashboard.data?.missing_for_bookings ?? []) {
      add(row.compliance_type_id, row.compliance_type_name);
    }
    for (const row of dashboard.data?.awaiting_submission ?? []) {
      add(row.compliance_type_id, row.compliance_type_name);
    }
    for (const link of formLinks.data?.links ?? []) {
      add(link.compliance_type_id, link.compliance_type_name);
    }
    for (const record of records.data?.records ?? []) {
      add(record.compliance_type_id, joinedName(record.compliance_types));
    }

    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dashboard.data, formLinks.data, records.data]);

  const planGated =
    isPlanGate(dashboard.error) || isPlanGate(formLinks.error) || isPlanGate(records.error);

  return {
    templates,
    /** True while the first discovery round-trip is in flight. */
    isLoading: dashboard.isLoading || formLinks.isLoading || records.isLoading,
    isRefetching: dashboard.isRefetching || formLinks.isRefetching || records.isRefetching,
    /** The venue's plan doesn't include compliance (403/402). */
    planGated,
    /** All discovery sources failed (excluding the plan gate). */
    isError: !planGated && dashboard.isError && formLinks.isError && records.isError,
    /** Some sources failed — the list may be missing templates. */
    discoveryIncomplete:
      !planGated && (dashboard.isError || formLinks.isError || records.isError),
    error: dashboard.error ?? formLinks.error ?? records.error,
    refetch: () => {
      void dashboard.refetch();
      void formLinks.refetch();
      void records.refetch();
    },
  };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

/** GET /api/venue/compliance/types/[id] — full row + current version schema. */
export function useComplianceTemplateDetail(typeId: string | null) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && !!typeId;

  return useQuery({
    queryKey: complianceTemplateKeys.detail(accessToken, typeId),
    enabled,
    retry: false,
    queryFn: async (): Promise<ComplianceTemplateDetail> => {
      if (!accessToken || !typeId) {
        throw new Error('Missing parameters');
      }
      return apiFetch<ComplianceTemplateDetail>(`/api/venue/compliance/types/${typeId}`, {
        accessToken,
      });
    },
  });
}

/** Fan-out detail hydration for the discovered template list (a handful of ids). */
export function useComplianceTemplateDetailsList(typeIds: string[]) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQueries({
    queries: typeIds.map((typeId) => ({
      queryKey: complianceTemplateKeys.detail(accessToken, typeId),
      enabled,
      retry: false,
      queryFn: async (): Promise<ComplianceTemplateDetail> => {
        if (!accessToken) {
          throw new Error('Missing access token');
        }
        return apiFetch<ComplianceTemplateDetail>(`/api/venue/compliance/types/${typeId}`, {
          accessToken,
        });
      },
    })),
  });
}

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

/**
 * PATCH /api/venue/compliance/types/[id] — admin-only edit of a template's
 * non-schema settings. Also used for archive/restore via `is_active` (the
 * dedicated /archive and /restore routes are cookie-only, but the same
 * `is_active` flag is what every read path checks).
 */
export function useUpdateComplianceTemplate() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      typeId: string;
      patch: ComplianceTemplatePatch;
    }): Promise<{ type: ComplianceTemplateRow }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ type: ComplianceTemplateRow }>(
        `/api/venue/compliance/types/${input.typeId}`,
        { accessToken, method: 'PATCH', body: JSON.stringify(input.patch) },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    },
  });
}
