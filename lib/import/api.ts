/**
 * The data import routes (`/api/import/sessions/**` on the web), with the staff member's
 * Bearer token. Admin only on the server. The AI and import calls are slow, so each has the
 * timeout the web's own requests allow (Docs/MOBILE_API.md, "Data import wizard over Bearer").
 */
import { useMemo } from 'react';

import { ApiError, apiFetch, getApiErrorMessage, isApiErrorBody, refreshExpiredAccessToken } from '@/lib/api/client';
import { formDataFile } from '@/lib/api/form-data-file';
import { getApiUrl } from '@/lib/env';
import { EXECUTE_TIMEOUT_MS } from '@/lib/import/progress';
import type {
  BulkCreateResult,
  ExecuteResult,
  ExtractResult,
  ImportPlan,
  ImportProgress,
  MappingRow,
  QaReport,
  ReferenceCatalog,
  ReferenceDefault,
  ReshapeResult,
  RowPreview,
  SessionDetail,
  UploadResult,
  ValidationJob,
} from '@/lib/import/types';
import { currentAccessToken, useAccessToken } from '@/lib/queries/useAccessToken';

const BASE = '/api/import/sessions';
const enc = encodeURIComponent;

/** A minute or two: the AI mapping and reference stages. */
const AI_TIMEOUT_MS = 150_000;
/** The reshape can run for the server's full 300 seconds. */
const RESHAPE_TIMEOUT_MS = 300_000;
/** Uploads and the background starts. */
const SLOW_TIMEOUT_MS = 120_000;

/**
 * The sentence to show for a failed call. The import routes put the readable sentence in
 * `message` beside a terse `error` (the web prefers `message`), so this does too.
 */
export function importErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body as { message?: unknown } | undefined;
    if (body && typeof body.message === 'string' && body.message.trim()) return body.message;
    return error.message || fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

/** The `code` of a refused import call, when it carries one. */
export function importErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const code = (error.body as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : null;
}

function json(method: string, body?: unknown): RequestInit {
  return { method, body: body === undefined ? undefined : JSON.stringify(body) };
}

/**
 * The routes, with the token read at call time: a token refreshed mid-step is picked up without
 * the screen seeing a new object (which would re-run its load and drop unsaved edits).
 */
