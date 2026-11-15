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
/** What the status reads once Bring together has started. */
let mockAfterStart: Record<string, unknown> | null = null;
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: (path: string, options: { method?: string; body?: string } = {}) => {
    const method = options.method ?? 'GET';
    mockCalls.push({ path, method, body: options.body ? JSON.parse(options.body) : undefined });
    if (path.endsWith('/ask')) return Promise.resolve({ ok: true, asked: 2 });
    if (path.endsWith('/stop')) return Promise.resolve({ ...mockStatus, kept: 12 });
    if (path.endsWith('/preview')) {
      return Promise.resolve({
        here: 1240,
        venueName: 'Aura',
        others: [],
        othersTotal: 0,
        inBoth: 0,
        toAdd: 0,
        toCheck: 0,
        nobody: true,
      });
    }
    if (path.endsWith('/start')) {
      if (mockAfterStart) mockStatus = mockAfterStart;
      return Promise.resolve(mockStatus);
    }
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
  mockAfterStart = null;
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

  it('words the two waiting states', async () => {
    mockStatus = status({
      venues: [
        { venueId: 'l16', name: 'Light 16', status: 'waiting_start', excluded: false, isHost: false },
        { venueId: 's3', name: 'Studio 3', status: 'waiting_you', excluded: false, isHost: false },
      ],
    });
    await renderPanel();
    expect(screen.getByText(clientSharingCopy('cs.state.waitingStart', { venue: 'Light 16' }))).toBeTruthy();
    expect(screen.getByText(clientSharingCopy('cs.state.waitingYou'))).toBeTruthy();
  });

  it('says almost done in the last minute, and keeps the counts while lists come together', async () => {
    mockStatus = status({ progress: { done: 90, total: 100, minutesLeft: 1 } });
    await renderPanel();
    expect(screen.getByText(clientSharingCopy('cs.tab.progressSoon'))).toBeTruthy();
    expect(screen.getByText(new RegExp('1,240 clients here'))).toBeTruthy();
  });

  it('gives minutes while more than one is left', async () => {
    mockStatus = status({ progress: { done: 10, total: 100, minutesLeft: 6 } });
    await renderPanel();
    expect(screen.getByText(clientSharingCopy('cs.tab.progress', { minutes: 6 }))).toBeTruthy();
  });

  it('shows Ask me first and the counts only while sharing, and nothing about being off while undecided', async () => {
    mockStatus = status({ me: { ...status().me, state: 'undecided', started: false } });
    await renderPanel();
    expect(screen.queryByText(clientSharingCopy('cs.tab.askFirst'))).toBeNull();
    expect(screen.queryByText(clientSharingCopy('cs.tab.youAreOff'))).toBeNull();
    expect(screen.queryByText(new RegExp('clients here'))).toBeNull();
  });

  it('says You are not sharing after Not now', async () => {
    mockStatus = status({ me: { ...status().me, state: 'not_now', started: false } });
    await renderPanel();
    expect(screen.getByText(clientSharingCopy('cs.tab.youAreOff'))).toBeTruthy();
    expect(screen.queryByText(clientSharingCopy('cs.tab.askFirst'))).toBeNull();
  });

  it('explains Bring together beside its button, and hides the counts until it is done', async () => {
    mockStatus = status({ me: { ...status().me, started: false } });
    await renderPanel();
    expect(screen.getByText(clientSharingCopy('cs.join.body1'))).toBeTruthy();
    expect(screen.getByText(clientSharingCopy('cs.tab.bringTogether'))).toBeTruthy();
    expect(screen.queryByText(new RegExp('clients here'))).toBeNull();
  });

  it('ends Bring together with Done, even when no read caught the progress line', async () => {
    mockStatus = status({ me: { ...status().me, started: false } });
    // A small list: done before any read sees the progress line.
    mockAfterStart = status();
    await renderPanel();
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.tab.bringTogether')));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const buttons = screen.getAllByText(clientSharingCopy('cs.start.confirm'));
    await act(async () => {
      fireEvent.press(buttons[buttons.length - 1]!);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(mockCalls.some((c) => c.path.endsWith('/start') && c.method === 'POST')).toBe(true);
    expect(mockToast.success).toHaveBeenCalledWith(clientSharingCopy('cs.progress.done', { count: '1,550' }));
  });

  it('asks the host before asking everyone, and says how many were asked', async () => {
    await renderPanel();
    expect(screen.getByText(clientSharingCopy('cs.tab.hostHeading'))).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.tab.askEveryone')));
    });
    expect(screen.getByText(clientSharingCopy('cs.tab.askConfirm.title'))).toBeTruthy();
    expect(mockCalls.some((c) => c.path.endsWith('/ask'))).toBe(false);
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.tab.askConfirm.confirm')));
    });
    expect(mockCalls.some((c) => c.path.endsWith('/client-sharing/ask') && c.method === 'POST')).toBe(true);
    expect(mockToast.success).toHaveBeenCalledWith(clientSharingCopy('cs.tab.asked', { count: 2 }));
  });

  it('names the venue on each switch under Change who you share with', async () => {
    await renderPanel();
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.tab.changeWho')));
    });
    expect(screen.getByLabelText(`${clientSharingCopy('cs.tab.changeWho')}: Light 16`)).toBeTruthy();
    expect(screen.getByLabelText(`${clientSharingCopy('cs.tab.changeWho')}: Studio 3`)).toBeTruthy();
  });

  it('shows a request only while not sharing, and sends Not now', async () => {
    mockStatus = status({
      me: { ...status().me, state: 'undecided', started: false, request: { byVenueName: 'Light 16', at: '2026-11-15' } },
    });
    await renderPanel();
    expect(screen.getByText(clientSharingCopy('cs.todo.asked', { venue: 'Light 16' }))).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.todo.notNow')));
    });
    expect(mockCalls.find((c) => c.path.endsWith('/dismiss'))?.body).toEqual({ what: 'request' });
  });

  it('does not show a request once this venue shares', async () => {
    mockStatus = status({ me: { ...status().me, request: { byVenueName: 'Light 16', at: '2026-11-15' } } });
    await renderPanel();
    expect(screen.queryByText(clientSharingCopy('cs.todo.asked', { venue: 'Light 16' }))).toBeNull();
  });
});
