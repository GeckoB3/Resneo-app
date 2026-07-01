import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { ApiError, apiFetch } from '@/lib/api/client';
import type {
  ComplianceFormSchema as BuilderFormSchema,
  ComplianceResultType,
} from '@/lib/compliance/form-schema';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useComplianceDashboard, useComplianceFormLinks } from '@/lib/queries/useCompliance';

/**
 * Compliance TEMPLATE (type) management — the admin-facing subset of the web
 * dashboard's Settings → Compliance → Templates & types surface.
 *
 * Auth: every /api/venue/compliance route (types, versions, library, clone,
 * requirements) uses `createVenueRouteClient(request)` on the web — Bearer +
 * cookie capable — so the app calls them all directly with a Bearer access
 * token. (None are cookie-only; the previous note here was stale.) Routes used
 * by this file, all verified in C:\Resneo/src/app/api/venue/compliance:
 *  - GET   /types[?include_archived=true]  list (any staff). Each row carries
 *                                          current_version_number +
 *                                          service_requirement_count +
 *                                          record_count (listComplianceTypesWithCounts).
 *  - POST  /types                          create a custom type (admin) → { type, version }
 *  - GET   /types/[id]                     detail + current form schema (any staff)
 *  - PATCH /types/[id]                     edit non-schema fields incl. is_active (admin)
 *  - POST  /types/[id]/versions            publish a new form-field version (admin)
 *  - GET   /library                        built-in template library (any staff)
 *  - POST  /library/[slug]/clone           clone a library template into the venue (admin)
 *
 * The real list query is `useComplianceTemplatesList` (GET /types) — it returns
 * the COMPLETE list including never-used + archived types and per-row counts, so
 * it supersedes the old id-discovery fallback. `useDiscoveredComplianceTemplates`
 * is retained only as a degradation path if the list route is unavailable.
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
  /** Guidance shown when an online booking is blocked by a self-uncompletable requirement (max 500). */
  online_unmet_message?: string | null;
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
  online_unmet_message?: string | null;
  /**
   * When set, the PATCH route publishes a new form version FIRST (atomic single-
   * request save, web audit U7), so an invalid schema aborts before any metadata
   * change. `changelog` is stored on that version.
   */
  form_schema?: BuilderFormSchema;
  changelog?: string;
  is_active?: boolean;
}

/** A template id+name discovered from Bearer-accessible compliance payloads. */
export interface DiscoveredComplianceTemplate {
  id: string;
  name: string;
}

/** One row in GET /types — the full list (incl. archived/never-used) + counts. */
export interface ComplianceTemplateListRow {
  id: string;
  name: string;
  category: string;
  result_type: string;
  validity_period_days: number | null;
  capture_methods: string[];
  form_link_expiry_days: number | null;
  is_active: boolean;
  current_version_number?: number | null;
  /** Number of services that require this type. */
  service_requirement_count?: number;
  /** Number of captured records of this type. */
  record_count?: number;
}

/** POST /types body — create a custom type (complianceTypeCreateSchema on the web). */
export interface CreateComplianceTemplateInput {
  name: string;
  category: ComplianceTypeCategory;
  description?: string | null;
  result_type: ComplianceResultType;
  validity_period_days: number | null;
  capture_methods: ComplianceTypeCaptureMethod[];
  form_link_expiry_days?: number | null;
  online_unmet_message?: string | null;
  form_schema: BuilderFormSchema;
}

/** One library starter template summary (GET /library). */
export interface ComplianceLibraryTemplate {
  slug: string;
  name: string;
  category: string;
  result_type: string;
  validity_period_days: number | null;
  capture_methods: string[];
  description?: string;
  field_count: number;
  /** Full form schema, so the picker can preview the fields before cloning. */
  form_schema?: ComplianceTemplateFormSchema;
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
  list: (accessToken: string | null, includeArchived: boolean) =>
    [...queryKeys.compliance.all(), 'typesList', keyScope(accessToken), includeArchived] as const,
  library: (accessToken: string | null) =>
    [...queryKeys.compliance.all(), 'library', keyScope(accessToken)] as const,
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
 * Discover the venue's compliance templates from already-loaded compliance
 * payloads: dashboard rows, outstanding form links and captured records. This
 * predates GET /types being Bearer-callable and is a fallback only — it misses
 * templates that have never been used and have no current activity. Prefer a
 * direct GET /types?include_archived=true list query (see the header note);
 * this hook can be retired once useComplianceTemplatesList lands.
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
 * non-schema settings. Also archives/restores via `is_active` — the flag every
 * read path checks. The dedicated /archive and /restore routes are Bearer-capable
 * too now (see the header note) and could be wired up under the R7 build; this
 * hook keeps using `is_active` because it already round-trips the updated row.
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

// ---------------------------------------------------------------------------
// List — the real GET /types (supersedes the discovery hack)
// ---------------------------------------------------------------------------

/**
 * GET /api/venue/compliance/types[?include_archived=true] — the COMPLETE list of
 * the venue's compliance types (any staff), including never-used and archived
 * ones, each with `service_requirement_count` + `record_count`. This is the
 * web TypesPanel's data source and replaces useDiscoveredComplianceTemplates.
 */
export function useComplianceTemplatesList(includeArchived = true) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: complianceTemplateKeys.list(accessToken, includeArchived),
    enabled,
    retry: false, // 403/402 = plan gate — don't hammer it
    queryFn: async (): Promise<{ types: ComplianceTemplateListRow[] }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const path = includeArchived
        ? '/api/venue/compliance/types?include_archived=true'
        : '/api/venue/compliance/types';
      return apiFetch<{ types: ComplianceTemplateListRow[] }>(path, { accessToken });
    },
  });
}

