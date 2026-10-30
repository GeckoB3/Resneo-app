/**
 * Choose calendars for the services picked (web `CollectiveBulkCalendarsDialog`; collectives QA
 * 2026-10-29, P3): taking calendars off asks first, naming who is left (CQ-11); a calendar with
 * upcoming bookings shows them here and only that removal goes again, acknowledged; a change that
 * can still go through stays chosen, and one that will repeat does not (CQ-04).
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

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
const block = (itemId: string) => ({
  role: 'master' as const,
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
const services: AreaService[] = [{ id: 's1', name: 'Balayage', collective: block('item-1') }];
// Ada offers Balayage, Ben does not; Cy at Zen Studio offers it too.
const groups: CollectiveCalendarGroup[] = [
  {
    venue_id: 'v-host',
    venue_name: 'Host Venue',
    is_host: true,
    sync,
    calendars: [
      { id: 'c1', name: 'Ada', is_active: true, assigned: [{ item_id: 'item-1', service_id: 's1', values, last_changed: null }] },
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

function Harness() {
  const grid = useServicesGrid({ collectiveId: 'col-1', collectiveName: 'Northside', services, groups });
  return (
    <View>
      <ServicesGridList grid={grid} currencySymbol="£" />
      <ServicesGridBar grid={grid} />
    </View>
  );
}

async function openPicker() {
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
  await press(screen.getByRole('button', { name: 'Select' }));
  await press(screen.getByLabelText('Balayage'));
  await press(screen.getByRole('button', { name: 'Choose calendars' }));
  expect(screen.getByText('For Balayage.')).toBeTruthy();
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

describe('BulkCalendarsSheet', () => {
  // Regression (CQ-11): taking calendars off saved at once, with no ask.
  it('asks before taking calendars off, naming each change and a venue left with nobody', async () => {
    await openPicker();
    await press(screen.getByLabelText('Ada at Host Venue'));
    await press(screen.getByRole('button', { name: 'Save 1 change' }));
    expect(bulkCalls()).toHaveLength(0);
    expect(screen.getByText('Take these calendars off?')).toBeTruthy();
    expect(screen.getByText('Balayage: Ada at Host Venue stops offering it.')).toBeTruthy();
    expect(screen.getByText('Nobody at Host Venue will offer Balayage.')).toBeTruthy();
    // Go back keeps the choice.
    await press(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByRole('button', { name: 'Save 1 change' })).toBeTruthy();
    await press(screen.getByRole('button', { name: 'Save 1 change' }));
    await press(screen.getByRole('button', { name: 'Take it off' }));
    expect(bulkCalls()[0]?.body).toEqual({ ops: [{ op: 'unassign', service_id: 's1', venue_id: 'v-host', calendar_id: 'c1' }] });
    expect(screen.queryByText('For Balayage.')).toBeNull();
  });

  it('says so when no calendar anywhere would offer it', async () => {
    await openPicker();
    await press(screen.getByLabelText('Ada at Host Venue'));
    await press(screen.getByLabelText('Cy at Zen Studio'));
    await press(screen.getByRole('button', { name: 'Save 2 changes' }));
    expect(screen.getByText('Nobody will be able to book Balayage at any venue.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Take them off' })).toBeTruthy();
  });

  // Regression (CQ-04): the refused removal was staged again, the picker read it as done, and Save
  // stayed disabled with no way to go ahead.
  it('shows the bookings here and takes off only those, acknowledged, after the rest saved', async () => {
    mockHandler = (call) => {
      if (!call.path.endsWith('/bulk')) return {};
      if (call.body?.acknowledge_affected) return everyOk(call);
      const ops = call.body?.ops as BulkOp[];
      return {
        results: ops.map((op, index) =>
          op.op === 'unassign'
            ? {
                index,
                ok: false,
                code: 'COLLECTIVE_AFFECTED_BOOKINGS',
                message: 'That calendar has bookings for this service.',
                affected_bookings: [
                  { booking_date: '2026-11-03', booking_time: '10:30:00', calendar_id: 'c1' },
                  { booking_date: '2026-11-04', booking_time: '11:00:00', calendar_id: 'c1' },
                ],
                affected_count: 2,
              }
            : { index, ok: true },
        ),
      };
    };
    await openPicker();
    await press(screen.getByLabelText('Ada at Host Venue'));
    await press(screen.getByLabelText('Ben at Host Venue'));
    await press(screen.getByRole('button', { name: 'Save 2 changes' }));
    await press(screen.getByRole('button', { name: 'Take it off' }));
    expect(screen.getByText('Ada has upcoming bookings for Balayage')).toBeTruthy();
    expect(screen.getByText('Your other changes are saved.')).toBeTruthy();
    expect(screen.getByText(/^Ada at Host Venue, Balayage: Tue 3 Nov.*, 10:30; Wed 4 Nov.*, 11:00$/)).toBeTruthy();
    await press(screen.getByRole('button', { name: 'Take it off and keep these bookings' }));
    expect(bulkCalls()).toHaveLength(2);
    expect(bulkCalls()[1]?.body).toEqual({
      ops: [{ op: 'unassign', service_id: 's1', venue_id: 'v-host', calendar_id: 'c1' }],
      acknowledge_affected: true,
    });
    expect(screen.queryByText('For Balayage.')).toBeNull();
    // Both went through, so one Undo puts back both.
    expect(screen.getByText('Saved 2 changes.')).toBeTruthy();
  });

  it('keeps a change that can still go through chosen, saying why, and lets one that will repeat go', async () => {
    mockHandler = (call) => {
      if (!call.path.endsWith('/bulk')) return {};
      const ops = call.body?.ops as BulkOp[];
      return {
        results: ops.map((op, index) =>
          op.venue_id === 'v-zen'
            ? { index, ok: false, code: 'COLLECTIVE_REPLICA_NOT_READY', message: 'Zen Studio is still being set up.' }
            : { index, ok: false, code: 'COLLECTIVE_NOT_ON_PAGE', message: 'That service is not on the collective page.' },
        ),
      };
    };
    await openPicker();
    await press(screen.getByRole('button', { name: 'Tick every calendar at Host Venue' }));
    await press(screen.getByLabelText('Cy at Zen Studio'));
    await press(screen.getByLabelText('Cy at Zen Studio'));
    // Ben goes on (Ada already offers it); Cy is cleared and ticked again, so it is unchanged.
    expect(screen.getByRole('button', { name: 'Save 1 change' })).toBeTruthy();
    await press(screen.getByLabelText('Cy at Zen Studio'));
    await press(screen.getByRole('button', { name: 'Save 2 changes' }));
    await press(screen.getByRole('button', { name: 'Take it off' }));
    expect(screen.getByText('2 changes did not go through:')).toBeTruthy();
    expect(screen.getByText('• Balayage, Ben at Host Venue: That service is not on the collective page.')).toBeTruthy();
    expect(screen.getByText('• Balayage, Cy at Zen Studio: Zen Studio is still being set up.')).toBeTruthy();
    expect(screen.getByText('They are still chosen here, so Save sends them again.')).toBeTruthy();
    // Only the one that can go through is counted for another Save.
    expect(screen.getByRole('button', { name: 'Save 1 change' })).toBeTruthy();
  });
});
