/**
 * The host's service form for a service on its collective page (web `AppointmentServicesView`,
 * 2026-10-28): calendars at every venue in place of "Offered by", ticked as a diff and sent with
 * the save as `collective_calendars`, and "Edit values" on any venue's calendar as a step of the
 * same sheet. A setting the values save turned on stays on in the form, so the form's own Save
 * does not turn it straight back off.
 *
 * The screen's own hooks run against a fake `apiFetch`. jest hoists mock factories above imports,
 * so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn(), replace: jest.fn(), setParams: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));
// Set up with AI is not opened here, and its image painter needs a native web view.
jest.mock('@/components/services-setup/ServicesSetupSheet', () => ({ ServicesSetupSheet: () => null }));
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
jest.mock('@/lib/haptics', () => ({
  hapticSuccess: jest.fn(),
  hapticWarning: jest.fn(),
  hapticTap: jest.fn(),
  hapticSelect: jest.fn(),
}));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: { id: 'v-host', slug: 'bright', currency: 'GBP', current_user_role: 'admin', feature_flags: { resolved: {} } },
    isLoading: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));

type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
let mockServicesResponse: unknown = null;
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: (path: string, options: { method?: string; body?: string } = {}) => {
    const method = options.method ?? 'GET';
    mockCalls.push({ path, method, body: options.body ? JSON.parse(options.body) : undefined });
    if (method === 'GET' && path === '/api/venue/appointment-services') return Promise.resolve(mockServicesResponse);
    if (method === 'GET' && path.startsWith('/api/venue/practitioners')) {
      return Promise.resolve({
        practitioners: [{ id: 'cal-a', name: 'Amy', is_active: true, sort_order: 0 }],
      });
    }
    if (method === 'GET' && path.startsWith('/api/venue/addon-groups')) {
      return Promise.resolve({ groups: [], addons_by_group: {}, service_links: [] });
    }
    if (method === 'GET' && path === '/api/venue/staff/me') return Promise.resolve({ staff: { id: 'st-1', linked_calendar_ids: [] } });
    if (method === 'PUT' && path.endsWith('/calendar-values')) {
      return Promise.resolve({ flags_turned_on: ['staff_may_customize_duration'] });
    }
    if (method === 'GET') return Promise.resolve(null);
    return Promise.resolve({ ok: true });
  },
}));

import ServicesScreen from './services';

const values = { custom_price_pence: null, custom_duration_minutes: null, custom_buffer_minutes: null, custom_deposit_pence: null };
const sync = { venues: 2, applied: 2, pending: [], failed: [] };

function servicesResponse() {
  return {
    services: [
      {
        id: 's1',
        name: 'Balayage',
        duration_minutes: 120,
        buffer_minutes: 0,
        price_pence: 9500,
        deposit_pence: 0,
        payment_requirement: 'none',
        is_active: true,
        staff_may_customize_price: true,
        variants: [],
        addon_groups: [],
        collective: {
          role: 'master',
          venue_role: 'host',
          collective_id: 'col-1',
          collective_name: 'Northside',
          host_venue_name: 'Bright Cuts',
          item_id: 'item-1',
          locked_fields: [],
          delegated_fields: [],
          status: 'up_to_date',
          status_reason: null,
          last_applied_at: null,
          hidden_reasons: [],
        },
      },
    ],
    practitioner_services: [{ practitioner_id: 'cal-a', service_id: 's1' }],
    categories: [],
    collective_calendars: [
      {
        venue_id: 'v-host',
        venue_name: 'Bright Cuts',
        is_host: true,
        sync,
        calendars: [{ id: 'cal-a', name: 'Amy', is_active: true, assigned: [{ item_id: 'item-1', service_id: 's1', values, last_changed: null }] }],
      },
      {
        venue_id: 'v-member',
        venue_name: 'Light 3',
        is_host: false,
        sync,
        calendars: [
          {
            id: 'cal-m',
            name: 'Mo',
            is_active: true,
            assigned: [{ item_id: 'item-1', service_id: 'replica-1', values, last_changed: null }],
          },
          { id: 'cal-n', name: 'Nia', is_active: true, assigned: [] },
        ],
      },
    ],
  };
}

async function openTheForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <ServicesScreen />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    fireEvent.press(await screen.findByText('Balayage'));
  });
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
  });
}

const patches = () => mockCalls.filter((c) => c.method === 'PATCH' && c.path.startsWith('/api/venue/appointment-services'));

beforeEach(() => {
  mockCalls.length = 0;
  mockServicesResponse = servicesResponse();
});

describe("the host's form for a page service", () => {
  it('ticks calendars at every venue in place of "Offered by", and sends them as a diff with the save', async () => {
    await openTheForm();
    expect(screen.getByText('Calendars that offer this service')).toBeTruthy();
    expect(screen.queryByText('Offered by')).toBeNull();
    await act(async () => {
      fireEvent(screen.getByLabelText('Nia at Light 3'), 'valueChange', true);
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Mo at Light 3'), 'valueChange', false);
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    });
    const body = patches()[0]?.body as Record<string, unknown>;
    expect(body.collective_calendars).toEqual({
      add: [{ calendar_id: 'cal-n', venue_id: 'v-member' }],
      remove: [{ calendar_id: 'cal-m', venue_id: 'v-member' }],
    });
    // The venue's own list is untouched, so it is not sent.
    expect(body).not.toHaveProperty('practitioner_ids');
  });

  it("edits a member calendar's values as a step, and keeps the setting it turned on", async () => {
    await openTheForm();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Edit values for Mo'));
    });
    expect(screen.getByText('Balayage on Mo')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Length (minutes)'), '90');
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    });
    expect(mockCalls).toContainEqual({
      path: '/api/venue/collectives/col-1/calendar-values',
      method: 'PUT',
      body: { calendar_id: 'cal-m', service_id: 'replica-1', values: { custom_duration_minutes: 90 } },
    });
    // Back on the form, which kept everything, and whose save keeps the setting on.
    expect(screen.queryByText('Balayage on Mo')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    });
    const body = patches()[0]?.body as Record<string, unknown>;
    expect(body.staff_may_customize_duration).toBe(true);
    expect(body.staff_may_customize_price).toBe(true);
    expect(body).not.toHaveProperty('collective_calendars');
  });
});

describe("an admin's own service, outside a collective", () => {
  it("edits one of its own calendars' values where the service allows it", async () => {
    const response = servicesResponse();
    mockServicesResponse = {
      ...response,
      services: response.services.map(({ collective: _c, ...s }) => s),
      collective_calendars: undefined,
    };
    await openTheForm();
    expect(screen.getByText('Offered by')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Edit values for Amy' }));
    });
    expect(screen.getByText('Balayage on Amy')).toBeTruthy();
    expect(screen.queryByLabelText('Length (minutes)')).toBeNull();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Price'), '85');
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    });
    expect(mockCalls).toContainEqual({
      path: '/api/venue/practitioner-service-overrides',
      method: 'PATCH',
      body: { service_id: 's1', calendar_id: 'cal-a', custom_price_pence: 8500 },
    });
  });
});
