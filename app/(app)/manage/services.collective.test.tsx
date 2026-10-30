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
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

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
    venue: mockVenue,
    isLoading: false,
    refetch: jest.fn(),
  }),
}));
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
let mockServicesResponse: unknown = null;
/** A write's answer, by test: return undefined for the default, or throw to refuse it. */
let mockWrite: (call: Call) => unknown = () => undefined;
let mockVenue = {
  id: 'v-host',
  slug: 'bright',
  currency: 'GBP',
  current_user_role: 'admin',
  feature_flags: { resolved: {} },
};
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: (path: string, options: { method?: string; body?: string } = {}) => {
    const method = options.method ?? 'GET';
    mockCalls.push({ path, method, body: options.body ? JSON.parse(options.body) : undefined });
    if (method === 'GET' && path === '/api/venue/appointment-services') return Promise.resolve(mockServicesResponse);
    if (method === 'GET' && path.startsWith('/api/venue/practitioners')) {
      const active = { id: 'cal-a', name: 'Amy', is_active: true, sort_order: 0 };
      // The whole roster, asked for without `active_only`, has a switched-off calendar too.
      return Promise.resolve({
        practitioners: path.includes('active_only')
          ? [active]
          : [active, { id: 'cal-z', name: 'Zoe', is_active: false, sort_order: 1 }],
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
    try {
      const answer = mockWrite({ path, method, body: options.body ? JSON.parse(options.body) : undefined });
      if (answer !== undefined) return Promise.resolve(answer);
    } catch (e) {
      return Promise.reject(e);
    }
    return Promise.resolve({ ok: true });
  },
}));

import { ApiError } from '@/lib/api/client';

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

async function renderTheScreen() {
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
}

