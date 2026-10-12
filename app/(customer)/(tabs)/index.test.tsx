/**
 * The customer hub with its loyalty card (UX spec §21.4): the card sits after the passes and
 * before venue history, as on the web account, and a failed loyalty read leaves the rest of the
 * hub exactly as it was.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import type { CustomerHome } from '@/lib/queries/useCustomerHome';

import CustomerHomeScreen from './index';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/components/ui/Screen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => React.createElement(View, null, children) };
});
jest.mock('@/lib/mode/useAppMode', () => ({ useAppMode: () => ({ canSwitch: false, choose: jest.fn() }) }));
jest.mock('@/lib/queries/useCustomerProfile', () => ({ useCustomerProfile: () => ({ data: undefined }) }));
jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
const mockApiFetch = jest.fn();
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});
let mockHome: unknown = null;
jest.mock('@/lib/queries/useCustomerHome', () => {
  const actual = jest.requireActual<typeof import('@/lib/queries/useCustomerHome')>('@/lib/queries/useCustomerHome');
  return {
    ...actual,
    useCustomerHome: () => ({ data: mockHome, isLoading: false, isError: false, refetch: jest.fn() }),
  };
});

const HOME: CustomerHome = {
  next_booking: null,
  next_booking_form_links: [],
  next_booking_forms_checked: true,
  later_bookings_needing_forms: 0,
  next_booking_appointment: { service: null, practitioner: null },
  upcoming_count: 0,
  upcoming_after_next: [],
  outstanding_payments: [],
  venues: [{ id: 'v-1', name: 'Studio' }],
  venue_history: [
    {
      venue: { id: 'v-1', name: 'Studio', slug: 'studio' },
      visits: 4,
      first_booked_at: null,
      last_booked_at: null,
      deposits_paid_minor: 0,
      next_booking: null,
      rebook_href: null,
    },
  ],
  venue_history_hidden: 0,
  credits: { total_remaining: 3, venue_count: 1, next_expiry: null },
  memberships: { active_count: 0, cancelling_count: 0 },
};

const SECTION_HEADINGS = /^(YOUR PASSES|Loyalty card|VENUES YOU HAVE BOOKED WITH)$/;

async function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <CustomerHomeScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockHome = HOME;
  mockApiFetch.mockReset();
});

describe('the loyalty card on the hub', () => {
  it('sits after the passes and before venue history', async () => {
    mockApiFetch.mockResolvedValue({
      venues: [{ venue_id: 'v-1', venue_name: 'Studio', stamps: 4, needed: 6, rewards: [] }],
    });
    await renderHome();
    await screen.findByLabelText('4 of 6 visits at Studio');
    const order = screen.getAllByText(SECTION_HEADINGS).map((heading) => heading.props.children);
    expect(order).toEqual(['YOUR PASSES', 'Loyalty card', 'VENUES YOU HAVE BOOKED WITH']);
  });

  it('leaves the rest of the hub as it was when the loyalty read fails', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('Internal error', 500));
    await renderHome();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/me/loyalty', { accessToken: 'token-A' }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const order = screen.getAllByText(SECTION_HEADINGS).map((heading) => heading.props.children);
    expect(order).toEqual(['YOUR PASSES', 'VENUES YOU HAVE BOOKED WITH']);
    expect(screen.queryByText('Could not load your account')).toBeNull();
  });
});
