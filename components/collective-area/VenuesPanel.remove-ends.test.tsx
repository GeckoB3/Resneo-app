/**
 * Web parity for QA 2026-11-08 COL-F21: with only two venues, the host's Remove ended the collective
 * on one tap and never said so, while a member's own Leave warns. Remove now says the collective ends
 * and asks for its name, as End the collective does.
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
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));

type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: (path: string, options: { method?: string; body?: string } = {}) => {
    mockCalls.push({ path, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : undefined });
    return Promise.resolve({});
  },
}));

import { removeEndsCollective } from '@/lib/collective-area/remove-ends-collective';
import { VenuesPanel, type VenueRow } from './AreaTabs';

const venue = (venue_id: string, venue_name: string, is_host = false): VenueRow => ({
  venue_id,
  venue_name,
  status: 'active',
  is_host,
  also_runs: null,
});

async function renderPanel(venues: VenueRow[]) {
  const onEnded = jest.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(
    <QueryClientProvider client={client}>
      <VenuesPanel
        collectiveId="collective-1"
        collectiveName="TEST QA1108 COL C3"
        venues={venues}
        groups={[]}
        serviceModel="replicas"
        pendingHost={null}
        onShowHistory={jest.fn()}
        onEnded={onEnded}
      />
    </QueryClientProvider>,
    );
  });
  return { onEnded };
}

const removals = () => mockCalls.filter((c) => c.method === 'PATCH' && c.path.endsWith('/members'));

beforeEach(() => {
  mockCalls.length = 0;
});

describe('removing the last other venue (COL-F21)', () => {
  it('says the collective ends, and removes only once its name is typed', async () => {
    const { onEnded } = await renderPanel([venue('host', 'Plus 5', true), venue('member', 'Light Co')]);
    await act(async () => {
      fireEvent.press(screen.getByText('Remove'));
    });
    expect(
      screen.getByText(
        'TEST QA1108 COL C3 needs at least two venues, so removing Light Co ends TEST QA1108 COL C3. The TEST QA1108 COL C3 page stops taking bookings straight away, and every venue keeps its services, calendars, clients and bookings.',
      ),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Remove and end TEST QA1108 COL C3'));
    });
    expect(removals()).toHaveLength(0);

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Type TEST QA1108 COL C3 to confirm'), 'test qa1108 col c3');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Remove and end TEST QA1108 COL C3'));
    });
    expect(removals().map((c) => c.body)).toEqual([{ action: 'remove', venueId: 'member' }]);
    expect(onEnded).toHaveBeenCalled();
  });

  it('asks as before when the collective goes on', async () => {
    await renderPanel([venue('host', 'Plus 5', true), venue('member', 'Light Co'), venue('third', 'Bloom')]);
    await act(async () => {
      fireEvent.press(screen.getAllByText('Remove')[0]!);
    });
    expect(screen.queryByText(/needs at least two venues/)).toBeNull();
    expect(screen.queryByText(/Remove and end/)).toBeNull();
  });
});

describe('removeEndsCollective', () => {
  const row = (venue_id: string, status: string) => ({ venue_id, status });
  it('follows the engine: two venues end, an open invitation keeps it', () => {
    expect(removeEndsCollective([row('host', 'active'), row('a', 'active')], 'a')).toBe(true);
    expect(removeEndsCollective([row('host', 'active'), row('a', 'active'), row('b', 'active')], 'a')).toBe(false);
    expect(removeEndsCollective([row('host', 'active'), row('a', 'active'), row('b', 'invited')], 'a')).toBe(false);
  });
});