async function openTheForm() {
  await renderTheScreen();
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
  mockWrite = () => undefined;
  mockVenue = { ...mockVenue, current_user_role: 'admin' };
  mockToastSuccess.mockClear();
  mockToastError.mockClear();
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

// ---------------------------------------------------------------------------
// Page controls on the Services screen (CQ-10.2, CQ-13, CQ-05, CQ-12, CQ-11)
// ---------------------------------------------------------------------------

type Fixture = ReturnType<typeof servicesResponse>;
const fixture = () => mockServicesResponse as Fixture;
const master = () => fixture().services[0]!;

/** A second service of the host's, parked: its own, not on the page. */
function withParkedService(over: Record<string, unknown> = {}) {
  const response = servicesResponse();
  response.services.push({
    ...response.services[0]!,
    id: 's2',
    name: 'Gents cut',
    staff_may_customize_price: false,
    collective: { ...response.services[0]!.collective, role: 'parked', item_id: null, ...over },
  } as never);
  mockServicesResponse = response;
}

const pageOption = (service: string, option: 'On the page' | 'Not on the page') =>
  within(screen.getByLabelText(`On the Northside page: ${service}`)).getByRole('radio', { name: option });
const writes = (fragment: string) => mockCalls.filter((c) => c.method !== 'GET' && c.path.includes(fragment));
const pressName = async (name: string) => {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
};

describe('the page control on a host card', () => {
  it('shows On the page or Not on the page on every one of the host\'s own services', async () => {
    withParkedService();
    await renderTheScreen();
    await screen.findByText('Gents cut');
    expect(pageOption('Balayage', 'On the page').props.accessibilityState?.selected).toBe(true);
    expect(pageOption('Gents cut', 'Not on the page').props.accessibilityState?.selected).toBe(true);
    // Choosing what it already is does nothing.
    await act(async () => {
      fireEvent.press(pageOption('Balayage', 'On the page'));
    });
    expect(screen.queryByText('Take Balayage off the Northside page?')).toBeNull();
  });

  it("is not on a member's cards", async () => {
    const response = servicesResponse();
    response.services[0]!.collective = { ...response.services[0]!.collective, role: 'replica', venue_role: 'member' };
    mockServicesResponse = { ...response, collective_calendars: undefined };
    await renderTheScreen();
    await screen.findByText('Balayage');
    expect(screen.queryByLabelText('On the Northside page: Balayage')).toBeNull();
  });

  it('asks before a service goes on the page, then says where it went, with Choose calendars', async () => {
    withParkedService();
    mockWrite = (call) => {
      if (!call.path.endsWith('/offerings')) return undefined;
      const parked = fixture().services[1]!;
      parked.collective = { ...parked.collective, role: 'master', item_id: 'item-2' };
      return {
        item_id: 'item-2',
        host_calendar_count: 1,
        links: [{ venue_id: 'v-member', venue_name: 'Light 3', status: 'current', calendar_count: 0 }],
      };
    };
    await renderTheScreen();
    await screen.findByText('Gents cut');
    await act(async () => {
      fireEvent.press(pageOption('Gents cut', 'On the page'));
    });
    expect(screen.getByText('Add Gents cut to the Northside page?')).toBeTruthy();
    expect(
      screen.getByText(
        'Gents cut is set up at Light 3 with your settings, and you control it for every venue. Next, choose which of their calendars offer it.',
      ),
    ).toBeTruthy();
    expect(writes('/offerings')).toEqual([]);

    await pressName('Add to the page');
    expect(writes('/offerings')).toEqual([
      { path: '/api/venue/collectives/col-1/offerings', method: 'POST', body: { service_id: 's2' } },
    ]);
    expect(await screen.findByText('Added to the Northside page and set up at Light 3.')).toBeTruthy();
    expect(screen.getByText('Light 3 does not offer it on any calendar yet.')).toBeTruthy();

    // Choose calendars opens the service's form, which now lists every venue's calendars.
    await pressName('Choose calendars');
    expect(screen.getByText('Edit service')).toBeTruthy();
    expect(screen.getByLabelText('Nia at Light 3')).toBeTruthy();
    expect(screen.queryByTestId('page-note')).toBeNull();
  });

  it('says it goes back with its own calendars when it was on the page before', async () => {
    withParkedService({ was_on_page: true });
    await renderTheScreen();
    await screen.findByText('Gents cut');
    await act(async () => {
      fireEvent.press(pageOption('Gents cut', 'On the page'));
    });
    expect(
      screen.getByText(
        'Gents cut goes back on the page at Light 3 with your settings. Calendars that offered it before offer it again straight away, with their own prices and times.',
      ),
    ).toBeTruthy();
  });

  it('asks before a service comes off, and Go back sends nothing', async () => {
    await renderTheScreen();
    await screen.findByText('Balayage');
    await act(async () => {
      fireEvent.press(pageOption('Balayage', 'Not on the page'));
    });
    expect(screen.getByText('Take Balayage off the Northside page?')).toBeTruthy();
    await pressName('Go back');
    expect(writes('/offerings')).toEqual([]);

    await act(async () => {
      fireEvent.press(pageOption('Balayage', 'Not on the page'));
    });
    await pressName('Take off the page');
    expect(writes('/offerings')).toEqual([
      { path: '/api/venue/collectives/col-1/offerings/item-1', method: 'DELETE', body: undefined },
    ]);
    expect(await screen.findByText('Taken off the Northside page.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Choose calendars' })).toBeNull();
  });

  it("shows the route's sentence when it refuses", async () => {
    withParkedService();
    mockWrite = (call) => {
      if (call.path.endsWith('/offerings')) {
        throw new ApiError('Light 3 has not agreed yet.', 409, { error: 'Light 3 has not agreed yet.' });
      }
      return undefined;
    };
    await renderTheScreen();
    await screen.findByText('Gents cut');
    await act(async () => {
      fireEvent.press(pageOption('Gents cut', 'On the page'));
    });
    await pressName('Add to the page');
    expect(await screen.findByText('Light 3 has not agreed yet.')).toBeTruthy();
    // The question has gone, and the card still says where the service is.
    expect(screen.queryByText('Add Gents cut to the Northside page?')).toBeNull();
    expect(pageOption('Gents cut', 'Not on the page').props.accessibilityState?.selected).toBe(true);
  });
});

