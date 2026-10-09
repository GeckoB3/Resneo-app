/**
 * A host's service as the member reads it (web `MemberServiceView`): the three zones, a save that
 * sends only the member's own fields with the calendars it opened with, and the bookings question:
 * a 409 listing upcoming bookings turns the button into "Remove and keep bookings", and the next
 * save is acknowledged. A retired copy cannot be ticked.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ApiError } from '@/lib/api/client';
import type { ManagedService, ServiceCollectiveBlock } from '@/types/services-manage';

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
jest.mock('@/lib/queries/useComplianceRequirements', () => ({
  ...jest.requireActual('@/lib/queries/useComplianceRequirements'),
  useComplianceRequirements: () => ({
    data: {
      requirements: [
        { scope: 'service', appointment_service_id: 's1', service_item_id: null, compliance_type_name: 'Patch test' },
        { scope: 'venue', appointment_service_id: null, service_item_id: null, compliance_type_name: 'Consultation' },
      ],
    },
  }),
}));
// The collective area's pieces pull in hooks this suite never calls.
jest.mock('@/lib/queries/useCollectives', () => ({ useDissolveCollective: () => ({}) }));
jest.mock('@/lib/queries/useCollectiveArea', () => ({ useCollectiveMembersPatch: () => ({}) }));

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

import { MemberServiceSheet } from './MemberServiceSheet';

const block = (over: Partial<ServiceCollectiveBlock> = {}): ServiceCollectiveBlock => ({
  role: 'replica',
  venue_role: 'member',
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
  ...over,
});

const service = (over: Partial<ManagedService> = {}): ManagedService =>
  ({
    id: 's1',
    name: 'Balayage',
    description: '',
    duration_minutes: 120,
    buffer_minutes: 0,
    price_pence: 9500,
    deposit_pence: 0,
    payment_requirement: 'none',
    cancellation_notice_hours: 48,
    location_type: 'business_venue',
    variants: [],
    addon_groups: [],
    ...over,
  }) as ManagedService;

const calendars = [
  { id: 'cal-a', name: 'Amy', offers: true },
  { id: 'cal-b', name: 'Ben', offers: false },
];

async function renderSheet(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  });
}

const saveButton = () =>
  screen.queryByRole('button', { name: 'Save your settings' }) ??
  screen.getByRole('button', { name: 'Remove and keep bookings' });

beforeEach(() => {
  mockCalls.length = 0;
  mockHandler = () => ({ ok: true });
});

describe('MemberServiceSheet', () => {
  it('reads as three zones, with plain values for what the host has set', async () => {
    await renderSheet(
      <MemberServiceSheet
        service={service()}
        block={block()}
        calendars={calendars}
        expectedCalendarIds={['cal-a']}
        currencySymbol="£"
        complianceEnabled
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    expect(
      screen.getByText(
        'Bright Cuts manages this service for Northside. You choose which of your calendars offer it. For anything else, ask Bright Cuts.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('From Bright Cuts')).toBeTruthy();
    expect(screen.getByText('Up to date')).toBeTruthy();
    expect(screen.getByText('£95.00')).toBeTruthy();
    expect(screen.getByText('No deposit')).toBeTruthy();
    // The service's own forms; the venue-wide one is not this service's.
    expect(screen.getByText('Patch test')).toBeTruthy();
    expect(screen.queryByText('Consultation')).toBeNull();
    expect(screen.getByText('Your settings')).toBeTruthy();
    expect(screen.getByText('What Bright Cuts has set')).toBeTruthy();
    expect(screen.getByText('No description')).toBeTruthy();
    expect(screen.getByText('48 hours')).toBeTruthy();
    expect(screen.getByText('No options')).toBeTruthy();
    // The online meeting fields are for online services only.
    expect(screen.queryByText('Link for your calendars')).toBeNull();
    expect(saveButton().props.accessibilityState?.disabled).toBe(true);
  });

  it("sends only the member's fields, then asks before leaving bookings behind", async () => {
    const onSaved = jest.fn();
    let first = true;
    mockHandler = () => {
      if (first) {
        first = false;
        throw new ApiError('Request failed (409)', 409, {
          requires_confirmation: true,
          message: 'Amy has 2 upcoming bookings for Balayage. They are kept.',
        });
      }
      return { ok: true };
    };
    await renderSheet(
      <MemberServiceSheet
        service={service()}
        block={block()}
        calendars={calendars}
        expectedCalendarIds={['cal-a']}
        currencySymbol="£"
        complianceEnabled={false}
        onClose={jest.fn()}
        onSaved={onSaved}
      />,
    );
    await act(async () => {
      fireEvent(screen.getByLabelText('Amy offers Balayage'), 'valueChange', false);
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Ben offers Balayage'), 'valueChange', true);
    });
    await act(async () => {
      fireEvent.press(saveButton());
    });
    expect(mockCalls[0]).toEqual({
      path: '/api/venue/appointment-services',
      method: 'PATCH',
      body: { id: 's1', practitioner_ids: ['cal-b'], expected_calendar_ids: ['cal-a'] },
    });
    expect(await screen.findByText('Amy has 2 upcoming bookings for Balayage. They are kept.')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Remove and keep bookings' }));
    });
    expect(mockCalls[1]?.path).toBe('/api/venue/appointment-services?acknowledge_affected_bookings=true');
    expect(mockCalls[1]?.body).toEqual(mockCalls[0]?.body);
    expect(onSaved).toHaveBeenCalled();
  });

  it('sends the meeting link for an online service, and the instructions only when changed', async () => {
    await renderSheet(
      <MemberServiceSheet
        service={service({ location_type: 'online', online_meeting_url: 'https://meet.example/a', online_meeting_info: '' })}
        block={block()}
        calendars={calendars}
        expectedCalendarIds={['cal-a']}
        currencySymbol="£"
        complianceEnabled={false}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Before the appointment'), 'Park round the back.');
    });
    await act(async () => {
      fireEvent.press(saveButton());
    });
    expect(mockCalls[0]?.body).toEqual({
      id: 's1',
      practitioner_ids: ['cal-a'],
      expected_calendar_ids: ['cal-a'],
      online_meeting_url: 'https://meet.example/a',
      online_meeting_info: '',
      pre_appointment_instructions: 'Park round the back.',
    });
  });

  it('says a retired copy takes no new bookings, and its calendars cannot be ticked', async () => {
    await renderSheet(
      <MemberServiceSheet
        service={service()}
        block={block({ role: 'retired' })}
        calendars={calendars}
        expectedCalendarIds={['cal-a']}
        currencySymbol="£"
        complianceEnabled={false}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    expect(screen.getByText('Retired')).toBeTruthy();
    expect(
      screen.getByText(
        'Bright Cuts has taken this off the Northside page. It takes no new bookings, and the bookings you already have are not changed.',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Amy offers Balayage').props.disabled).toBe(true);
    expect(screen.getByText('Not bookable')).toBeTruthy();
  });
});
