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
  isVenueWideRequirement,
  useAddComplianceRequirement,
  useComplianceRequirementCounts,
  useComplianceRequirements,
  useDeleteComplianceRequirement,
  useUpdateComplianceRequirement,
  useVenueWideComplianceRequirements,
  useVenueWideRequirementNames,
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
  it('makes ONE venue-wide GET and groups counts by service FK (web 2026-07 contract)', async () => {
    mockApiFetch.mockResolvedValue({
      requirements: [
        { id: 'r1', appointment_service_id: 'svc-1', service_item_id: null },
        { id: 'r2', appointment_service_id: 'svc-1', service_item_id: null },
        // Service-item venues carry the other FK column; both group the same way.
        { id: 'r3', appointment_service_id: null, service_item_id: 'svc-3' },
        // A service not in the requested list is ignored.
        { id: 'r4', appointment_service_id: 'svc-other', service_item_id: null },
        // A venue-wide row (web 2026-09-01) applies to every service and is
        // counted on its own pinned row, never against a service.
        { id: 'r5', scope: 'venue', appointment_service_id: null, service_item_id: null },
      ],
    });
    const { result } = await renderHook(
      () => useComplianceRequirementCounts(['svc-1', 'svc-2', 'svc-3']),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.size).toBe(3));
    expect(result.current.get('svc-1')).toBe(2);
    expect(result.current.get('svc-2')).toBe(0);
    expect(result.current.get('svc-3')).toBe(1);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/venue/compliance/requirements', {
      accessToken: mockToken,
    });
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

describe('venue-wide requirements (web 2026-09-01)', () => {
  it('recognises a venue row by scope, or by having no service FK on an older server', () => {
    expect(isVenueWideRequirement({ scope: 'venue', appointment_service_id: null, service_item_id: null })).toBe(true);
    expect(isVenueWideRequirement({ appointment_service_id: null, service_item_id: null })).toBe(true);
    expect(isVenueWideRequirement({ scope: 'service', appointment_service_id: 'svc-1', service_item_id: null })).toBe(false);
    expect(isVenueWideRequirement({ appointment_service_id: null, service_item_id: 'svc-3' })).toBe(false);
  });

  it('GETs ?scope=venue for the All bookings row', async () => {
    mockApiFetch.mockResolvedValue({ requirements: [] });
    const { result } = await renderHook(() => useVenueWideComplianceRequirements(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiFetch).toHaveBeenCalledWith('/api/venue/compliance/requirements?scope=venue', {
      accessToken: mockToken,
    });
  });

  it('names the venue-wide types once each, from the one venue-wide fetch', async () => {
    mockApiFetch.mockResolvedValue({
      requirements: [
        { id: 'r1', scope: 'venue', appointment_service_id: null, service_item_id: null, compliance_type_name: 'Intake form' },
        { id: 'r2', scope: 'service', appointment_service_id: 'svc-1', service_item_id: null, compliance_type_name: 'Patch test' },
        { id: 'r3', scope: 'venue', appointment_service_id: null, service_item_id: null, compliance_type_name: 'Intake form' },
      ],
    });
    const { result } = await renderHook(() => useVenueWideRequirementNames(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current).toEqual(['Intake form']));
    expect(mockApiFetch).toHaveBeenCalledWith('/api/venue/compliance/requirements', {
      accessToken: mockToken,
    });
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

  it('POSTs scope: venue with no service for an all-bookings requirement', async () => {
    mockApiFetch.mockResolvedValueOnce({ requirement: { id: 'r1' } });
    const { result } = await renderHook(() => useAddComplianceRequirement(), {
      wrapper: makeWrapper(),
    });
    await result.current.mutateAsync({
      scope: 'venue',
      compliance_type_id: 'type-1',
      enforcement: 'block_all',
    });
    const [, opts] = mockApiFetch.mock.calls[0]!;
    expect(JSON.parse((opts as { body: string }).body)).toEqual({
      scope: 'venue',
      compliance_type_id: 'type-1',
      enforcement: 'block_all',
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
