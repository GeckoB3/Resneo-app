/**
 * Checkout settings against the web's routes: the gate (no request with POS off), a save sends only
 * the section's keys at the loaded version, a 412 reloads and answers stale, and the server's
 * sentence and field errors come back word for word.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();
let mockResolved: Record<string, boolean> | undefined = { pos_enabled: true };

jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  isBackendConfigured: () => true,
}));
jest.mock('@/lib/queries/useVenue', () => ({
  useVenue: () => ({ data: mockResolved ? { feature_flags: { raw: {}, resolved: mockResolved } } : undefined }),
}));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { ApiError } from '@/lib/api/client';
import {
  settingsPaths,
  useCheckoutSettingsQuery,
  useSaveCheckoutSettings,
  useSettingsWrite,
} from '@/lib/queries/useCheckoutSettings';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, wrapper: Wrapper };
}

function response(version: number, extra: Record<string, unknown> = {}) {
  return {
    settings: { version, receipt_prefix: null, ...extra },
    staff_capability_map: {},
    capability_defaults: {},
    can: { is_admin: true, manage_settings: true, edit_capabilities: true },
    venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockResolved = { pos_enabled: true };
});

it('makes no request when Checkout is off', async () => {
  mockResolved = { pos_enabled: false };
  const { wrapper } = setup();
  await renderHook(() => useCheckoutSettingsQuery(), { wrapper });
  expect(mockApiFetch).not.toHaveBeenCalled();
});

it('saves only the given keys at the loaded version, with Bearer', async () => {
  mockApiFetch.mockResolvedValueOnce(response(4));
  const { wrapper } = setup();
  const { result } = await renderHook(() => ({ q: useCheckoutSettingsQuery(), save: useSaveCheckoutSettings() }), { wrapper });
  await waitFor(() => expect(result.current.q.data?.settings.version).toBe(4));

  mockApiFetch.mockResolvedValueOnce(response(5, { receipt_prefix: 'R-' }));
  let out: unknown;
  await act(async () => {
    out = await result.current.save({ receipt_prefix: 'R-' });
  });
  expect(out).toEqual({ ok: true });
  const [path, init] = mockApiFetch.mock.calls[1];
  expect(path).toBe(settingsPaths.settings);
  expect(init.method).toBe('PATCH');
  expect(init.accessToken).toBe('token-A');
  expect(JSON.parse(init.body)).toEqual({ receipt_prefix: 'R-', version: 4 });
  await waitFor(() => expect(result.current.q.data?.settings.version).toBe(5));
});

it('reloads on a 412 and answers stale', async () => {
  mockApiFetch.mockResolvedValueOnce(response(4));
  const { wrapper } = setup();
  const { result } = await renderHook(() => ({ q: useCheckoutSettingsQuery(), save: useSaveCheckoutSettings() }), { wrapper });
  await waitFor(() => expect(result.current.q.data).toBeDefined());

  mockApiFetch.mockRejectedValueOnce(new ApiError('stale', 412, { error: 'stale', code: 'POS_SETTINGS_STALE' }));
  mockApiFetch.mockResolvedValueOnce(response(6));
  let out: { ok: boolean; stale?: boolean; message?: string } | undefined;
  await act(async () => {
    out = (await result.current.save({ receipt_prefix: 'R-' })) as typeof out;
  });
  expect(out).toMatchObject({ ok: false, stale: true });
  expect(out?.message).toContain('Someone else changed these settings');
  await waitFor(() => expect(result.current.q.data?.settings.version).toBe(6));
});

it('answers the server sentence and field errors word for word', async () => {
  const { wrapper } = setup();
  const { result } = await renderHook(() => useSettingsWrite(), { wrapper });
  mockApiFetch.mockRejectedValueOnce(
    new ApiError('x', 409, { error: "Close this till's session before you stop using it.", code: 'CONFLICT', fields: [{ path: 'is_active', message: 'x' }] }),
  );
  let out: unknown;
  await act(async () => {
    out = await result.current(settingsPaths.till('t1'), 'PATCH', { is_active: false, version: 2 });
  });
  expect(out).toEqual({
    ok: false,
    stale: false,
    status: 409,
    message: "Close this till's session before you stop using it.",
    fields: [{ path: 'is_active', message: 'x' }],
  });
  expect(JSON.parse(mockApiFetch.mock.calls[0][1].body)).toEqual({ is_active: false, version: 2 });
});

it('puts a delete version in the query', () => {
  expect(settingsPaths.withVersion(settingsPaths.paymentType('p 1'), 3)).toBe('/api/venue/pos/payment-types/p%201?version=3');
});
