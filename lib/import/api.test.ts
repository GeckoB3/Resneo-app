/**
 * The import wizard's calls: each goes to the web's `/api/import/sessions/**` route with the
 * Bearer token read at call time, the slow ones with the timeout the web allows, the upload as
 * multipart through `formDataFile`, and the report as CSV text with one refresh-and-retry on a
 * 401. Failures read the route's `message` sentence first, as the dashboard does.
 */
const mockApiFetch = jest.fn();
const mockRefresh = jest.fn();
let mockToken: string | null = 'token-A';

jest.mock('@/lib/env', () => ({ getApiUrl: () => 'https://api.example.com', isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({
  useAccessToken: () => mockToken,
  currentAccessToken: () => mockToken,
}));
jest.mock('@/lib/api/form-data-file', () => ({
  formDataFile: (uri: string, name: string, type: string) => ({ uri, name, type, marker: 'part' }),
}));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual('@/lib/api/client');
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
    refreshExpiredAccessToken: (...args: unknown[]) => mockRefresh(...args),
  };
});

import { ApiError } from '@/lib/api/client';
import { createImportApi, importErrorCode, importErrorMessage } from '@/lib/import/api';
import { currentAccessToken } from '@/lib/queries/useAccessToken';

beforeEach(() => {
  mockApiFetch.mockReset().mockResolvedValue({ ok: true });
  mockRefresh.mockReset();
  mockToken = 'token-A';
});

function lastCall() {
  const [path, opts] = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1] as [string, Record<string, unknown>];
  return { path, opts };
}

describe('import API', () => {
  it('reads the token at call time, so a refreshed token is used without a new object', async () => {
    const api = createImportApi(currentAccessToken);
    await api.getSession('s 1');
    expect(lastCall()).toEqual({ path: '/api/import/sessions/s%201', opts: expect.objectContaining({ accessToken: 'token-A' }) });
    mockToken = 'token-B';
    await api.progress('s1');
    expect(lastCall().opts.accessToken).toBe('token-B');
  });

  it('calls each route with its method and body', async () => {
    const api = createImportApi('t');
    await api.setFileType('s1', 'f1', 'bookings');
    expect(lastCall()).toEqual({
      path: '/api/import/sessions/s1/files/f1',
      opts: expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ file_type: 'bookings' }) }),
    });
    await api.aiMapFile('s1', 'f1', 'fill');
    expect(lastCall().path).toBe('/api/import/sessions/s1/files/f1/ai-map?mode=fill');
    expect(lastCall().opts.timeoutMs).toBeGreaterThanOrEqual(120_000);
    await api.saveMappings('s1', []);
    expect(lastCall()).toEqual({ path: '/api/import/sessions/s1/mappings/bulk', opts: expect.objectContaining({ method: 'POST', body: '{"mappings":[]}' }) });
    await api.decideIssueType('s1', 'existing_client', 'skip');
    expect(lastCall().opts.body).toBe(JSON.stringify({ issue_type: 'existing_client', user_decision: 'skip' }));
    await api.startValidation('s1', { ambiguous_date_format: 'dd/MM/yyyy' });
    expect(lastCall().opts.body).toBe(JSON.stringify({ session_settings: { ambiguous_date_format: 'dd/MM/yyyy' } }));
    await api.approve('s1');
    expect(lastCall()).toEqual({
      path: '/api/import/sessions/s1/execute',
      opts: expect.objectContaining({ method: 'POST', body: '{"approve":true}', timeoutMs: 280_000 }),
    });
    await api.executeBatch('s1');
    expect(lastCall().opts.body).toBe('{}');
    await api.reshapeFile('s1', 'f1');
    expect(lastCall().opts.timeoutMs).toBe(300_000);
  });

  it('uploads one file as multipart with the type left for the server to detect', async () => {
    class RecordingFormData {
      parts: [string, unknown][] = [];
      append(key: string, value: unknown) {
        this.parts.push([key, value]);
      }
    }
    const original = globalThis.FormData;
    globalThis.FormData = RecordingFormData as unknown as typeof FormData;
    try {
      const api = createImportApi('t');
      await api.uploadFile('s1', { uri: 'file:///c.csv', name: 'c.csv', mimeType: 'text/csv' });
      const { path, opts } = lastCall();
      expect(path).toBe('/api/import/sessions/s1/files');
      expect(opts.method).toBe('POST');
      expect((opts.body as unknown as RecordingFormData).parts).toEqual([
        ['file', { uri: 'file:///c.csv', name: 'c.csv', type: 'text/csv', marker: 'part' }],
        ['file_type', 'unknown'],
      ]);
    } finally {
      globalThis.FormData = original;
    }
  });

  it('fetches the report as CSV text, refreshing once on a 401', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => '{"error":"Unauthorised"}' })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'a,b\r\n1,2' });
    const original = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    mockRefresh.mockResolvedValue('token-fresh');
    try {
      const csv = await createImportApi('token-old').reportCsv('s1');
      expect(csv).toBe('a,b\r\n1,2');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/api/import/sessions/s1/report');
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer token-fresh');
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('import errors', () => {
  it("prefers the route's sentence, then the error, then the fallback", () => {
    const withMessage = new ApiError('Import already started', 409, {
      error: 'Import already started',
      message: 'This import is already running, so it cannot be checked again.',
      code: 'IMPORT_ALREADY_STARTED',
    });
    expect(importErrorMessage(withMessage, 'x')).toBe('This import is already running, so it cannot be checked again.');
    expect(importErrorCode(withMessage)).toBe('IMPORT_ALREADY_STARTED');
    expect(importErrorMessage(new ApiError('Not found', 404, { error: 'Not found' }), 'x')).toBe('Not found');
    expect(importErrorMessage('nope', 'Fallback')).toBe('Fallback');
    expect(importErrorCode(new Error('x'))).toBeNull();
  });
});
