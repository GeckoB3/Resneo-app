/**
 * Mock-mutation tests for the per-service compliance requirements hooks. Pins
 * the request contract against C:\Resneo/src/app/api/venue/compliance/requirements.
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

import {
  useAddComplianceRequirement,
  useComplianceRequirementCounts,
  useComplianceRequirements,
  useDeleteComplianceRequirement,
  useUpdateComplianceRequirement,
} from '@/lib/queries/useComplianceRequirements';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => mockApiFetch.mockReset());

describe('useComplianceRequirements', () => {
  it('GETs ?service_id= for the given service', async () => {
    mockApiFetch.mockResolvedValueOnce({ requirements: [] });
    const { result } = await renderHook(() => useComplianceRequirements('svc-1'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/venue/compliance/requirements?service_id=svc-1',
      { accessToken: mockToken },
    );
  });

  it('stays idle without a service id or when disabled', async () => {
    const { result } = await renderHook(() => useComplianceRequirements(null), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe('useComplianceRequirementCounts', () => {
  it('fans out one ?service_id= GET per service and maps ids to counts', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.endsWith('svc-1')) {
        return { requirements: [{ id: 'r1' }, { id: 'r2' }] };
      }
      return { requirements: [] };
    });
    const { result } = await renderHook(
      () => useComplianceRequirementCounts(['svc-1', 'svc-2']),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get('svc-1')).toBe(2);
    expect(result.current.get('svc-2')).toBe(0);
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/venue/compliance/requirements?service_id=svc-1',
      { accessToken: mockToken },
    );
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/venue/compliance/requirements?service_id=svc-2',
      { accessToken: mockToken },
    );
  });

  it('shares the per-service cache with useComplianceRequirements (no double fetch)', async () => {
    mockApiFetch.mockResolvedValue({ requirements: [{ id: 'r1' }] });
    // Non-zero staleTime so the second mount reads the cache without kicking a
    // background refetch — pins that both hooks use the SAME query key.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const counts = await renderHook(() => useComplianceRequirementCounts(['svc-1']), { wrapper });
    await waitFor(() => expect(counts.result.current.get('svc-1')).toBe(1));

    // The single-service editor hook mounts onto the SAME key → served from
    // cache immediately, no new request.
    const single = await renderHook(() => useComplianceRequirements('svc-1'), { wrapper });
    expect(single.result.current.data?.requirements).toHaveLength(1);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('does not fetch when disabled', async () => {
    const { result } = await renderHook(
      () => useComplianceRequirementCounts(['svc-1'], false),
      { wrapper: makeWrapper() },
    );
    expect(result.current.size).toBe(0);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe('useAddComplianceRequirement', () => {
  it('POSTs service_id + compliance_type_id + enforcement', async () => {
    mockApiFetch.mockResolvedValueOnce({ requirement: { id: 'r1' } });
    const { result } = await renderHook(() => useAddComplianceRequirement(), {
      wrapper: makeWrapper(),
    });
    await result.current.mutateAsync({
      service_id: 'svc-1',
      compliance_type_id: 'type-1',
      enforcement: 'block_online',
    });
    const [path, opts] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/venue/compliance/requirements');
    expect((opts as { method: string }).method).toBe('POST');
    expect(JSON.parse((opts as { body: string }).body)).toEqual({
      service_id: 'svc-1',
      compliance_type_id: 'type-1',
      enforcement: 'block_online',
    });
  });
});

describe('useUpdateComplianceRequirement', () => {
  it('PATCHes /requirements/[id] with only the patch fields (id stripped from body)', async () => {
    mockApiFetch.mockResolvedValueOnce({ requirement: { id: 'r1' } });
    const { result } = await renderHook(() => useUpdateComplianceRequirement(), {
      wrapper: makeWrapper(),
    });
    await result.current.mutateAsync({ id: 'r1', enforcement: 'warn_client' });
    const [path, opts] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/venue/compliance/requirements/r1');
    expect((opts as { method: string }).method).toBe('PATCH');
    const body = JSON.parse((opts as { body: string }).body);
    expect(body).toEqual({ enforcement: 'warn_client' });
    expect(body.id).toBeUndefined();
  });
});

describe('useDeleteComplianceRequirement', () => {
  it('DELETEs /requirements/[id]', async () => {
    mockApiFetch.mockResolvedValueOnce({ success: true });
    const { result } = await renderHook(() => useDeleteComplianceRequirement(), {
      wrapper: makeWrapper(),
    });
    await result.current.mutateAsync('r1');
    const [path, opts] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/venue/compliance/requirements/r1');
    expect((opts as { method: string }).method).toBe('DELETE');
  });
});