describe('a new service at a host', () => {
  const openNew = async () => {
    await renderTheScreen();
    await screen.findByText('Balayage');
    await pressName('New service');
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Name'), 'Fade');
    });
  };
  const tick = () => screen.getByRole('checkbox', { name: 'Show on the Northside page' });

  beforeEach(() => {
    mockWrite = (call) => (call.method === 'POST' && call.path === '/api/venue/appointment-services' ? { id: 'new-1' } : undefined);
  });

  it('goes on the page after it is created, with the calendars ticked at other venues', async () => {
    await openNew();
    expect(tick().props.accessibilityState?.checked).toBe(true);
    expect(
      screen.getByText(
        'Sets it up at Light 3 too, with your settings. Choose below which calendars offer it at each venue. If you untick this, the service is parked while Northside is live.',
      ),
    ).toBeTruthy();
    // Every venue's calendars, in place of the venue's own list.
    expect(screen.queryByText('Offered by')).toBeNull();
    await act(async () => {
      fireEvent(screen.getByLabelText('Nia at Light 3'), 'valueChange', true);
    });
    await pressName('Create service');
    const created = writes('/api/venue/appointment-services')[0]?.body as Record<string, unknown>;
    expect(created.practitioner_ids).toEqual(['cal-a']);
    expect(writes('/offerings')).toEqual([
      {
        path: '/api/venue/collectives/col-1/offerings',
        method: 'POST',
        body: { service_id: 'new-1', calendars: [{ venue_id: 'v-member', calendar_id: 'cal-n' }] },
      },
    ]);
    expect(await screen.findByText('Added to the Northside page.')).toBeTruthy();
  });

  it('ticks every calendar with "All calendars at every venue"', async () => {
    await openNew();
    await act(async () => {
      fireEvent.press(screen.getByRole('checkbox', { name: 'All calendars at every venue' }));
    });
    await pressName('Create service');
    const created = writes('/api/venue/appointment-services')[0]?.body as Record<string, unknown>;
    expect(created.practitioner_ids).toEqual(['cal-a']);
    expect((writes('/offerings')[0]?.body as { calendars: unknown[] }).calendars).toEqual([
      { venue_id: 'v-member', calendar_id: 'cal-m' },
      { venue_id: 'v-member', calendar_id: 'cal-n' },
    ]);
  });

  it('may be offered only at other venues, with none of the host\'s calendars ticked', async () => {
    await openNew();
    await act(async () => {
      fireEvent(screen.getByLabelText('Amy at Bright Cuts'), 'valueChange', false);
    });
    await pressName('Create service');
    expect(screen.queryByText('Select at least one calendar to offer this service.')).toBeNull();
    expect((writes('/api/venue/appointment-services')[0]?.body as Record<string, unknown>).practitioner_ids).toEqual([]);
  });

  it('stays parked when unticked: the plain list comes back, and no offer is sent', async () => {
    await openNew();
    await act(async () => {
      fireEvent.press(tick());
    });
    expect(screen.getByText('Offered by')).toBeTruthy();
    expect(screen.queryByLabelText('Nia at Light 3')).toBeNull();
    await pressName('Create service');
    expect(writes('/api/venue/appointment-services')).toHaveLength(1);
    expect(writes('/offerings')).toEqual([]);
  });

  it('is kept when the offer is refused, and says so', async () => {
    const created = mockWrite;
    mockWrite = (call) => {
      if (call.path.endsWith('/offerings')) throw new ApiError('No', 409, { error: 'No' });
      return created(call);
    };
    await openNew();
    await pressName('Create service');
    expect(await screen.findByText('Could not add Fade to the Northside page. Please try again.')).toBeTruthy();
    // The form has closed: the service was saved.
    expect(screen.queryByRole('button', { name: 'Create service' })).toBeNull();
  });

  it('locks the name and description ticks while it is going on the page', async () => {
    await openNew();
    await act(async () => {
      fireEvent.press(screen.getByText('Staff override permissions'));
    });
    expect(screen.getByLabelText('Staff may change: Display name').props.disabled).toBe(true);
    expect(screen.getByLabelText('Staff may change: Description').props.disabled).toBe(true);
    expect(
      screen.getByText(
        'Not available for services on the Northside page, so guests see the same name and description on every calendar.',
      ),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(tick());
    });
    expect(screen.getByLabelText('Staff may change: Display name').props.disabled).toBe(false);
  });
});

describe('switching a permission off with values set (found on the phone, 2026-10-30)', () => {
  it('asks first, naming each calendar, and Go back sends nothing', async () => {
    master().staff_may_customize_price = true;
    const calendar = fixture().collective_calendars![1]!.calendars[0]!;
    calendar.assigned[0]!.values = { ...calendar.assigned[0]!.values, custom_price_pence: 1500 } as never;
    await openTheForm();
    await act(async () => {
      fireEvent.press(screen.getByText('Staff override permissions'));
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Staff may change: Price'), 'valueChange', false);
    });
    await pressName('Save changes');
    expect(patches()).toEqual([]);
    expect(screen.getByText("Clear calendars' own values?")).toBeTruthy();
    expect(screen.getByText('Mo at Light 3: price')).toBeTruthy();

    await pressName('Go back');
    expect(patches()).toEqual([]);

    await pressName('Save changes');
    await pressName('Clear and save');
    expect((patches()[0]?.body as Record<string, unknown>).staff_may_customize_price).toBe(false);
  });

  it('asks nothing when no calendar has its own value', async () => {
    master().staff_may_customize_price = true;
    await openTheForm();
    await act(async () => {
      fireEvent.press(screen.getByText('Staff override permissions'));
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Staff may change: Price'), 'valueChange', false);
    });
    await pressName('Save changes');
    expect(screen.queryByText("Clear calendars' own values?")).toBeNull();
    expect(patches()).toHaveLength(1);
  });
});

