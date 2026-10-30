/**
 * What a host reads after saving a page service (web `CollectiveSaveSummary`, CQ-11): how far it
 * reached, Put it back for its minute, and what came back. The undo route answers 410 once the
 * minute is over.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import { ApiError } from '@/lib/api/client';

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

import { ServiceSaveSummary } from './ServiceSaveSummary';

type Props = ComponentProps<typeof ServiceSaveSummary>;
const props = (over: Partial<Props> = {}): Props => ({
  savedAt: Date.now(),
  sync: { venues: 1, applied: 1, pending: [], failed: [], audit_event_id: 'audit-1' },
  serviceName: 'Balayage',
  collectiveId: 'col-1',
  venueNames: ['Light 3'],
  calendarsChanged: false,
  clearedValues: [],
  ...over,
});

async function renderCard(p: Props) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <ServiceSaveSummary {...p} />
      </QueryClientProvider>,
    );
  });
}

const putItBack = () => screen.getByRole('button', { name: /^Put it back \(\d+s\)$/ });

beforeEach(() => {
  mockCalls.length = 0;
  mockHandler = () => ({});
});

describe('ServiceSaveSummary', () => {
  it('says how far the save reached and sends the audit row with Put it back', async () => {
    await renderCard(props());
    expect(screen.getByText('Saved. Balayage is up to date at Light 3.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(putItBack());
    });
    expect(mockCalls).toEqual([
      { path: '/api/venue/collectives/col-1/undo', method: 'POST', body: { audit_event_id: 'audit-1' } },
    ]);
    expect(screen.getByText("We put Balayage's settings back at every venue.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Put it back/ })).toBeNull();
  });

  it('names the values that could not come back', async () => {
    mockHandler = () => ({ values_not_restored: [{ calendar_id: 'cal-m', service_id: 'r1' }] });
    await renderCard(
      props({
        clearedValues: [
          { calendar_id: 'cal-m', service_id: 'r1', values: { custom_price_pence: 4500 }, label: 'Mo at Light 3 (price)' },
        ],
      }),
    );
    await act(async () => {
      fireEvent.press(putItBack());
    });
    expect((mockCalls[0]?.body as { restore_values: unknown[] }).restore_values).toEqual([
      { calendar_id: 'cal-m', service_id: 'r1', values: { custom_price_pence: 4500 } },
    ]);
    expect(
      screen.getByText(
        "We put Balayage's settings back at every venue. These could not be put back, so set them again with Edit values: Mo at Light 3 (price).",
      ),
    ).toBeTruthy();
  });

  it('says the change is part of the history once the route answers 410', async () => {
    mockHandler = () => {
      throw new ApiError('Too late', 410, { error: 'Too late' });
    };
    await renderCard(props());
    await act(async () => {
      fireEvent.press(putItBack());
    });
    expect(
      screen.getByText(
        'That change is now part of your history, so it cannot be undone here. Edit the service to change it again.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Put it back/ })).toBeNull();
  });

  it('keeps the offer when the request fails, and shows the refusal', async () => {
    mockHandler = () => {
      throw new ApiError('Not you', 403, { error: 'Only the host can do that.' });
    };
    await renderCard(props());
    await act(async () => {
      fireEvent.press(putItBack());
    });
    expect(screen.getByText('Not you')).toBeTruthy();
    expect(putItBack()).toBeTruthy();
  });

  it('offers nothing without an audit row, and still says what is behind', async () => {
    await renderCard(
      props({
        sync: { venues: 1, applied: 0, pending: [{ venue_id: 'v1', venue_name: 'Light 3' }], failed: [] },
      }),
    );
    expect(screen.getByText('Saved. Light 3 is updating. Its calendars take new bookings for Balayage again in a moment.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Put it back/ })).toBeNull();
  });

  it('goes after its minute when there is nothing more to say, counting from the save', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      await renderCard(props({ savedAt: Date.now() - 50_000 }));
      expect(screen.getByRole('button', { name: 'Put it back (10s)' })).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(11_000);
      });
      expect(screen.queryByTestId('service-save-summary')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
