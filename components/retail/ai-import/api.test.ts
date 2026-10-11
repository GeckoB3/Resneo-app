/**
 * The products reader's route over Bearer: one source per POST with the POS headers, an expired
 * token refreshed once, the server's own sentence for a refusal, plain advice for a refusal from in
 * front of the route (a page, not JSON), and the way in offered only when the GET says `enabled`.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  getApiUrl: () => 'https://api.test',
}));
const mockRefresh = jest.fn();
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client'),
  refreshExpiredAccessToken: (...args: unknown[]) => mockRefresh(...args),
}));
let mockGate = { accessToken: 'token-A' as string | null, enabled: true };
jest.mock('@/lib/queries/usePos', () => ({
  usePosGate: (extra: boolean) => ({ ...mockGate, enabled: mockGate.enabled && extra }),
}));
const mockPosFetch = jest.fn();
jest.mock('@/lib/pos/api', () => ({
  ...jest.requireActual<typeof import('@/lib/pos/api')>('@/lib/pos/api'),
  posFetch: (...args: unknown[]) => mockPosFetch(...args),
}));

import { PRODUCTS_AI_PATH, readProductsAi, useProductsAiAvailability } from './api';

const mockFetch = jest.fn();
const realFetch = globalThis.fetch;

function reply(status: number, body: unknown, asText = false) {
  return {
    status,
    text: async () => (asText ? String(body) : JSON.stringify(body)),
  };
}

const answer = {
  drafts: [
    {
      key: 'd1',
      name: 'Repair Shampoo',
      brand: null,
      category: 'Hair care',
      options: [{ name: '250 ml', price_pence: 1850, cost_pence: null, barcode: null }],
      usage: 'retail',
      level: 'ready',
      notes: [],
      duplicate_of: null,
    },
  ],
  notes: [],
};

beforeEach(() => {
  mockFetch.mockReset();
  mockRefresh.mockReset();
  mockPosFetch.mockReset();
  mockGate = { accessToken: 'token-A', enabled: true };
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe('readProductsAi', () => {
  it('posts one source as JSON with the token and the POS headers, and reads the drafts', async () => {
    mockFetch.mockResolvedValue(reply(200, answer));
    const out = await readProductsAi({ kind: 'text', text: 'Repair Shampoo 250 ml 18.50' }, 'token-A');
    expect(out.ok && out.data.drafts[0]!.name).toBe('Repair Shampoo');
    const [url, init] = mockFetch.mock.calls[0]! as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe(`https://api.test${PRODUCTS_AI_PATH}`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ kind: 'text', text: 'Repair Shampoo 250 ml 18.50' });
    expect(init.headers.Authorization).toBe('Bearer token-A');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['X-ResNeo-Client']).toBeTruthy();
  });

  it('refreshes an expired token once', async () => {
    mockFetch.mockResolvedValueOnce(reply(401, { error: 'Unauthorised' })).mockResolvedValueOnce(reply(200, answer));
    mockRefresh.mockResolvedValue('token-B');
    const out = await readProductsAi({ kind: 'link', url: 'https://shop.example.com/' }, 'token-A');
    expect(out.ok).toBe(true);
    expect(mockRefresh).toHaveBeenCalledWith('token-A');
    expect((mockFetch.mock.calls[1]![1] as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer token-B');
  });

  it("shows the server's own sentence for a refusal", async () => {
    // Refusals are `{ error, code, reason }`.
    mockFetch.mockResolvedValue(
      reply(429, { error: "You've read a lot in a short time. Please wait 5 minutes and try again.", code: 'RATE_LIMITED', reason: 'rate_limited' }),
    );
    expect(await readProductsAi({ kind: 'text', text: 'x' }, 'token-A')).toEqual({
      ok: false,
      error: "You've read a lot in a short time. Please wait 5 minutes and try again.",
      status: 429,
    });
  });

  it('gives plain advice for a refusal that came back as a page, and for no signal', async () => {
    mockFetch.mockResolvedValue(reply(413, '<html>Request Entity Too Large</html>', true));
    expect(await readProductsAi({ kind: 'images', images: ['data:image/jpeg;base64,AAAA'] }, 'token-A')).toEqual({
      ok: false,
      error: "That's too big to send. Try fewer photos at a time, or a smaller file.",
      status: 413,
    });
    mockFetch.mockResolvedValue(reply(504, 'Gateway Timeout', true));
    expect(await readProductsAi({ kind: 'text', text: 'x' }, 'token-A')).toEqual({
      ok: false,
      error: 'That took too long to read. Try a shorter list, or fewer photos at a time.',
      status: 504,
    });
    mockFetch.mockRejectedValue(new Error('Network request failed'));
    expect(await readProductsAi({ kind: 'text', text: 'x' }, 'token-A')).toEqual({
      ok: false,
      error: "We couldn't reach ResNeo. Check your connection and try again.",
      status: 0,
    });
  });

  it('refuses an answer that is not one', async () => {
    mockFetch.mockResolvedValue(reply(200, { ok: true }));
    expect(await readProductsAi({ kind: 'text', text: 'x' }, 'token-A')).toEqual({
      ok: false,
      error: "We couldn't read that just now. Please try again.",
      status: 200,
    });
  });
});

describe('useProductsAiAvailability', () => {
  function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    return createElement(QueryClientProvider, { client }, children);
  }

  it('offers the way in only when the server says enabled', async () => {
    mockPosFetch.mockResolvedValue({ enabled: true });
    const on = await renderHook(() => useProductsAiAvailability(), { wrapper });
    await waitFor(() => expect(on.result.current.offered).toBe(true));
    expect(mockPosFetch).toHaveBeenCalledWith(PRODUCTS_AI_PATH, { accessToken: 'token-A' });

    mockPosFetch.mockResolvedValue({ enabled: false });
    const off = await renderHook(() => useProductsAiAvailability(), { wrapper });
    await waitFor(() => expect(off.result.current.loading).toBe(false));
    expect(off.result.current.offered).toBe(false);
  });

  it('hides it for a server before the route, and asks nothing when not allowed', async () => {
    mockPosFetch.mockRejectedValue(new Error('Request failed (404)'));
    const missing = await renderHook(() => useProductsAiAvailability(), { wrapper });
    await waitFor(() => expect(missing.result.current.loading).toBe(false));
    expect(missing.result.current.offered).toBe(false);

    mockPosFetch.mockReset();
    const notAllowed = await renderHook(() => useProductsAiAvailability({ enabled: false }), { wrapper });
    expect(notAllowed.result.current).toEqual({ offered: false, loading: false });
    expect(mockPosFetch).not.toHaveBeenCalled();
  });
});
