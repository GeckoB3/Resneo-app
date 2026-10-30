/**
 * The host's services grid (web `CollectiveServicesGrid.tsx`; collectives QA 2026-10-29, P3 and P5):
 * a venue picked on its own never offers page buttons (CQ-03), a calendar with upcoming bookings
 * shows them and asks (CQ-04), every failure says what and where, Undo puts a save back for a
 * minute (CQ-11), What needs you opens a venue's calendars (CQ-10.7), and a service's sheet puts it
 * on the page or takes it off straight away (CQ-10.8).
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { AreaService, BulkOp, CollectiveCalendarGroup } from '@/lib/collective-area/model';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View: MockView } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(MockView, null, children) : null,
  };
});
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));

type Call = { path: string; method: string; body: Record<string, unknown> | undefined };
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

import { ServicesGridBar, ServicesGridList, useServicesGrid } from './ServicesGrid';

const values = { custom_price_pence: null, custom_duration_minutes: null, custom_buffer_minutes: null, custom_deposit_pence: null };
const sync = { venues: 1, applied: 1, pending: [], failed: [] };
const block = (role: 'master' | 'parked', itemId: string | null) => ({
  role,
  collective_id: 'col-1',
  collective_name: 'Northside',
  host_venue_name: 'Host Venue',
  item_id: itemId,
  locked_fields: [],
  delegated_fields: [],
  status: 'up_to_date' as const,
  status_reason: null,
  last_applied_at: null,
  hidden_reasons: [],
});

const startServices = (): AreaService[] => [
  { id: 's1', name: 'Balayage', collective: block('master', 'item-1') },
  { id: 's2', name: 'Parked cut', collective: block('parked', null) },
];
// Ada offers Balayage at her own price, Ben does not; Cy at Zen Studio offers it too.
const startGroups = (): CollectiveCalendarGroup[] => [
  {
    venue_id: 'v-host',
    venue_name: 'Host Venue',
    is_host: true,
    sync,
    calendars: [
      {
        id: 'c1',
        name: 'Ada',
        is_active: true,
        assigned: [{ item_id: 'item-1', service_id: 's1', values: { ...values, custom_price_pence: 4500 }, last_changed: null }],
      },
      { id: 'c2', name: 'Ben', is_active: true, assigned: [] },
    ],
  },
  {
    venue_id: 'v-zen',
    venue_name: 'Zen Studio',
    is_host: false,
    sync,
    calendars: [{ id: 'c3', name: 'Cy', is_active: true, assigned: [{ item_id: 'item-1', service_id: 'r1', values, last_changed: null }] }],
  },
];

/** The screen reads the services again after a page change; the harness does it by hand. */
let mockSetServices: ((services: AreaService[]) => void) | null = null;

function Harness() {
  const [services, setServices] = useState<AreaService[]>(startServices);
  const [groups] = useState<CollectiveCalendarGroup[]>(startGroups);
  useEffect(() => {
    mockSetServices = setServices;
  }, []);
  const grid = useServicesGrid({ collectiveId: 'col-1', collectiveName: 'Northside', services, groups });
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={() => grid.focusVenue('v-zen')}>
        <Text>Focus Zen Studio</Text>
      </Pressable>
      <ServicesGridList grid={grid} currencySymbol="£" />
      <ServicesGridBar grid={grid} />
    </View>
  );
}

async function renderGrid() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );
  });
}

const press = async (target: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(target);
  });
};
const bulkCalls = () => mockCalls.filter((c) => c.path === '/api/venue/collectives/col-1/bulk');
const everyOk = (call: Call) => ({ results: (call.body?.ops as BulkOp[]).map((_op, index) => ({ index, ok: true })) });

beforeEach(() => {
  mockCalls.length = 0;
  mockHandler = (call) => (call.path.endsWith('/bulk') ? everyOk(call) : {});
});