// ---------------------------------------------------------------------------
// Create type + publish version (admin)
// ---------------------------------------------------------------------------

/** POST /api/venue/compliance/types — create a custom type (admin). */
export function useCreateComplianceTemplate() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: CreateComplianceTemplateInput,
    ): Promise<ComplianceTemplateDetail> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<ComplianceTemplateDetail>('/api/venue/compliance/types', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    },
  });
}

/**
 * POST /api/venue/compliance/types/[id]/versions — publish a new immutable form
 * version (admin). The form builder uses this to save edited fields; the type's
 * non-schema settings are patched separately via useUpdateComplianceTemplate.
 */
export function useCreateComplianceVersion() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      typeId: string;
      formSchema: BuilderFormSchema;
      changelog?: string;
      // Response is the raw service value { versionId, versionNumber } — the
      // route returns result.value directly (not wrapped in { version }).
    }): Promise<{ versionId: string; versionNumber: number }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ versionId: string; versionNumber: number }>(
        `/api/venue/compliance/types/${input.typeId}/versions`,
        {
          accessToken,
          method: 'POST',
          body: JSON.stringify({ form_schema: input.formSchema, changelog: input.changelog }),
        },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    },
  });
}

// ---------------------------------------------------------------------------
// Type lifecycle — version history/restore, duplicate, archive/restore (admin)
// ---------------------------------------------------------------------------

/** One row from GET /types/[id]/versions (newest first). */
export interface ComplianceTypeVersionRow {
  id: string;
  version_number: number;
  changelog: string | null;
  created_by_staff_id: string | null;
  created_at: string;
}

/** GET /api/venue/compliance/types/[id]/versions — version history (newest first). */
export function useComplianceTypeVersions(typeId: string | null) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && !!typeId;

  return useQuery({
    queryKey: [
      ...queryKeys.compliance.all(),
      'typeVersions',
      keyScope(accessToken),
      typeId ?? null,
    ] as const,
    enabled,
    retry: false,
    queryFn: async (): Promise<{ versions: ComplianceTypeVersionRow[] }> => {
      if (!accessToken || !typeId) {
        throw new Error('Missing parameters');
      }
      return apiFetch<{ versions: ComplianceTypeVersionRow[] }>(
        `/api/venue/compliance/types/${typeId}/versions`,
        { accessToken },
      );
    },
  });
}

/** POST /api/venue/compliance/types/[id]/versions/restore — re-publish a prior version (admin). */
export function useRestoreComplianceVersion() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { typeId: string; versionId: string }): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>(
        `/api/venue/compliance/types/${input.typeId}/versions/restore`,
        { accessToken, method: 'POST', body: JSON.stringify({ version_id: input.versionId }) },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    },
  });
}

/** POST /api/venue/compliance/types/[id]/duplicate — copy a type into "{name} (copy)" (admin). */
export function useDuplicateComplianceType() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (typeId: string): Promise<ComplianceTemplateDetail> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<ComplianceTemplateDetail>(
        `/api/venue/compliance/types/${typeId}/duplicate`,
        { accessToken, method: 'POST' },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    },
  });
}

/** POST /api/venue/compliance/types/[id]/archive — soft-archive a type, writing archived_at + audit (admin). */
export function useArchiveComplianceType() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (typeId: string): Promise<{ type: ComplianceTemplateRow }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ type: ComplianceTemplateRow }>(
        `/api/venue/compliance/types/${typeId}/archive`,
        { accessToken, method: 'POST' },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    },
  });
}

/** POST /api/venue/compliance/types/[id]/restore — restore an archived type, clearing archived_at + audit (admin). */
export function useRestoreComplianceType() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (typeId: string): Promise<{ type: ComplianceTemplateRow }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ type: ComplianceTemplateRow }>(
        `/api/venue/compliance/types/${typeId}/restore`,
        { accessToken, method: 'POST' },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    },
  });
}

// ---------------------------------------------------------------------------
// Template library + clone (admin)
// ---------------------------------------------------------------------------

/** GET /api/venue/compliance/library — built-in starter templates (any staff). */
export function useComplianceLibrary(enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: complianceTemplateKeys.library(accessToken),
    enabled: queryEnabled,
    retry: false,
    staleTime: 30 * 60_000, // library is static
    queryFn: async (): Promise<{ templates: ComplianceLibraryTemplate[] }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ templates: ComplianceLibraryTemplate[] }>(
        '/api/venue/compliance/library',
        { accessToken },
      );
    },
  });
}

/**
 * POST /api/venue/compliance/library/[slug]/clone — clone a library template
 * into the venue (admin), creating a ready-to-use type. Invalidates the
 * compliance query keys so the templates list refreshes immediately.
 */
export function useCloneComplianceTemplate() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (slug: string): Promise<ComplianceTemplateDetail> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<ComplianceTemplateDetail>(
        `/api/venue/compliance/library/${encodeURIComponent(slug)}/clone`,
        { accessToken, method: 'POST' },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.compliance.all() });
    },
  });
}
