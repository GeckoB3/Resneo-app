/**
 * One leave sheet with the web's preview (CQ-10.1, R2-23, A8-02): before the member confirms it says
 * how many services become its own, what stops taking payments, that bookings and links stay, and
 * when it is the last venue with the host, that the collective ends. Go back comes first; Leave stays
 * off until the preview has loaded. A collective not on shared services (409) keeps today's sentence
 * and can still be left. After leaving, the review goes into the cache and the venue lands on Venue
 * collectives. Before this the app showed one sentence and called no preview.
 *
 * The queries are real; only the network is mocked. jest hoists mock factories above imports, so
 * every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: mockReplace }) }));
const mockToastSuccess = jest.fn();
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: mockToastSuccess, error: jest.fn() }) }));
jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true, getApiUrl: () => 'https://api.test' }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token' }));
const mockApiFetch = jest.fn();
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { ApiError } from '@/lib/api/client';
import { collectiveServiceToolKeys } from '@/lib/queries/useCollectiveServiceTools';

import { LeaveCollectiveSheet } from './LeaveCollectiveSheet';

const PREVIEW = {
  collective_name: 'Plus 1',
  host_name: 'Aura Hair Studio',
  services: 16,
  no_stripe: 2,
  other_venues: ['Aura Hair Studio', 'Light 16'],
  last_member: false,
};

const REVIEW = {
  collective_id: 'col-1',
  collective_name: 'Plus 1',
  host_name: 'Aura Hair Studio',
  reason: 'left',
  released_at: '2026-10-29T12:00:00Z',
  prices: 16,
  link: 0,
  stripe: true,
  library: false,
  photos: null,
  sameName: [],
  unparked: 0,
};

let client: QueryClient;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function renderSheet(serviceModel: string | null = 'replicas') {
  await render(
    <LeaveCollectiveSheet
      collective={{ id: 'col-1', name: 'Plus 1', serviceModel }}
      visible
      onClose={jest.fn()}
    />,
    { wrapper: Wrapper },
  );
}

afterEach(() => client.clear());

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  mockApiFetch.mockReset();
  mockReplace.mockReset();
  mockToastSuccess.mockReset();
});

describe('LeaveCollectiveSheet', () => {
  it("says what leaving changes, from the server's preview, with Go back first", async () => {
    let resolvePreview: (v: unknown) => void = () => undefined;
    mockApiFetch.mockImplementation((path: string) =>
      path.endsWith('/leave') ? new Promise((resolve) => (resolvePreview = resolve)) : Promise.resolve({}),
    );
    await renderSheet();
    expect(mockApiFetch.mock.calls[0]?.[0]).toBe('/api/venue/collectives/col-1/leave');
    // Leave stays off until the preview has loaded.
    expect(screen.getByRole('button', { name: 'Leave Plus 1' }).props.accessibilityState?.disabled).toBe(true);
    await act(async () => resolvePreview(PREVIEW));
    await waitFor(() =>
      expect(screen.getByText('16 services from Aura Hair Studio become your own services, with the settings they have now.')).toBeTruthy(),
    );
    expect(
      screen.getByText('2 of them take a payment online. You have not connected Stripe, so they stop taking payments online until you do.'),
    ).toBeTruthy();
    expect(screen.getByText('Bookings made through the Plus 1 page stay with you.')).toBeTruthy();
    // The app's name for the place a link is changed.
    expect(screen.getByText(/^Your account links with Aura Hair Studio and Light 16 stay exactly as they are.*go to Linked venues\.$/)).toBeTruthy();
    expect(screen.queryByText('Plus 1 needs at least two venues, so it ends when you leave.')).toBeNull();
    const buttons = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel ?? '');
    expect(buttons.indexOf('Go back')).toBeLessThan(buttons.indexOf('Leave Plus 1'));
    expect(screen.getByRole('button', { name: 'Leave Plus 1' }).props.accessibilityState?.disabled).toBe(false);
  });

  it('warns the last member that leaving ends the collective', async () => {
    mockApiFetch.mockResolvedValue({ ...PREVIEW, services: 1, no_stripe: 0, other_venues: [], last_member: true });
    await renderSheet();
    await waitFor(() => expect(screen.getByText('Plus 1 needs at least two venues, so it ends when you leave.')).toBeTruthy());
    expect(screen.getByText('1 service from Aura Hair Studio becomes your own service, with the settings it has now.')).toBeTruthy();
  });

  it('keeps the older sentence, and lets the venue leave, when the preview answers 409', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiError('This collective does not use shared services yet.', 409, { error: 'This collective does not use shared services yet.' }),
    );
    await renderSheet(null);
    await waitFor(() =>
      expect(screen.getByText('Your venue will be removed from "Plus 1". Your own booking page is unaffected.')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Leave Plus 1' }).props.accessibilityState?.disabled).toBe(false);
  });

  it('after leaving, puts the review in the cache and goes to Venue collectives', async () => {
    mockApiFetch.mockImplementation((path: string, init?: { method?: string }) =>
      Promise.resolve(init?.method === 'PATCH' ? { review: REVIEW } : PREVIEW),
    );
    await renderSheet();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Leave Plus 1' }).props.accessibilityState?.disabled).toBe(false));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Leave Plus 1' }));
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/collectives'));
    const leave = mockApiFetch.mock.calls.find((c) => c[1]?.method === 'PATCH');
    expect(leave?.[0]).toBe('/api/venue/collectives/col-1/members');
    expect(JSON.parse(leave?.[1].body)).toEqual({ action: 'leave' });
    expect(client.getQueryData(collectiveServiceToolKeys.releaseReview('token'))).toEqual(REVIEW);
    expect(mockToastSuccess).toHaveBeenCalledWith('You left Plus 1.');
  });
});