describe('the bulk lane (CQ-03)', () => {
  // Regression: a venue picked on its own meant every service shown, so Take off the page was
  // offered and emptied the page at every venue.
  it('offers Choose calendars and no page buttons for a venue picked on its own', async () => {
    await renderGrid();
    await press(screen.getByRole('button', { name: 'Select' }));
    await press(screen.getByRole('button', { name: 'Zen Studio' }));
    expect(screen.getByText('Zen Studio picked')).toBeTruthy();
    expect(screen.getByText('To put services on the page or take them off, tick the services.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose calendars' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Take off the page' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Put on the page' })).toBeNull();
    // Ticking a service brings back only what would change it.
    await press(screen.getByLabelText('Balayage'));
    expect(screen.getByText('1 service at 1 venue selected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Take off the page' })).toBeTruthy();
  });

  it('asks before taking a service off the page, naming it, with a red button', async () => {
    await renderGrid();
    await press(screen.getByRole('button', { name: 'Select' }));
    await press(screen.getByLabelText('Balayage'));
    expect(screen.getByText('1 service picked')).toBeTruthy();
    await press(screen.getByRole('button', { name: 'Take off the page' }));
    // Every venue's line says so, and the count of calendar changes stays at none.
    expect(screen.getAllByText('Coming off the page')).toHaveLength(2);
    await press(screen.getByRole('button', { name: 'Save 1 change' }));
    expect(screen.getByText('Take Balayage off the page?')).toBeTruthy();
    expect(
      screen.getByText(
        'Take off the page: Balayage. Guests will no longer be able to book it at any venue. Bookings already made are not changed.',
      ),
    ).toBeTruthy();
    await press(screen.getByRole('button', { name: 'Take it off the page' }));
    expect(bulkCalls()[0]?.body).toEqual({ ops: [{ op: 'withdraw', service_id: 's1' }] });
  });

  // Regression (CQ-04): a refusal that will only repeat was kept for another Save, for ever.
  it('lists each failure as what and where, and drops one that will be refused again', async () => {
    mockHandler = (call) =>
      call.path.endsWith('/bulk')
        ? { results: [{ index: 0, ok: false, code: 'COLLECTIVE_NOT_ON_PAGE', message: 'That service is not on the collective page.' }] }
        : {};
    await renderGrid();
    await press(screen.getByRole('button', { name: 'Select' }));
    await press(screen.getByLabelText('Balayage'));
    await press(screen.getByRole('button', { name: 'Take off the page' }));
    await press(screen.getByRole('button', { name: 'Save 1 change' }));
    await press(screen.getByRole('button', { name: 'Take it off the page' }));
    expect(screen.getByText('1 change did not go through:')).toBeTruthy();
    expect(screen.getByText('• Balayage: That service is not on the collective page.')).toBeTruthy();
    expect(screen.queryByText(/still here, so Save sends/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save 1 change' })).toBeNull();
  });

  it('counts what needs attention on the filter (CQ-13)', async () => {
    await renderGrid();
    expect(screen.getByText('Needs attention')).toBeTruthy();
    await act(async () => {
      mockSetServices?.([...startServices(), { id: 's5', name: 'Gloss', collective: block('master', 'item-5') }]);
    });
    expect(screen.getByText('Needs attention (1)')).toBeTruthy();
  });
});

