/**
 * "Review your services" (web `ReleaseReviewCard`): the checklist after leaving or being removed,
 * with the singular forms, hidden at once on Done while the dismiss goes to the server, and nothing
 * at all when there is no review or the screen does not ask for one.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));

type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
let mockReview: Record<string, unknown> | null = null;
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: (path: string, options: { method?: string; body?: string } = {}) => {
    const call = { path, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : undefined };
    mockCalls.push(call);
    return Promise.resolve(call.method === 'GET' ? { review: mockReview } : { ok: true });
  },
}));

import { ReleaseReviewCard } from './ReleaseReviewCard';

const review = (over: Record<string, unknown> = {}) => ({
  collective_id: 'col-1',
  collective_name: 'Northside',
  host_name: 'Bright Cuts',
  reason: 'left',
  released_at: '2026-10-01T10:00:00Z',
  prices: 3,
  link: 1,
  stripe: true,
  library: true,
  photos: 'failed',
  sameName: ['Balayage'],
  unparked: 1,
  ...over,
});

async function renderCard(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  });
}

beforeEach(() => {
  mockCalls.length = 0;
  mockReview = null;
});

describe('ReleaseReviewCard', () => {
  it('lists what to check after leaving, and hides on Done while the dismiss is sent', async () => {
    mockReview = review();
    await renderCard(<ReleaseReviewCard />);
    expect(await screen.findByText('You left Northside. Review your services')).toBeTruthy();
    for (const line of [
      'Check prices and deposits on 3 services that came from Bright Cuts',
      'Add your own online meeting link to 1 service',
      'Connect Stripe to take payments online again',
      'Check headings, add-ons and forms that came from Bright Cuts',
      'Some photos could not be copied.',
      'You now have two services called Balayage: yours, and the one that came from Bright Cuts. Both are active. Rename or turn off the one you do not need.',
      '1 service that was parked while you were part of Northside is bookable again.',
    ]) {
      expect(screen.getByText(line)).toBeTruthy();
    }

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    });
    expect(screen.queryByText('You left Northside. Review your services')).toBeNull();
    expect(mockCalls.find((c) => c.method === 'POST')).toEqual({
      path: '/api/venue/collectives/review',
      method: 'POST',
      body: { collective_id: 'col-1' },
    });
  });

  it('reads a removal as a removal', async () => {
    mockReview = review({ reason: 'removed', prices: 1, link: 0, stripe: false, library: false, photos: null, sameName: [], unparked: 0 });
    await renderCard(<ReleaseReviewCard />);
    expect(await screen.findByText('You are no longer part of Northside. Review your services')).toBeTruthy();
    expect(screen.getByText('Check prices and deposits on 1 service that came from Bright Cuts')).toBeTruthy();
  });

  it('shows nothing when there is no review, and does not ask when the screen says not to', async () => {
    await renderCard(<ReleaseReviewCard />);
    expect(screen.queryByText(/Review your services/)).toBeNull();
    expect(mockCalls).toHaveLength(1);

    mockCalls.length = 0;
    mockReview = review();
    await renderCard(<ReleaseReviewCard enabled={false} />);
    expect(mockCalls).toHaveLength(0);
    expect(screen.queryByText(/Review your services/)).toBeNull();
  });
});
