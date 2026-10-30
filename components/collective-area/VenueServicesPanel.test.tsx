/**
 * "Every venue's services" (owner, 2026-10-27; web `VenueServicesPanel.tsx`): the host picks a
 * venue, filters and ticks, and puts services on the page or takes them off in one save, with
 * nobody asked. A service that matches a page service joins it unless the host adds it separately.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import type { VenueServiceRow, VenueServicesGroup } from '@/lib/collective-area/venue-services';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View: MockView } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(MockView, null, children) : null,
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

import { useVenueServicesPanel, VenueServicesBar, VenueServicesList } from './VenueServicesPanel';

const row = (overrides: Partial<VenueServiceRow> & Pick<VenueServiceRow, 'id' | 'name'>): VenueServiceRow => ({
  duration_minutes: 30,
  price_pence: 2500,
  heading: null,
  bookable_online: true,
  on_page: false,
  item_id: null,
  page_name: null,
  joins: null,
  calendars: 1,
  suggested_at: null,
  ...overrides,
});

let mockVenues: VenueServicesGroup[] = [];
const freshVenues = (): VenueServicesGroup[] => [
  {
    venue_id: 'v-host',
    venue_name: 'Northside Studio',
    is_host: true,
    services: [row({ id: 'h1', name: 'Balayage', on_page: true, item_id: 'item-1' })],
  },
  {
    venue_id: 'v-zen',
    venue_name: 'Zen Studio',
    is_host: false,
    services: [
      row({ id: 'z1', name: 'Brows', suggested_at: '2026-10-27T09:00:00Z' }),
      row({ id: 'z2', name: 'Balayage', joins: { item_id: 'item-1', name: 'Balayage' } }),
      row({ id: 'z3', name: 'Gents cut', on_page: true, item_id: 'item-2' }),
    ],
  },
];

function Harness({ initialVenueId = null, initialFilter = null }: { initialVenueId?: string | null; initialFilter?: 'suggested' | null }) {
  const panel = useVenueServicesPanel({
    collectiveId: 'col-1',
    collectiveName: 'Northside',
    enabled: true,
    initialVenueId,
    initialFilter,
  });
  return (
    <View>
      <VenueServicesList panel={panel} currencySymbol="£" />
      <VenueServicesBar panel={panel} />
    </View>
  );
}

async function renderPanel(props: { initialVenueId?: string | null; initialFilter?: 'suggested' | null } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <Harness {...props} />
      </QueryClientProvider>,
    );
  });
}

const posts = () => mockCalls.filter((c) => c.method === 'POST');
const tick = async (label: string) => {
  await act(async () => {
    fireEvent.press(screen.getByLabelText(label));
  });
};

beforeEach(() => {
  mockCalls.length = 0;
  mockVenues = freshVenues();
  mockHandler = (call) => {
    if (call.method === 'GET') {
      return { role: 'host', collective_name: 'Northside', host_venue_id: 'v-host', venues: structuredClone(mockVenues) };
    }
    if (call.path.endsWith('/venue-services')) {
      const body = call.body as { action: string; items: { venue_id: string; service_id: string }[] };
      const statuses = new Map<string, string>();
      for (const g of mockVenues) {
        for (const s of g.services) {
          if (body.items.some((i) => i.service_id === s.id)) {
            s.on_page = body.action === 'add';
            s.suggested_at = null;
            statuses.set(s.id, body.action === 'add' ? (s.joins ? 'matched' : 'added') : 'withdrawn');
          }
        }
      }
      return { results: body.items.map((i) => ({ ...i, ok: true, status: statuses.get(i.service_id) })) };
    }
    return { ok: true, already: false, declined: 1 };
  };
});

describe("Every venue's services", () => {
  it('lists every venue with how much of it is on the page, and every service with its state', async () => {
    await renderPanel();
    expect(
      await screen.findByText(
        "Every service each venue has. Tick the ones you want on the Northside page. A venue's service goes on as it is and keeps the calendars that offer it. Nobody is asked.",
      ),
    ).toBeTruthy();
    expect(mockCalls[0]?.path).toBe('/api/venue/collectives/col-1/venue-services');
    expect(screen.getByText('All venues')).toBeTruthy();
    expect(screen.getByText('Northside Studio (you)')).toBeTruthy();
    expect(screen.getByText('1 of 1 on the page')).toBeTruthy();
    expect(screen.getByText('1 of 3 on the page')).toBeTruthy();
    expect(screen.getByText('Suggested (1)')).toBeTruthy();
    // Every venue shown, so each row names its venue.
    expect(screen.getAllByText('30 min · £25.00 · Zen Studio · 1 calendar')).toHaveLength(3);
    expect(screen.getByText('30 min · £25.00 · Northside Studio (you) · 1 calendar')).toBeTruthy();
    expect(screen.getAllByText('Joins Balayage on the page')).toHaveLength(1);
    expect(screen.getAllByText('Suggested')).toHaveLength(1);
  });

  it('opens on the venue and filter a bell names', async () => {
    await renderPanel({ initialVenueId: 'v-zen', initialFilter: 'suggested' });
    expect(await screen.findByLabelText('Brows')).toBeTruthy();
    expect(screen.queryByLabelText('Gents cut')).toBeNull();
    expect(screen.queryByLabelText('Balayage')).toBeNull();
  });

  it('falls back to every venue when the venue named is not in the collective', async () => {
    await renderPanel({ initialVenueId: 'v-gone' });
    expect(await screen.findByLabelText('Brows')).toBeTruthy();
    expect(screen.getAllByLabelText('Balayage')).toHaveLength(2);
  });

  it('puts ticked services on the page in one save, and says so', async () => {
    await renderPanel({ initialVenueId: 'v-zen' });
    await screen.findByLabelText('Brows');
    await tick('Brows');
    expect(screen.getByText('1 selected')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Put on the page (1)'));
    });
    expect(screen.getByText('Put Brows on the Northside page?')).toBeTruthy();
    expect(
      screen.getByText(
        'It goes on as it is. The calendars that offer it keep offering it, and nobody is asked. You can change its price and times for the page from your Services page.',
      ),
    ).toBeTruthy();
    // Brows matches nothing on the page: no choice about joining.
    expect(screen.queryByLabelText('Add them as separate services instead')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getAllByText('Put on the page').at(-1)!);
    });
    expect(posts()).toEqual([
      {
        path: '/api/venue/collectives/col-1/venue-services',
        method: 'POST',
        body: { action: 'add', mode: 'match', items: [{ venue_id: 'v-zen', service_id: 'z1' }] },
      },
    ]);
    expect(await screen.findByText('Brows is on the Northside page.')).toBeTruthy();
  });

  it('adds a matching service separately when the host ticks the box', async () => {
    await renderPanel({ initialVenueId: 'v-zen' });
    await screen.findByLabelText('Balayage');
    await tick('Balayage');
    await tick('Brows');
    await act(async () => {
      fireEvent.press(screen.getByText('Put on the page (2)'));
    });
    expect(screen.getByText('Put 2 services on the Northside page?')).toBeTruthy();
    expect(
      screen.getByText(
        "These have the same name as one of your services, so they join it and guests see one: Balayage (Zen Studio). They follow your service's price and times from then on, and yours goes on the page if it is not there yet.",
      ),
    ).toBeTruthy();
    await tick('Add them as separate services instead');
    await act(async () => {
      fireEvent.press(screen.getAllByText('Put on the page').at(-1)!);
    });
    expect(posts()[0]?.body).toMatchObject({ action: 'add', mode: 'separate' });
    expect(await screen.findByText('2 services are on the Northside page.')).toBeTruthy();
  });

  it('takes services off the page', async () => {
    await renderPanel({ initialVenueId: 'v-zen' });
    await screen.findByLabelText('Gents cut');
    await tick('Gents cut');
    await act(async () => {
      fireEvent.press(screen.getByText('Take off the page (1)'));
    });
    expect(screen.getByText('Take Gents cut off the Northside page?')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getAllByText('Take off the page').at(-1)!);
    });
    expect(posts()[0]?.body).toEqual({ action: 'remove', mode: 'match', items: [{ venue_id: 'v-zen', service_id: 'z3' }] });
    expect(await screen.findByText('Gents cut is off the Northside page.')).toBeTruthy();
  });

  // CQ-04 (regression): the web's "These did not change:" with a row naming the venue and the reason.
  it('names a service that did not change, with its venue and why, and keeps it ticked', async () => {
    mockHandler = (call) => {
      if (call.method === 'GET') return { role: 'host', collective_name: 'Northside', host_venue_id: 'v-host', venues: structuredClone(mockVenues) };
      const body = call.body as { items: { venue_id: string; service_id: string }[] };
      return { results: body.items.map((i) => ({ ...i, ok: false, message: 'Zen Studio is still updating.' })) };
    };
    await renderPanel({ initialVenueId: 'v-zen' });
    await screen.findByLabelText('Brows');
    await tick('Brows');
    await act(async () => {
      fireEvent.press(screen.getByText('Put on the page (1)'));
    });
    await act(async () => {
      fireEvent.press(screen.getAllByText('Put on the page').at(-1)!);
    });
    expect(await screen.findByText('These did not change:')).toBeTruthy();
    expect(screen.getByText('• Brows at Zen Studio: Zen Studio is still updating.')).toBeTruthy();
    expect(screen.getByLabelText('Brows').props.accessibilityState?.checked).toBe(true);
    // Nothing changed, so there is nothing to undo.
    expect(screen.queryByText(/^Undo \(/)).toBeNull();
  });

  // CQ-11 (regression): a save on Every venue's services could not be undone.
  it('undoes a put-on for 60 seconds with the opposite change, and nobody is asked', async () => {
    await renderPanel({ initialVenueId: 'v-zen' });
    await screen.findByLabelText('Brows');
    await tick('Brows');
    await act(async () => {
      fireEvent.press(screen.getByText('Put on the page (1)'));
    });
    await act(async () => {
      fireEvent.press(screen.getAllByText('Put on the page').at(-1)!);
    });
    expect(await screen.findByText('Brows is on the Northside page.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(/^Undo \((60|59)s\)$/));
    });
    expect(posts().at(-1)).toEqual({
      path: '/api/venue/collectives/col-1/venue-services',
      method: 'POST',
      body: { action: 'remove', mode: 'match', items: [{ venue_id: 'v-zen', service_id: 'z1' }] },
    });
    expect(await screen.findByText('Undone. Those services are back as they were.')).toBeTruthy();
    expect(screen.queryByText(/^Undo \(/)).toBeNull();
  });

  it("says a joined service goes back with the host's price and length when its put-on is undone", async () => {
    await renderPanel({ initialVenueId: 'v-zen' });
    await screen.findByLabelText('Balayage');
    await tick('Balayage');
    await act(async () => {
      fireEvent.press(screen.getByText('Put on the page (1)'));
    });
    await act(async () => {
      fireEvent.press(screen.getAllByText('Put on the page').at(-1)!);
    });
    await act(async () => {
      fireEvent.press(await screen.findByText(/^Undo \(/));
    });
    expect(posts().at(-1)?.body).toEqual({ action: 'remove', mode: 'match', items: [{ venue_id: 'v-zen', service_id: 'z2' }] });
    expect(
      await screen.findByText(
        "• Balayage went back to Zen Studio with Northside Studio's price and length, not their own.",
      ),
    ).toBeTruthy();
  });

  it('offers Undo after a take-off too, and it goes after a minute', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      await renderPanel({ initialVenueId: 'v-zen' });
      await screen.findByLabelText('Gents cut');
      await tick('Gents cut');
      await act(async () => {
        fireEvent.press(screen.getByText('Take off the page (1)'));
      });
      await act(async () => {
        fireEvent.press(screen.getAllByText('Take off the page').at(-1)!);
      });
      expect(await screen.findByText(/^Undo \(/)).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(61_000);
      });
      expect(screen.queryByText(/^Undo \(/)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
    expect(posts()).toHaveLength(1);
  });

  it('leaves a ticked suggestion off with Not now', async () => {
    await renderPanel({ initialFilter: 'suggested' });
    await screen.findByLabelText('Brows');
    await tick('Brows');
    await act(async () => {
      fireEvent.press(screen.getByText('Not now'));
    });
    expect(screen.getByText('Leave Brows off the page?')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Leave it off'));
    });
    expect(posts()).toEqual([
      { path: '/api/venue/collectives/col-1/suggestions/decline', method: 'POST', body: { service_ids: ['z1'] } },
    ]);
    expect(await screen.findByText('Brows is left off the page. We have let Zen Studio know.')).toBeTruthy();
  });

  it('ticks every service shown, and clears them', async () => {
    await renderPanel({ initialVenueId: 'v-zen' });
    await screen.findByLabelText('Brows');
    await tick('Select all shown');
    expect(screen.getByText('3 selected')).toBeTruthy();
    expect(screen.getByText('Put on the page (2)')).toBeTruthy();
    expect(screen.getByText('Take off the page (1)')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Clear'));
    });
    expect(screen.queryByTestId('venue-services-bar')).toBeNull();
  });

  it('searches, and says when nothing matches', async () => {
    await renderPanel();
    await screen.findByLabelText('Brows');
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search services'), 'zzz');
    });
    expect(screen.getByText('No services match.')).toBeTruthy();
  });

  it('shows nothing on a server without the route', async () => {
    mockHandler = () => {
      const { ApiError } = jest.requireActual('@/lib/api/client');
      throw new ApiError('Request failed (404)', 404);
    };
    await renderPanel();
    expect(screen.queryByText('All venues')).toBeNull();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });
});
