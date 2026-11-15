/**
 * Clients to check (web plan §1A.2 step 6, mockup board 6): one card at a time, answered once.
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
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ collective: 'c1' }),
}));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/queries/useStaffMe', () => ({ useStaffMe: () => ({ data: { staff: { role: 'admin' } }, isLoading: false }) }));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn(), show: jest.fn(), dismiss: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
let mockDecideFails = false;
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual('@/lib/api/client');
  return {
    ...actual,
    apiFetch: (path: string, options: { method?: string; body?: string } = {}) => {
      const method = options.method ?? 'GET';
      mockCalls.push({ path, method, body: options.body ? JSON.parse(options.body) : undefined });
      if (method === 'POST' && /\/check\/card-/.test(path)) {
        if (mockDecideFails) {
          return Promise.reject(
            new actual.ApiError('Someone answered', 409, { error: 'x', code: 'COLLECTIVE_CLIENT_CARD_DECIDED' }),
          );
        }
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({
        cards: [
          {
            kind: 'match',
            id: 'card-1',
            reason: 'same_phone',
            certainty: 'likely',
            mine: { guestId: 'g1', name: 'Jane Smith', email: 'jane@mail.com', phone: '07700', venueId: 'a', venueName: 'Aura' },
            theirs: { guestId: 'g2', name: 'Jane Smyth', email: null, phone: '07700', venueId: 'b', venueName: 'Light 16' },
          },
          {
            kind: 'change',
            id: 'card-2',
            reason: 'changed_here',
            field: 'phone',
            newValue: '07700 900456',
            currentValue: '07700 900123',
            guest: { guestId: 'g1', name: 'Jane', email: null, phone: null, venueId: 'a', venueName: 'Aura' },
            fromVenueName: 'Light 16',
          },
        ],
        total: 2,
        likelyCount: 1,
        undo: null,
      });
    },
  };
});

import { clientSharingCopy } from '@/lib/collective-area/client-sharing-copy';
import ClientsToCheckScreen, { changeSentence } from './check';

async function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <ClientsToCheckScreen />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  mockCalls.length = 0;
  mockDecideFails = false;
  Object.values(mockToast).forEach((f) => f.mockReset());
});

describe('Clients to check (app)', () => {
  it('shows one card at a time and sends the answer', async () => {
    await renderScreen();
    expect(screen.getByText(clientSharingCopy('cs.check.question'))).toBeTruthy();
    expect(screen.getByText(clientSharingCopy('cs.check.reason.same_phone'))).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.check.same')));
    });
    expect(mockCalls.find((c) => c.method === 'POST')).toEqual({
      path: '/api/venue/collectives/c1/client-sharing/check/card-1',
      method: 'POST',
      body: { decision: 'same_person' },
    });
  });

  it('skips a card without asking the server', async () => {
    await renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.check.skip')));
    });
    expect(mockCalls.filter((c) => c.method === 'POST')).toEqual([]);
    expect(screen.getByText(clientSharingCopy('cs.check.useNew'))).toBeTruthy();
    // The skipped card stays in the list: the total does not drop, as on the web.
    expect(screen.getByText(clientSharingCopy('cs.check.position', { n: 2, total: 2 }))).toBeTruthy();
  });

  it('says another venue answered first, and reloads', async () => {
    mockDecideFails = true;
    await renderScreen();
    const reads = mockCalls.filter((c) => c.method === 'GET').length;
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.check.different')));
    });
    expect(mockToast.info).toHaveBeenCalledWith(clientSharingCopy('cs.check.decided'));
    expect(mockCalls.filter((c) => c.method === 'GET').length).toBeGreaterThan(reads);
  });

  it('reads a change the way the web does', () => {
    expect(
      changeSentence({
        kind: 'change',
        id: 'x',
        reason: 'changed_here',
        field: 'phone',
        newValue: '07700 900456',
        currentValue: null,
        guest: { guestId: 'g', name: 'Jane', email: null, phone: null, venueId: 'a', venueName: 'Aura' },
        fromVenueName: 'Light 16',
      }),
    ).toBe('Light 16 changed Jane’s phone to 07700 900456. Yours is blank.');
  });
});