export function createImportApi(token: string | null | (() => string | null)) {
  const current = () => (typeof token === 'function' ? token() : token);
  const call = <T>(path: string, init: RequestInit & { timeoutMs?: number } = {}) =>
    apiFetch<T>(path, { accessToken: current(), ...init });

  return {
    getSession: (id: string) => call<SessionDetail>(`${BASE}/${enc(id)}`),
    patchSettings: (id: string, settings: Record<string, unknown>) =>
      call<{ session?: unknown }>(`${BASE}/${enc(id)}`, json('PATCH', { session_settings: settings })),

    uploadFile: (id: string, file: { uri: string; name: string; mimeType: string }) => {
      const fd = new FormData();
      fd.append('file', formDataFile(file.uri, file.name, file.mimeType));
      fd.append('file_type', 'unknown');
      return call<UploadResult>(`${BASE}/${enc(id)}/files`, { method: 'POST', body: fd, timeoutMs: SLOW_TIMEOUT_MS });
    },
    setFileType: (id: string, fileId: string, fileType: string) =>
      call<{ ok: boolean }>(`${BASE}/${enc(id)}/files/${enc(fileId)}`, json('PATCH', { file_type: fileType })),
    removeFile: (id: string, fileId: string) =>
      call<{ ok: boolean }>(`${BASE}/${enc(id)}/files/${enc(fileId)}`, { method: 'DELETE' }),
    reshapeFile: (id: string, fileId: string) =>
      call<ReshapeResult>(`${BASE}/${enc(id)}/files/${enc(fileId)}/reshape`, { method: 'POST', timeoutMs: RESHAPE_TIMEOUT_MS }),
    undoReshape: (id: string, fileId: string) =>
      call<{ ok: boolean }>(`${BASE}/${enc(id)}/files/${enc(fileId)}/reshape`, { method: 'DELETE', timeoutMs: SLOW_TIMEOUT_MS }),
    getRow: (id: string, fileId: string, row: number) =>
      call<RowPreview>(`${BASE}/${enc(id)}/files/${enc(fileId)}/row?row=${row}`),

    aiMapFile: (id: string, fileId: string, mode?: 'fill') =>
      call<{ ok?: boolean; message?: string }>(
        `${BASE}/${enc(id)}/files/${enc(fileId)}/ai-map${mode ? `?mode=${mode}` : ''}`,
        { method: 'POST', timeoutMs: AI_TIMEOUT_MS },
      ),
    saveMappings: (id: string, mappings: MappingRow[]) =>
      call<{ ok: boolean }>(`${BASE}/${enc(id)}/mappings/bulk`, json('POST', { mappings })),
    updateMapping: (id: string, mappingId: string, patch: Record<string, unknown>) =>
      call<{ ok: boolean }>(`${BASE}/${enc(id)}/mappings/${enc(mappingId)}`, json('PUT', patch)),

    extractReferences: (id: string) =>
      call<ExtractResult>(`${BASE}/${enc(id)}/extract-references`, { method: 'POST', timeoutMs: SLOW_TIMEOUT_MS }),
    aiMapReferences: (id: string) =>
      call<{ ok?: boolean }>(`${BASE}/${enc(id)}/ai-map-references`, { method: 'POST', timeoutMs: AI_TIMEOUT_MS }),
    referenceCatalog: (id: string) => call<ReferenceCatalog>(`${BASE}/${enc(id)}/reference-catalog`),
    referenceDefaults: (id: string) => call<{ suggestions?: ReferenceDefault[] }>(`${BASE}/${enc(id)}/reference-defaults`),
    resolveReference: (id: string, referenceId: string, body: Record<string, unknown>) =>
      call<{ ok: boolean }>(`${BASE}/${enc(id)}/references/${enc(referenceId)}`, json('PATCH', body)),
    bulkReferences: (id: string, operations: Record<string, unknown>[]) =>
      call<BulkCreateResult>(`${BASE}/${enc(id)}/references/bulk`, { ...json('POST', { operations }), timeoutMs: SLOW_TIMEOUT_MS }),
    confirmTableUnassigned: (id: string) =>
      call<{ ok: boolean }>(`${BASE}/${enc(id)}/confirm-table-unassigned`, { method: 'POST' }),

    startValidation: (id: string, settings?: Record<string, unknown>) =>
      call<{ jobId?: string; message?: string }>(`${BASE}/${enc(id)}/validate`, {
        ...json('POST', settings ? { session_settings: settings } : {}),
        timeoutMs: SLOW_TIMEOUT_MS,
      }),
    validationJob: (id: string) => call<ValidationJob>(`${BASE}/${enc(id)}/validate`),
    decideIssue: (id: string, issueId: string, decision: string) =>
      call<{ ok: boolean }>(`${BASE}/${enc(id)}/issues/${enc(issueId)}`, json('PATCH', { user_decision: decision })),
    decideIssueType: (id: string, issueType: string, decision: string) =>
      call<{ ok: boolean }>(`${BASE}/${enc(id)}/issues/bulk-decide`, json('PATCH', { issue_type: issueType, user_decision: decision })),
    plan: (id: string) => call<ImportPlan>(`${BASE}/${enc(id)}/plan`, { timeoutMs: AI_TIMEOUT_MS }),

    approve: (id: string) =>
      call<ExecuteResult>(`${BASE}/${enc(id)}/execute`, { ...json('POST', { approve: true }), timeoutMs: EXECUTE_TIMEOUT_MS }),
    executeBatch: (id: string) =>
      call<ExecuteResult>(`${BASE}/${enc(id)}/execute`, { ...json('POST', {}), timeoutMs: EXECUTE_TIMEOUT_MS }),
    progress: (id: string) => call<ImportProgress>(`${BASE}/${enc(id)}/progress`),
    qa: (id: string) => call<{ report?: QaReport }>(`${BASE}/${enc(id)}/qa`, { method: 'POST', timeoutMs: AI_TIMEOUT_MS }),

    /** The import report, as CSV text (the route answers `text/csv`, not JSON). */
    reportCsv: (id: string) => fetchReportCsv(current(), id),
  };
}

export type ImportApi = ReturnType<typeof createImportApi>;

/** The import routes with the signed-in staff member's token. Stable for the screen's life. */
export function useImportApi(): ImportApi {
  // Subscribing keeps the shared token cache current while the screen is open.
  useAccessToken();
  return useMemo(() => createImportApi(currentAccessToken), []);
}

async function fetchReportCsv(accessToken: string | null, sessionId: string): Promise<string> {
  const url = `${getApiUrl()}${BASE}/${enc(sessionId)}/report`;
  const attempt = async (token: string | null) => {
    let res: Response;
    try {
      res = await fetch(url, { headers: { Accept: 'text/csv', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    } catch {
      throw new ApiError('Network request failed. Check your connection and try again.', 0);
    }
    const text = await res.text();
    if (!res.ok) {
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      throw new ApiError(isApiErrorBody(body) ? getApiErrorMessage(body, res.status) : `Request failed (${res.status})`, res.status, body);
    }
    return text;
  };
  try {
    return await attempt(accessToken);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && accessToken) {
      const fresh = await refreshExpiredAccessToken(accessToken);
      if (fresh) return attempt(fresh);
    }
    throw e;
  }
}
