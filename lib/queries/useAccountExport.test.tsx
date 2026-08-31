/**
 * C5: handing the customer their own data.
 *
 * The web serves this as a browser download. A phone has nowhere to download
 * to, so the app fetches the same body and offers it to the share sheet, which
 * is the platform's own answer to "save this file".
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();
const mockShare = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...a: unknown[]) => mockApiFetch(...a) };
});
jest.mock('@/lib/share/share-text-file', () => ({
  shareTextFile: (...a: unknown[]) => mockShare(...a),
}));

const {
  useAccountExport,
  exportFilename,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require('./useAccountExport') as typeof import('./useAccountExport');

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockApiFetch.mockReset().mockResolvedValue({ bookings: [{ id: 'bk-1' }] });
  mockShare.mockReset().mockResolvedValue({ ok: true });
});

async function run() {
  const { result } = await renderHook(() => useAccountExport(), { wrapper });
  let outcome;
  await act(async () => {
    outcome = await result.current.mutateAsync();
  });
  return outcome;
}

describe('the export', () => {
  it('fetches the whole account from the versioned path', async () => {
    await run();
    expect(String(mockApiFetch.mock.calls[0][0])).toBe('/api/v1/me/export');
  });

  it('hands the share sheet readable JSON, not a single line', async () => {
    /*
      Re-printed with an indent on purpose. An export nobody can open and read
      is a compliance gesture rather than a right exercised, and this is the
      only chance to make it legible.
    */
    await run();
    const body = String(mockShare.mock.calls[0][0].body);
    expect(body).toContain('\n');
    expect(JSON.parse(body)).toEqual({ bookings: [{ id: 'bk-1' }] });
  });

  it('sends it as JSON, so the receiving app knows what it is', async () => {
    await run();
    expect(mockShare.mock.calls[0][0].mimeType).toBe('application/json');
  });

  it('reports a share failure back rather than swallowing it', async () => {
    mockShare.mockResolvedValue({ ok: false, reason: 'share', message: 'no share sheet' });
    expect(await run()).toEqual({ ok: false, reason: 'share', message: 'no share sheet' });
  });

  it('does NOT fetch until asked', async () => {
    /*
      A mutation rather than a query, deliberately. As a query it would re-run
      on focus and on reconnect, opening a share sheet nobody asked for and
      pulling the customer's whole account over the network each time.
    */
    await renderHook(() => useAccountExport(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe('the filename', () => {
  it('is dated so two exports can be told apart', async () => {
    expect(exportFilename(new Date('2026-09-10T13:45:00.000Z'))).toBe(
      'resneo-account-2026-09-10.json',
    );
  });

  it('carries no slashes or spaces, being a filename rather than a sentence', async () => {
    // An ISO date also sorts correctly in every file browser, which a localised
    // one would not.
    const name = exportFilename(new Date('2026-01-02T00:00:00.000Z'));
    expect(name).not.toMatch(/[/\\\s]/);
  });
});
