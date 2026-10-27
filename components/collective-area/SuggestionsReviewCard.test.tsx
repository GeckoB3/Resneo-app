/**
 * The members' suggestions waiting for the host, answered all at once or a few at a time (owner,
 * 2026-10-27; web `SuggestionsReview.tsx`). Adding puts them on the page as they are, through the
 * venue-services route, with nobody asked; "Not now" leaves them off in one request.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ApiError } from '@/lib/api/client';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));

type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
let mockHandler: (call: Call) => unknown = () => ({});
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: (path: string, options: { method?: string; body?: string } = {}) => {
    const call = { path, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : undefined };
    mockCalls.push(call);
    try {
      return Promise.resolve(mockHandler(call));
    } catch (e) {
      return Promise.reject(e);
    }
  },
}));

import { SuggestionsReviewCard } from './SuggestionsReviewCard';

const suggestion = (id: string, name: string, venueId: string, venueName: string) => ({
  service_id: id,
  service_name: name,
  venue_id: venueId,
  venue_name: venueName,
  duration_minutes: 30,
  price_pence: 2500,
  suggested_at: '2026-10-27T09:00:00Z',
});
const brows = suggestion('svc-1', 'Brows', 'v-zen', 'Zen Studio');
const nails = suggestion('svc-2', 'Nails', 'v-zen', 'Zen Studio');
const facial = suggestion('svc-3', 'Facial', 'v-glow', 'Glow Bar');

let mockWaiting = [brows, nails, facial];

async function renderCard(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  });
}

const card = (onReview?: () => void) => (
  <SuggestionsReviewCard collectiveId="col-1" collectiveName="Northside" currencySymbol="£" onReview={onReview} />
);

const posts = () => mockCalls.filter((c) => c.method === 'POST');

beforeEach(() => {
  mockCalls.length = 0;
  mockWaiting = [brows, nails, facial];
  mockHandler = (call) => {
    if (call.method === 'GET') return { role: 'host', suggestions: mockWaiting };
    if (call.path.endsWith('/venue-services')) {
      const items = (call.body as { items: { venue_id: string; service_id: string }[] }).items;
      mockWaiting = mockWaiting.filter((s) => !items.some((i) => i.service_id === s.service_id));
      return { results: items.map((i) => ({ ...i, ok: true, status: 'added' })) };
    }
    const ids = (call.body as { service_ids: string[] }).service_ids;
    mockWaiting = mockWaiting.filter((s) => !ids.includes(s.service_id));
    return { ok: true, already: false, declined: ids.length };
  };
});

describe('SuggestionsReviewCard', () => {
  it('lists the suggestions by venue and adds them all in one request, with nobody asked', async () => {
    await renderCard(card());
    expect(await screen.findByText(/^Suggested by your venues/)).toBeTruthy();
    expect(screen.getByText('Each goes on the Northside page as it is, offered by the calendars of the venue that suggested it.')).toBeTruthy();
    expect(screen.getByText('Zen Studio')).toBeTruthy();
    expect(screen.getByText('Glow Bar')).toBeTruthy();
    expect(screen.getAllByText('30 min · £25.00')).toHaveLength(3);
    await act(async () => {
      fireEvent.press(screen.getByText('Add all 3'));
    });
    expect(posts()).toEqual([
      {
        path: '/api/venue/collectives/col-1/venue-services',
        method: 'POST',
        body: {
          action: 'add',
          mode: 'match',
          items: [
            { venue_id: 'v-zen', service_id: 'svc-1' },
            { venue_id: 'v-zen', service_id: 'svc-2' },
            { venue_id: 'v-glow', service_id: 'svc-3' },
          ],
        },
      },
    ]);
    expect(await screen.findByText('3 services are on the Northside page.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/^Suggested by your venues/)).toBeNull());
  });

  it('adds only the ticked ones', async () => {
    await renderCard(card());
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Glow Bar: Facial'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Add selected (1)'));
    });
    expect(posts()[0]?.body).toEqual({ action: 'add', mode: 'match', items: [{ venue_id: 'v-glow', service_id: 'svc-3' }] });
    expect(await screen.findByText('Facial is on the Northside page.')).toBeTruthy();
    expect(screen.getByText('Add all 2')).toBeTruthy();
  });

  it('names the ones that did not go on, and keeps them ticked', async () => {
    mockHandler = (call) => {
      if (call.method === 'GET') return { role: 'host', suggestions: mockWaiting };
      const items = (call.body as { items: { venue_id: string; service_id: string }[] }).items;
      return { results: items.map((i) => ({ ...i, ok: i.service_id !== 'svc-2', message: 'No' })) };
    };
    await renderCard(card());
    await act(async () => {
      fireEvent.press(await screen.findByText('Add all 3'));
    });
    expect(await screen.findByText('These did not change: Nails. Please try them again.')).toBeTruthy();
    expect(screen.getByLabelText('Zen Studio: Nails').props.accessibilityState?.checked).toBe(true);
    expect(screen.getByLabelText('Zen Studio: Brows').props.accessibilityState?.checked).toBe(false);
  });

  it("shows the route's own words when it refuses the request", async () => {
    mockHandler = (call) => {
      if (call.method === 'GET') return { role: 'host', suggestions: mockWaiting };
      throw new ApiError('Only the host can change the page.', 403, { error: 'Only the host can change the page.' });
    };
    await renderCard(card());
    await act(async () => {
      fireEvent.press(await screen.findByText('Add all 3'));
    });
    expect(await screen.findByText('Only the host can change the page.')).toBeTruthy();
  });

  it('leaves the ticked ones off once the host confirms, in one request', async () => {
    await renderCard(card());
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Zen Studio: Brows'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Not now'));
    });
    expect(screen.getByText('Leave Brows off the page?')).toBeTruthy();
    expect(
      screen.getByText('We will let the venues know you are not adding them for now. They keep them, and can suggest them again later.'),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Leave it off'));
    });
    expect(posts()).toEqual([
      { path: '/api/venue/collectives/col-1/suggestions/decline', method: 'POST', body: { service_ids: ['svc-1'] } },
    ]);
    expect(await screen.findByText('Brows is left off the page. We have let Zen Studio know.')).toBeTruthy();
  });

  it('leaves every one off when nothing is ticked', async () => {
    await renderCard(card());
    await act(async () => {
      fireEvent.press(await screen.findByText('Not now'));
    });
    expect(screen.getByText('Leave 3 suggestions off the page?')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Leave it off'));
    });
    expect(posts()[0]?.body).toEqual({ service_ids: ['svc-1', 'svc-2', 'svc-3'] });
    expect(await screen.findByText('3 suggestions are left off the page. We have let the venues know.')).toBeTruthy();
  });

  it('opens every venue\'s services on the suggestions with Review', async () => {
    const onReview = jest.fn();
    await renderCard(card(onReview));
    fireEvent.press(await screen.findByText('Review'));
    expect(onReview).toHaveBeenCalled();
  });

  it('says "Add it" for a single suggestion', async () => {
    mockWaiting = [brows];
    await renderCard(card());
    expect(await screen.findByText('Add it')).toBeTruthy();
  });

  it('shows nothing to a member', async () => {
    mockHandler = () => ({ role: 'member', suggestions: [brows] });
    await renderCard(card());
    await waitFor(() => expect(mockCalls).toHaveLength(1));
    expect(screen.queryByText(/^Suggested by your venues/)).toBeNull();
  });
});
