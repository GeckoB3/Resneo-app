/**
 * A shared client's screen (web plan §1A.2 step 5, mockup board 5): "Also a client of", Across the
 * collective, and "Not the same person" on the venue's own record.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View: MockView } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(MockView, null, children) : null,
  };
});
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn(), show: jest.fn(), dismiss: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
let mockShared: Record<string, unknown> = {};
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: (path: string, options: { method?: string; body?: string } = {}) => {
    const method = options.method ?? 'GET';
    mockCalls.push({ path, method, body: options.body ? JSON.parse(options.body) : undefined });
    return Promise.resolve(method === 'POST' ? { ok: true } : mockShared);
  },
}));

import { clientSharingCopy } from '@/lib/collective-area/client-sharing-copy';
import { AcrossTheCollectiveCard, SharedClientLine, sharedClientLine } from './SharedClientSection';

async function renderBoth() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <SharedClientLine guestId="g1" />
        <AcrossTheCollectiveCard guestId="g1" />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  mockCalls.length = 0;
  Object.values(mockToast).forEach((f) => f.mockReset());
  mockShared = {
    alsoAt: [{ venueId: 'l16', name: 'Light 16' }],
    across: [
      { venueId: 'l16', name: 'Light 16', visits: 5, lastVisit: '2026-11-03', noShows: 1, services: ['Cut & Finish'] },
    ],
    sharedUntil: null,
    canSeparate: true,
  };
});

describe('a shared client on the app', () => {
  it('says where else they are a client, and what happened there', async () => {
    await renderBoth();
    expect(screen.getByText('Also a client of Light 16')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.contact.across')));
    });
    // The last visit carries its year, as on the web.
    expect(screen.getByText('5 visits · Last visit 3 Nov 2026 · 1 no-show')).toBeTruthy();
    expect(screen.getByText('Had: Cut & Finish')).toBeTruthy();
  });

  it('asks before separating, then separates', async () => {
    await renderBoth();
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.contact.across')));
    });
    await act(async () => {
      fireEvent.press(screen.getAllByText(clientSharingCopy('cs.contact.different'))[0]!);
    });
    expect(mockCalls.some((c) => c.method === 'POST')).toBe(false);
    const confirm = screen.getAllByText(clientSharingCopy('cs.contact.different'));
    await act(async () => {
      fireEvent.press(confirm[confirm.length - 1]!);
    });
    expect(mockCalls.find((c) => c.method === 'POST')).toEqual({
      path: '/api/venue/guests/g1/shared',
      method: 'POST',
      body: { action: 'separate' },
    });
    expect(mockToast.success).toHaveBeenCalledWith(clientSharingCopy('cs.contact.separated'));
  });

  it('reads a copy kept after sharing ended', () => {
    expect(
      sharedClientLine({
        alsoAt: [],
        across: [],
        sharedUntil: { collectiveName: 'Northside', date: '2026-11-14' },
        canSeparate: false,
      }),
    ).toBe('Shared while in Northside until 14 Nov 2026');
  });

  it('says where else they are a client before any copy kept from an earlier collective', () => {
    expect(
      sharedClientLine({
        alsoAt: [{ venueId: 'l16', name: 'Light 16' }],
        across: [],
        sharedUntil: { collectiveName: 'Old Collective', date: '2025-11-12' },
        canSeparate: false,
      }),
    ).toBe('Also a client of Light 16');
  });
});