describe("a service's sheet", () => {
  // Regression (CQ-04): the removal came back as "1 change did not go through" with no way to
  // say yes, and Save sent it again to be refused again.
  it('shows the bookings a removal would leave, and takes it off with only that change acknowledged', async () => {
    mockHandler = (call) => {
      if (!call.path.endsWith('/bulk')) return {};
      if (call.body?.acknowledge_affected) return everyOk(call);
      return {
        results: [
          {
            index: 0,
            ok: false,
            code: 'COLLECTIVE_AFFECTED_BOOKINGS',
            message: 'That calendar has bookings for this service.',
            affected_bookings: [{ booking_date: '2026-11-03', booking_time: '10:30:00', calendar_id: 'c1' }],
            affected_count: 1,
          },
        ],
      };
    };
    await renderGrid();
    await press(screen.getByLabelText('Balayage'));
    await act(async () => {
      fireEvent(screen.getByLabelText('Ada at Host Venue'), 'valueChange', false);
    });
    await press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Ada has upcoming bookings for Balayage')).toBeTruthy();
    expect(screen.getByText(/^Ada at Host Venue, Balayage: Tue 3 Nov/)).toBeTruthy();
    expect(screen.queryByText(/did not go through/)).toBeNull();
    await press(screen.getByRole('button', { name: 'Take it off and keep these bookings' }));
    expect(bulkCalls()).toHaveLength(2);
    expect(bulkCalls()[1]?.body).toEqual({
      ops: [{ op: 'unassign', service_id: 's1', venue_id: 'v-host', calendar_id: 'c1' }],
      acknowledge_affected: true,
    });
    // Done, so the sheet has closed.
    expect(screen.queryByText('Ada has upcoming bookings for Balayage')).toBeNull();
    expect(screen.queryByText('Calendars that offer this service')).toBeNull();
  });

  it('sends nothing more for Keep offering it, and the calendar keeps the service', async () => {
    mockHandler = (call) =>
      call.path.endsWith('/bulk')
        ? { results: [{ index: 0, ok: false, code: 'COLLECTIVE_AFFECTED_BOOKINGS', message: 'Bookings.' }] }
        : {};
    await renderGrid();
    await press(screen.getByLabelText('Balayage'));
    await act(async () => {
      fireEvent(screen.getByLabelText('Ada at Host Venue'), 'valueChange', false);
    });
    await press(screen.getByRole('button', { name: 'Save' }));
    // An older server sends no dates: the step still names the calendar and service.
    expect(screen.getByText('Balayage, Ada at Host Venue')).toBeTruthy();
    await press(screen.getByRole('button', { name: 'Keep offering it' }));
    expect(bulkCalls()).toHaveLength(1);
    expect(screen.getByLabelText('Ada at Host Venue').props.value).toBe(true);
    expect(screen.queryByText('Not saved yet: will stop offering')).toBeNull();
  });

  // Regression (CQ-10.8): Put on the page staged the change and said "Save from the bar at the
  // bottom of the page" while the sheet covered the bar.
  it('puts a service on the page once asked, straight away, and stays open on its calendars', async () => {
    mockHandler = (call) => {
      if (call.path === '/api/venue/collectives/col-1/offerings' && call.method === 'POST') {
        mockSetServices?.([
          { id: 's1', name: 'Balayage', collective: block('master', 'item-1') },
          { id: 's2', name: 'Parked cut', collective: block('master', 'item-2') },
        ]);
        return {
          item_id: 'item-2',
          links: [{ venue_id: 'v-zen', venue_name: 'Zen Studio', status: 'current', calendar_count: 0 }],
          host_calendar_count: 0,
          pending: [],
          calendars: { assigned: 0, not_ready: [], failed: [] },
        };
      }
      return {};
    };
    await renderGrid();
    await press(screen.getByLabelText('Parked cut'));
    expect(screen.getByText('Not on the page. Add it to the page to choose its calendars.')).toBeTruthy();
    await press(screen.getByRole('button', { name: 'Put on the page' }));
    expect(screen.getByText('Add Parked cut to the Northside page?')).toBeTruthy();
    expect(
      screen.getByText(
        'Parked cut is set up at Zen Studio with your settings, and you control it for every venue. Next, choose which of their calendars offer it.',
      ),
    ).toBeTruthy();
    expect(mockCalls).toHaveLength(0);
    await press(screen.getByRole('button', { name: 'Add to the page' }));
    expect(mockCalls).toEqual([
      { path: '/api/venue/collectives/col-1/offerings', method: 'POST', body: { service_id: 's2' } },
    ]);
    expect(bulkCalls()).toHaveLength(0);
    expect(screen.getByText('Added to the Northside page and set up at Zen Studio.')).toBeTruthy();
    expect(screen.getByText('Zen Studio does not offer it on any calendar yet.')).toBeTruthy();
    expect(screen.getByText('Calendars that offer this service')).toBeTruthy();
    expect(screen.getByLabelText('Cy at Zen Studio')).toBeTruthy();
    expect(screen.queryByText(/Save from the bar/)).toBeNull();
  });

  it('takes a service off the page once asked, with the withdraw wording', async () => {
    await renderGrid();
    await press(screen.getByLabelText('Balayage'));
    await press(screen.getByRole('button', { name: 'Take off the page' }));
    expect(screen.getByText('Take Balayage off the Northside page?')).toBeTruthy();
    expect(screen.getByText(/^Guests will no longer see Balayage on the Northside page\. At Zen Studio it becomes a retired service/)).toBeTruthy();
    await press(screen.getByRole('button', { name: 'Go back' }));
    expect(mockCalls).toHaveLength(0);
    await press(screen.getByRole('button', { name: 'Take off the page' }));
    await press(screen.getByRole('button', { name: 'Take off the page' }));
    expect(mockCalls).toEqual([{ path: '/api/venue/collectives/col-1/offerings/item-1', method: 'DELETE', body: undefined }]);
    expect(screen.getByText('Taken off the Northside page.')).toBeTruthy();
  });

  it("shows the server's sentence when putting it on the page is refused", async () => {
    const { ApiError } = jest.requireActual('@/lib/api/client');
    mockHandler = (call) => {
      if (call.path.endsWith('/offerings')) throw new ApiError('Only one of your own services can go on the collective page.', 409);
      return {};
    };
    await renderGrid();
    await press(screen.getByLabelText('Parked cut'));
    await press(screen.getByRole('button', { name: 'Put on the page' }));
    await press(screen.getByRole('button', { name: 'Add to the page' }));
    expect(screen.getByText('Only one of your own services can go on the collective page.')).toBeTruthy();
    expect(screen.getByText('Not on the page. Add it to the page to choose its calendars.')).toBeTruthy();
  });
});

