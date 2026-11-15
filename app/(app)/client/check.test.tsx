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
let mockRole = 'admin';
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ data: { staff: { role: mockRole } }, isLoading: false }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn(), show: jest.fn(), dismiss: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
/** The code a decision fails with, or null when it goes through. */
let mockDecideCode: string | null = null;
/** Pages of cards by offset, and the whole count; null reads the two default cards. */
let mockPages: Record<number, unknown[]> | null = null;
let mockTotal = 2;
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual('@/lib/api/client');
  return {
    ...actual,
    apiFetch: (path: string, options: { method?: string; body?: string } = {}) => {
      const method = options.method ?? 'GET';
      mockCalls.push({ path, method, body: options.body ? JSON.parse(options.body) : undefined });
      if (method === 'POST' && /\/check\/card-/.test(path)) {
        if (mockDecideCode) {
          return Promise.reject(new actual.ApiError('Refused', 409, { error: 'x', code: mockDecideCode }));
        }
        return Promise.resolve({ ok: true });
      }
      if (mockPages) {
        const offset = Number(/offset=(\d+)/.exec(path)?.[1] ?? '0');
        return Promise.resolve({ cards: mockPages[offset] ?? [], total: mockTotal, likelyCount: 0, undo: null });
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
  mockDecideCode = null;
  mockPages = null;
  mockTotal = 2;
  mockRole = 'admin';
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
    mockDecideCode = 'COLLECTIVE_CLIENT_CARD_DECIDED';
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

  it('reads an empty value as blank', () => {
    expect(
      changeSentence({
        kind: 'change',
        id: 'x',
        reason: 'changed_here',
        field: 'email',
        newValue: '',
        currentValue: 'jane@mail.com',
        guest: { guestId: 'g', name: 'Jane', email: null, phone: null, venueId: 'a', venueName: 'Aura' },
        fromVenueName: 'Light 16',
      }),
    ).toBe('Light 16 changed Jane’s email to blank. Yours is jane@mail.com.');
  });

  it('says a card that has gone was answered elsewhere, and reloads', async () => {
    mockDecideCode = 'COLLECTIVE_CLIENT_CARD_NOT_FOUND';
    await renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.check.same')));
    });
    expect(mockToast.info).toHaveBeenCalledWith(clientSharingCopy('cs.check.decided'));
  });

  it('says a card waits while sharing with that venue is paused, and moves on', async () => {
    mockDecideCode = 'COLLECTIVE_CLIENT_PAUSED';
    await renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.check.same')));
    });
    expect(mockToast.info).toHaveBeenCalledWith(clientSharingCopy('cs.check.paused'));
    expect(screen.getByText(clientSharingCopy('cs.check.useNew'))).toBeTruthy();
  });

  it('lets a change card be skipped too, back round to the first card', async () => {
    await renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.check.skip')));
    });
    expect(screen.getByTestId('check-card-change')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.check.skip')));
    });
    expect(screen.getByTestId('check-card-match')).toBeTruthy();
    expect(screen.getByText(clientSharingCopy('cs.check.position', { n: 1, total: 2 }))).toBeTruthy();
  });

  it('counts every card, and skipping past the page loads the next one before wrapping', async () => {
    const match = (id: string, name: string) => ({
      kind: 'match',
      id,
      reason: 'same_email',
      certainty: 'certain',
      mine: { guestId: `${id}-m`, name, email: null, phone: null, venueId: 'a', venueName: 'Aura' },
      theirs: { guestId: `${id}-t`, name, email: null, phone: null, venueId: 'b', venueName: 'Light 16' },
    });
    mockPages = { 0: [match('card-1', 'Ann Lee')], 1: [match('card-2', 'Bob Ray')] };
    mockTotal = 2;
    await renderScreen();
    expect(screen.getByText(clientSharingCopy('cs.check.position', { n: 1, total: 2 }))).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.check.skip')));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockCalls.some((c) => c.method === 'GET' && c.path.includes('offset=1'))).toBe(true);
    expect(screen.getAllByText(/Bob Ray/).length).toBeGreaterThan(0);
    expect(screen.getByText(clientSharingCopy('cs.check.position', { n: 2, total: 2 }))).toBeTruthy();
    // The last card: back to the first.
    await act(async () => {
      fireEvent.press(screen.getByText(clientSharingCopy('cs.check.skip')));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getAllByText(/Ann Lee/).length).toBeGreaterThan(0);
    expect(screen.getByText(clientSharingCopy('cs.check.position', { n: 1, total: 2 }))).toBeTruthy();
  });

  it('tells staff who are not owners or admins that this is for them', async () => {
    mockRole = 'staff';
    await renderScreen();
    expect(screen.getByText(clientSharingCopy('cs.check.adminOnly'))).toBeTruthy();
    expect(screen.getByText(clientSharingCopy('cs.check.back'))).toBeTruthy();
  });
});
