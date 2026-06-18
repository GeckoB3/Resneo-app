/**
 * Mock-mutation tests for the compliance template-management hooks. We stub only
 * the network call (`apiFetch`) and assert each hook hits the right path/method
 * with the right body — the routes are Bearer-capable on the web, so these pin
 * the app's request contract against `C:\Resneo/src/app/api/venue/compliance`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockToken = 'token-A';
const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => mockToken }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import type { ComplianceFormSchema } from '@/lib/compliance/form-schema';
import {
  useCloneComplianceTemplate,
  useComplianceLibrary,
  useComplianceTemplatesList,
  useCreateComplianceTemplate,
  useCreateComplianceVersion,
} from '@/lib/queries/useComplianceTypeManage';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const schema: ComplianceFormSchema = {
  schema_version: '1.0',
  title: 'PPD',
  fields: [{ id: 'name', type: 'text', label: 'Name', required: false, staff_only: false }],
};

beforeEach(() => mockApiFetch.mockReset());

describe('useComplianceTemplatesList', () => {
  it('GETs the include_archived list by default', async () => {
    mockApiFetch.mockResolvedValueOnce({ types: [] });
    const { result } = await renderHook(() => useComplianceTemplatesList(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/venue/compliance/types?include_archived=true',
      { accessToken: mockToken },
    );
  });

  it('omits the query param when include_archived is false', async () => {
    mockApiFetch.mockResolvedValueOnce({ types: [] });
    const { result } = await renderHook(() => useComplianceTemplatesList(false), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiFetch.mock.calls[0]![0]).toBe('/api/venue/compliance/types');
  });
});

describe('useCreateComplianceTemplate', () => {
  it('POSTs the full create payload to /types', async () => {
    mockApiFetch.mockResolvedValueOnce({ type: { id: 't1' }, version: { id: 'v1', version_number: 1 } });
    const { result } = await renderHook(() => useCreateComplianceTemplate(), {
      wrapper: makeWrapper(),
    });
    await result.current.mutateAsync({
      name: 'PPD',
      category: 'test',
      description: null,
      result_type: 'completed',
      validity_period_days: 180,
      capture_methods: ['staff_in_venue'],
      form_link_expiry_days: null,
      form_schema: schema,
    });
    const [path, opts] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/venue/compliance/types');
    expect((opts as { method: string }).method).toBe('POST');
    const body = JSON.parse((opts as { body: string }).body);
    expect(body.name).toBe('PPD');
    expect(body.result_type).toBe('completed');
    expect(body.form_schema.fields).toHaveLength(1);
  });
});

describe('useCreateComplianceVersion', () => {
  it('POSTs the form_schema to /types/[id]/versions', async () => {
    mockApiFetch.mockResolvedValueOnce({ versionId: 'v2', versionNumber: 2 });
    const { result } = await renderHook(() => useCreateComplianceVersion(), {
      wrapper: makeWrapper(),
    });
    await result.current.mutateAsync({ typeId: 't1', formSchema: schema, changelog: 'tweak' });
    const [path, opts] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/venue/compliance/types/t1/versions');
    expect((opts as { method: string }).method).toBe('POST');
    const body = JSON.parse((opts as { body: string }).body);
    expect(body.form_schema.title).toBe('PPD');
    expect(body.changelog).toBe('tweak');
  });
});

describe('useComplianceLibrary', () => {
  it('GETs /library when enabled', async () => {
    mockApiFetch.mockResolvedValueOnce({ templates: [] });
    const { result } = await renderHook(() => useComplianceLibrary(true), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiFetch).toHaveBeenCalledWith('/api/venue/compliance/library', {
      accessToken: mockToken,
    });
  });

  it('does not fetch when disabled', async () => {
    const { result } = await renderHook(() => useComplianceLibrary(false), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe('useCloneComplianceTemplate', () => {
  it('POSTs to /library/[slug]/clone (slug url-encoded)', async () => {
    mockApiFetch.mockResolvedValueOnce({ type: { id: 't9' }, version: null });
    const { result } = await renderHook(() => useCloneComplianceTemplate(), {
      wrapper: makeWrapper(),
    });
    await result.current.mutateAsync('lib-ppd-patch-test-v1');
    const [path, opts] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/venue/compliance/library/lib-ppd-patch-test-v1/clone');
    expect((opts as { method: string }).method).toBe('POST');
  });
});