describe('switching a page service off (CQ-13)', () => {
  it('reads "Switched on at every venue" and asks first, naming every venue, and Go back sends nothing', async () => {
    await openTheForm();
    expect(screen.getByText('Switched on at every venue')).toBeTruthy();
    expect(screen.queryByText('Active (visible to clients)')).toBeNull();
    await act(async () => {
      fireEvent(screen.getByLabelText('Switched on at every venue'), 'valueChange', false);
    });
    await pressName('Save changes');
    expect(patches()).toEqual([]);
    expect(screen.getByText('Switch off Balayage at every venue?')).toBeTruthy();
    expect(
      screen.getByText(
        'Guests will not be able to book Balayage on the Northside page, at your venue or at Light 3. Bookings already made are not changed. You can switch it on again at any time.',
      ),
    ).toBeTruthy();

    await pressName('Go back');
    expect(patches()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();

    await pressName('Save changes');
    await pressName('Switch off at every venue');
    expect((patches()[0]?.body as Record<string, unknown>).is_active).toBe(false);
    expect(mockToastSuccess).toHaveBeenCalledWith(
      'Balayage is switched off at every venue. Bookings already made are not changed.',
    );
  });

  it('asks nothing when it is switched on, and says it is on again', async () => {
    master().is_active = false;
    await openTheForm();
    await act(async () => {
      fireEvent(screen.getByLabelText('Switched on at every venue'), 'valueChange', true);
    });
    await pressName('Save changes');
    expect(screen.queryByText('Switch off Balayage at every venue?')).toBeNull();
    expect(mockToastSuccess).toHaveBeenCalledWith('Balayage is on again at every venue in Northside.');
  });

  it("asks nothing about the host's own service outside the page", async () => {
    const response = servicesResponse();
    mockServicesResponse = {
      ...response,
      services: response.services.map(({ collective: _c, ...s }) => s),
      collective_calendars: undefined,
    };
    await openTheForm();
    await act(async () => {
      fireEvent(screen.getByLabelText('Active (visible to clients)'), 'valueChange', false);
    });
    await pressName('Save changes');
    expect(screen.queryByText('Switch off Balayage at every venue?')).toBeNull();
    expect((patches()[0]?.body as Record<string, unknown>).is_active).toBe(false);
  });

  it('says on the card that nobody can book it, naming the venues, with Switch it on', async () => {
    master().is_active = false;
    await renderTheScreen();
    await act(async () => {
      fireEvent.press(await screen.findByText('Balayage'));
    });
    expect(
      screen.getByText('Switched off, so nobody can book it on the Northside page or at Light 3.'),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(within(screen.getByTestId('services-row-s1')).getByRole('button', { name: 'Switch it on' }));
    });
    expect(patches()[0]?.body).toEqual({ id: 's1', is_active: true });
    expect(mockToastSuccess).toHaveBeenCalledWith('Balayage is on again at every venue in Northside.');
  });

  it('switches it on from What needs you too', async () => {
    master().is_active = false;
    await renderTheScreen();
    await screen.findByText('Balayage is switched off on your Services page, so nobody can book it at any venue.');
    await pressName('Switch it on');
    expect(patches()[0]?.body).toEqual({ id: 's1', is_active: true });
  });
});

describe('options and calendar values (CQ-12)', () => {
  it('locks price, length and buffer for staff once a service has options, and saves them off', async () => {
    master().variants = [
      { id: 'o1', name: 'Short', duration_minutes: 60, buffer_minutes: 0, price_pence: 5000, is_active: true },
    ] as never;
    await openTheForm();
    await act(async () => {
      fireEvent.press(screen.getByText('Staff override permissions'));
    });
    for (const label of ['Price', 'Duration', 'Buffer time']) {
      const box = screen.getByLabelText(`Staff may change: ${label}`);
      expect(box.props.disabled).toBe(true);
      expect(box.props.value).toBe(false);
    }
    expect(screen.getByLabelText('Staff may change: Deposit').props.disabled).toBe(false);
    expect(
      screen.getByText(
        'Not available for services with options. Each option sets its own price, length and buffer, the same on every calendar.',
      ),
    ).toBeTruthy();
    await pressName('Save changes');
    const body = patches()[0]?.body as Record<string, unknown>;
    expect(body.staff_may_customize_price).toBe(false);
    expect(body.staff_may_customize_duration).toBe(false);
    expect(body.staff_may_customize_buffer).toBe(false);
  });
});

