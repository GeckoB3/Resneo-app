/**
 * Manage Collective, Clients (web plan §1A.2 step 3, mockup board 1): the twin of the web's tab.
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
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn(), show: jest.fn(), dismiss: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
let mockStatus: Record<string, unknown> = {};
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: (path: string, options: { method?: string; body?: string } = {}) => {
    const method = options.method ?? 'GET';
    mockCalls.push({ path, method, body: options.body ? JSON.parse(options.body) : undefined });
    if (path.endsWith('/ask')) return Promise.resolve({ ok: true, asked: 2 });
    if (path.endsWith('/stop')) return Promise.resolve({ ...mockStatus, kept: 12 });
    return Promise.resolve(mockStatus);
  },
}));

import { clientSharingCopy } from '@/lib/collective-area/client-sharing-copy';
import { ClientsPanel } from './ClientsPanel';

function status(over: Record<string, unknown> = {}) {
  return {
    collective: { id: 'c1', name: 'Northside', isHost: true },
    offered: true,
    me: {
      venueId: 'aura',
      name: 'Aura',
      state: 'on',
      started: true,
      askFirst: false,
      excludedVenueIds: [],
      request: null,
      nudgeDismissed: false,
    },
    venues: [
      { venueId: 'l16', name: 'Light 16', status: 'sharing', excluded: false, isHost: false },
      { venueId: 's3', name: 'Studio 3', status: 'waiting', excluded: false, isHost: false },
    ],
    counts: { here: 1240, fromOthers: 310, inBoth: 96, shared: 1454 },
    progress: null,
    arriving: 0,
    todo: { toCheck: 2, changes: 1 },
    undecidedCount: 1,
    ...over,
  };
}

async function renderPanel(isHost = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <ClientsPanel collectiveId="c1" isHost={isHost} />
      </QueryClientProvider>,
    );
  });
  // Let the status query resolve.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  mockCalls.length = 0;
  mockPush.mockReset();
  Object.values(mockToast).forEach((f) => f.mockReset());
  mockStatus = status();
});

describe('Clients tab (app)', () => {
  it('shows the venues in one word each, the counts, and what waits', async () => {
    await renderPanel();
    expect(screen.getByText(clientSharingCopy('cs.tab.switch'))).toBeTruthy();
    expect(screen.getByText(clientSharingCopy('cs.state.waiting', { venue: 'Studio 3' }))).toBeTruthy();
    expect(screen.getAllByText(clientSharingCopy('cs.state.sharing')).length).toBeGreaterThan(0);
    expect(
      screen.getByText(new RegExp('1,240 clients here, 310 from the other venues, 96 in both\\.')),
    ).toBeTruthy();
    expect(screen.getByText(clientSharingCopy('cs.todo.check', { count: 3 }))).toBeTruthy();
    fireEvent.press(screen.getByText(clientSharingCopy('cs.todo.open')));
    expect(mockPush).toHaveBeenCalledWith('/client/check?collective=c1');
  });

  it('asks before stopping, then stops', async () => {
    await renderPanel();
    await act(async () => {
      fireEvent(screen.getByLabelText(clientSharingCopy('cs.tab.switch')), 'valueChange', false);
    });
    expect(screen.getByText(clientSharingCopy('cs.stop.title'))).toBeTruthy();
    expect(mockCalls.some((c) => c.path.endsWith('/stop'))).toBe(false);
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.stop.confirm')));
    });
    expect(mockCalls.find((c) => c.path.endsWith('/stop'))).toEqual(
      expect.objectContaining({ method: 'POST', body: {} }),
    );
  });

  it('lets the host ask everyone, and says how many were asked', async () => {
    await renderPanel();
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.tab.askEveryone')));
    });
    expect(mockCalls.some((c) => c.path.endsWith('/client-sharing/ask') && c.method === 'POST')).toBe(true);
    expect(mockToast.success).toHaveBeenCalledWith(clientSharingCopy('cs.tab.asked', { count: 2 }));
  });

  it('opens Bring together when saying yes needs it', async () => {
    mockStatus = status({ me: { ...status().me, state: 'not_now', started: false } });
    await renderPanel();
    mockStatus = { ...status(), needsBringTogether: true };
    await act(async () => {
      fireEvent(screen.getByLabelText(clientSharingCopy('cs.tab.switch')), 'valueChange', true);
    });
    expect(mockCalls.find((c) => c.method === 'PUT')?.body).toEqual({ share: true });
    expect(await screen.findByText(clientSharingCopy('cs.start.title'))).toBeTruthy();
  });

  it('tells a member the collective does not share yet, and the host how to offer it', async () => {
    mockStatus = status({ offered: false });
    await renderPanel(false);
    expect(screen.getByText(clientSharingCopy('cs.tab.notOffered'))).toBeTruthy();
  });
});
