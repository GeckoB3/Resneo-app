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