describe('Undo (CQ-11)', () => {
  // Regression: a save from the grid could not be undone.
  it("puts back the last save for a minute, with a removed calendar's own price", async () => {
    await renderGrid();
    await press(screen.getByLabelText('Balayage'));
    await act(async () => {
      fireEvent(screen.getByLabelText('Ada at Host Venue'), 'valueChange', false);
    });
    await press(screen.getByRole('button', { name: 'Save' }));
    expect(bulkCalls()[0]?.body).toEqual({ ops: [{ op: 'unassign', service_id: 's1', venue_id: 'v-host', calendar_id: 'c1' }] });
    expect(screen.getByText('Saved 1 change.')).toBeTruthy();
    await press(screen.getByRole('button', { name: /^Undo \(\d+s\)$/ }));
    expect(bulkCalls()[1]?.body).toEqual({
      ops: [{ op: 'assign', service_id: 's1', venue_id: 'v-host', calendar_id: 'c1', values: { custom_price_pence: 4500 } }],
    });
    expect(screen.getByText('Undone. Everything from that save is back as it was.')).toBeTruthy();
    expect(screen.queryByText('Saved 1 change.')).toBeNull();
  });

  it('goes after 60 seconds', async () => {
    jest.useFakeTimers();
    try {
      await renderGrid();
      await press(screen.getByLabelText('Balayage'));
      await act(async () => {
        fireEvent(screen.getByLabelText('Ben at Host Venue'), 'valueChange', true);
      });
      await press(screen.getByRole('button', { name: 'Save' }));
      expect(screen.getByRole('button', { name: 'Undo (60s)' })).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(30_000);
      });
      expect(screen.getByRole('button', { name: 'Undo (30s)' })).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(31_000);
      });
      expect(screen.queryByRole('button', { name: /^Undo/ })).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('What needs you opens a venue (CQ-10.7)', () => {
  it("opens Choose calendars for that venue's calendars and the services on the page, and lets the venue go after", async () => {
    await renderGrid();
    await press(screen.getByRole('button', { name: 'Focus Zen Studio' }));
    expect(screen.getByText('For Balayage.')).toBeTruthy();
    expect(screen.getByLabelText('Cy at Zen Studio')).toBeTruthy();
    expect(screen.queryByLabelText('Ada at Host Venue')).toBeNull();
    expect(screen.queryByText(/of the services you picked are not on the page/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Take off the page' })).toBeNull();
    await press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('For Balayage.')).toBeNull();
    expect(screen.queryByText('Zen Studio picked')).toBeNull();
  });
});
