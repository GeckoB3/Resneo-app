/**
 * The Collective area asks for names when two businesses share one (web `CollectiveNameNotice`,
 * 2026-11-05): two "Aura Hair Studio" at one address could not be told apart in the booking form.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';
import { collectiveNameClashes, sharesNameInCollective } from '@/lib/collective-area/names';

jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View: MockView } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(MockView, null, children) : null,
  };
});

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

import { CollectiveNameNotice } from '@/components/collective-area/AreaPieces';

const twins = [
  { venueId: 'aura', venueName: 'Aura Hair Studio', ownName: 'Aura Hair Studio', nameInCollective: null, status: 'active' },
  { venueId: 'aura3', venueName: 'Aura Hair Studio (Jenny)', ownName: 'Aura Hair Studio', nameInCollective: null, status: 'active' },
  { venueId: 'l16', venueName: 'Light 16', ownName: 'Light 16', nameInCollective: null, status: 'active' },
];

async function renderNotice(props: Partial<Parameters<typeof CollectiveNameNotice>[0]> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  const onOpenVenues = jest.fn();
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <CollectiveNameNotice
          collectiveId="col"
          collectiveName="Holywood Collective"
          isHost={false}
          myVenueId="aura3"
          members={twins}
          onOpenVenues={onOpenVenues}
          {...props}
        />
      </QueryClientProvider>,
    );
  });
  return { onOpenVenues };
}

beforeEach(() => {
  mockCalls.length = 0;
  mockHandler = () => ({});
});

describe('names that clash', () => {
  it('asks while two share a name with none chosen, and stops once one has a name', () => {
    expect(collectiveNameClashes(twins)).toEqual([{ name: 'Aura Hair Studio', venueIds: ['aura', 'aura3'] }]);
    expect(sharesNameInCollective(twins, 'l16')).toBe(false);
    const named = twins.map((m) => (m.venueId === 'aura3' ? { ...m, nameInCollective: 'Jenny at Aura' } : m));
    expect(collectiveNameClashes(named)).toEqual([]);
  });
});

describe('CollectiveNameNotice', () => {
  it('asks the host to name them, word for word the web, and opens the Venues tab', async () => {
    const { onOpenVenues } = await renderNotice({ isHost: true, myVenueId: 'aura' });
    expect(
      screen.getByText(
        'More than one business in Holywood Collective is called "Aura Hair Studio". Give them names your staff will recognise, so nobody books the wrong one.',
      ),
    ).toBeTruthy();
    fireEvent.press(screen.getByText('Name them'));
    expect(onOpenVenues).toHaveBeenCalled();
  });

  it('lets a member that shares the name choose its own, and sends it to the server', async () => {
    await renderNotice();
    await act(async () => {
      fireEvent.press(screen.getByText('Choose a name'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('collective-name-input'), '  Jenny  at Aura ');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Save name'));
    });
    await waitFor(() =>
      expect(mockCalls).toContainEqual({
        path: '/api/venue/collectives/col/members',
        method: 'PATCH',
        body: { action: 'set_name', venueId: 'aura3', name_in_collective: 'Jenny at Aura' },
      }),
    );
  });

  it("shows the server's reason when a name is taken", async () => {
    mockHandler = (call) => {
      if (call.method === 'PATCH') {
        throw new ApiError('Another business in Holywood Collective already goes by "Light 16". Choose a name staff can tell apart.', 409);
      }
      return {};
    };
    await renderNotice();
    await act(async () => {
      fireEvent.press(screen.getByText('Choose a name'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('collective-name-input'), 'Light 16');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Save name'));
    });
    expect(
      await screen.findByText('Another business in Holywood Collective already goes by "Light 16". Choose a name staff can tell apart.'),
    ).toBeTruthy();
  });

  it('says nothing to a member with a name of its own, or for an older server', async () => {
    await renderNotice({ myVenueId: 'l16' });
    expect(screen.queryByTestId('collective-name-notice')).toBeNull();
    await renderNotice({ isHost: true, members: twins.map(({ venueId, venueName, status }) => ({ venueId, venueName, status })) });
    expect(screen.queryByTestId('collective-name-notice')).toBeNull();
  });
});