describe('Put it back on the Services screen (CQ-11)', () => {
  const syncFor = (id: string) => ({ venues: 1, applied: 1, pending: [], failed: [], audit_event_id: id });

  it('offers it after a save, and sends the values the save cleared', async () => {
    mockWrite = (call) =>
      call.method === 'PATCH'
        ? {
            collective_sync: syncFor('audit-1'),
            cleared_values: [{ calendar_id: 'cal-m', service_id: 'replica-1', values: { custom_price_pence: 4500 } }],
          }
        : call.path.endsWith('/undo')
          ? { values_restored: [{ calendar_id: 'cal-m', service_id: 'replica-1' }], values_not_restored: [] }
          : undefined;
    await openTheForm();
    await pressName('Save changes');
    expect(await screen.findByText('Saved. Balayage is up to date at Light 3.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /^Put it back \(\d+s\)$/ }));
    });
    expect(writes('/undo')).toEqual([
      {
        path: '/api/venue/collectives/col-1/undo',
        method: 'POST',
        body: {
          audit_event_id: 'audit-1',
          restore_values: [{ calendar_id: 'cal-m', service_id: 'replica-1', values: { custom_price_pence: 4500 } }],
        },
      },
    ]);
    expect(
      await screen.findByText(
        "We put Balayage's settings back at every venue. The calendars' own values that save cleared are back too.",
      ),
    ).toBeTruthy();
  });

  it('gives a second save its own Put it back', async () => {
    let saves = 0;
    mockWrite = (call) => {
      if (call.method === 'PATCH') {
        saves += 1;
        return { collective_sync: syncFor(`audit-${saves}`) };
      }
      return undefined;
    };
    await openTheForm();
    await pressName('Save changes');
    await act(async () => {
      fireEvent.press(await screen.findByRole('button', { name: /^Put it back/ }));
    });
    expect((writes('/undo')[0]?.body as { audit_event_id: string }).audit_event_id).toBe('audit-1');
    expect(await screen.findByText("We put Balayage's settings back at every venue.")).toBeTruthy();

    await pressName('Edit');
    await pressName('Save changes');
    await act(async () => {
      fireEvent.press(await screen.findByRole('button', { name: /^Put it back/ }));
    });
    expect((writes('/undo')[1]?.body as { audit_event_id: string }).audit_event_id).toBe('audit-2');
  });

  it('says the calendar changes stay when the save changed calendars too', async () => {
    mockWrite = (call) => (call.method === 'PATCH' ? { collective_sync: syncFor('audit-1') } : undefined);
    await openTheForm();
    await act(async () => {
      fireEvent(screen.getByLabelText('Nia at Light 3'), 'valueChange', true);
    });
    await pressName('Save changes');
    await act(async () => {
      fireEvent.press(await screen.findByRole('button', { name: /^Put it back/ }));
    });
    expect(
      await screen.findByText(
        "We put Balayage's settings back at every venue. The calendar changes from that save stay as they are.",
      ),
    ).toBeTruthy();
  });

  it('shows nothing for a save the server says nothing about', async () => {
    await openTheForm();
    await pressName('Save changes');
    expect(screen.queryByTestId('service-save-summary')).toBeNull();
  });
});

describe('Choose calendars for a service at a member (CQ-06)', () => {
  it("opens the member's sheet with a switched-off calendar, and saves only what changes", async () => {
    const response = servicesResponse();
    response.services[0]!.collective = { ...response.services[0]!.collective, role: 'replica', venue_role: 'member' };
    response.practitioner_services.push({ practitioner_id: 'cal-z', service_id: 's1' });
    mockServicesResponse = { ...response, collective_calendars: undefined };
    await renderTheScreen();
    await act(async () => {
      fireEvent.press(await screen.findByText('Balayage'));
    });
    await pressName('View');
    expect(await screen.findByLabelText('Remove Zoe')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Remove Zoe'));
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Amy offers Balayage'), 'valueChange', false);
    });
    await pressName('Save your settings');
    expect(patches()[0]?.body).toEqual({ id: 's1', calendars: { add: [], remove: ['cal-a', 'cal-z'] } });
  });
});
