/**
 * One calendar's own values as a step (web `CollectiveCalendarValuesDialog`, 2026-10-28). The host
 * saves any venue's calendar through the collective, sees price, length and buffer whatever the
 * service allows, and is told first that a save turns a setting on; the route's `flags_turned_on`
 * comes back to the caller. An admin on its own calendar sees only the allowed fields and saves
 * through the per-calendar route.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ApiError } from '@/lib/api/client';
import { NO_CALENDAR_VALUE_FLAGS, type CalendarValuesTarget } from '@/lib/services/calendar-values';

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

import { CalendarValuesStep } from './CalendarValuesStep';

const memberCalendar: CalendarValuesTarget = {
  calendarId: 'cal-m',
  calendarName: 'Mo',
  venueName: 'Light 3',
  serviceId: 'replica-1',
  current: { custom_price_pence: 4500, custom_duration_minutes: null, custom_buffer_minutes: null, custom_deposit_pence: null },
};

const defaults = { durationMinutes: 30, bufferMinutes: 0, pricePence: 4000, depositPence: null };

async function renderStep(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  await act(async () => {
    render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  });
}

beforeEach(() => {
  mockCalls.length = 0;
  mockHandler = () => ({});
});

describe('CalendarValuesStep', () => {
  it("lets the host set a member calendar's values, saying first which settings it turns on", async () => {
    mockHandler = () => ({ flags_turned_on: ['staff_may_customize_duration'] });
    const onSaved = jest.fn();
    await renderStep(
      <CalendarValuesStep
        mode="host"
        collectiveId="col-1"
        serviceName="Balayage"
        target={memberCalendar}
        flags={{ ...NO_CALENDAR_VALUE_FLAGS, price: true }}
        defaults={defaults}
        currencySymbol="£"
        hasOptions={false}
        onSaved={onSaved}
        onBack={jest.fn()}
      />,
    );
    expect(screen.getByText('Balayage on Mo')).toBeTruthy();
    expect(
      screen.getByText("What Mo at Light 3 charges and takes for this service. Light 3 is told when you change it."),
    ).toBeTruthy();
    // Price, length and buffer whatever the service allows; no deposit, as it takes none.
    expect(screen.getByLabelText('Price').props.value).toBe('45.00');
    expect(screen.getByLabelText('Length (minutes)')).toBeTruthy();
    expect(screen.getByLabelText('Buffer after (minutes)')).toBeTruthy();
    expect(screen.queryByLabelText('Deposit')).toBeNull();
    expect(screen.getByText('Standard: £40.00')).toBeTruthy();
    expect(
      screen.getByText(
        'Saving a value here also lets every calendar that offers Balayage have its own length or buffer, at every venue, and staff can then set it for their own calendar. You can turn this off under Optional overrides per calendar in the service.',
      ),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Length (minutes)'), '45');
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    });
    expect(mockCalls).toEqual([
      {
        path: '/api/venue/collectives/col-1/calendar-values',
        method: 'PUT',
        body: { calendar_id: 'cal-m', service_id: 'replica-1', values: { custom_duration_minutes: 45 } },
      },
    ]);
    expect(onSaved).toHaveBeenCalledWith(['duration']);
  });

  it('puts a value back to the standard with null', async () => {
    await renderStep(
      <CalendarValuesStep
        mode="host"
        collectiveId="col-1"
        serviceName="Balayage"
        target={memberCalendar}
        flags={{ ...NO_CALENDAR_VALUE_FLAGS, price: true, duration: true, buffer: true }}
        defaults={defaults}
        currencySymbol="£"
        hasOptions={false}
        onSaved={jest.fn()}
        onBack={jest.fn()}
      />,
    );
    // Every setting is on already: nothing to turn on.
    expect(screen.queryByText(/Saving a value here also lets/)).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Use standard: Price'));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    });
    expect(mockCalls[0]?.body).toEqual({
      calendar_id: 'cal-m',
      service_id: 'replica-1',
      values: { custom_price_pence: null },
    });
  });

  // CQ-12 (regression): a service with options offered price, length and buffer, which no booking used.
  it('offers only the deposit on a service with options, and says why', async () => {
    await renderStep(
      <CalendarValuesStep
        mode="host"
        collectiveId="col-1"
        serviceName="Balayage"
        target={memberCalendar}
        flags={{ ...NO_CALENDAR_VALUE_FLAGS, price: true, duration: true, buffer: true }}
        defaults={{ ...defaults, depositPence: 1000 }}
        currencySymbol="£"
        hasOptions
        onSaved={jest.fn()}
        onBack={jest.fn()}
      />,
    );
    expect(screen.queryByLabelText('Price')).toBeNull();
    expect(screen.queryByLabelText('Length (minutes)')).toBeNull();
    expect(screen.queryByLabelText('Buffer after (minutes)')).toBeNull();
    expect(screen.getByLabelText('Deposit')).toBeTruthy();
    expect(
      screen.getByText(
        'Balayage has options, so each option sets its own price, length and buffer, the same on every calendar. A deposit set here applies to options that do not set their own.',
      ),
    ).toBeTruthy();
  });

  it('says there is nothing to set on a service with options and no deposit', async () => {
    await renderStep(
      <CalendarValuesStep
        mode="host"
        collectiveId="col-1"
        serviceName="Balayage"
        target={memberCalendar}
        flags={NO_CALENDAR_VALUE_FLAGS}
        defaults={defaults}
        currencySymbol="£"
        hasOptions
        onSaved={jest.fn()}
        onBack={jest.fn()}
      />,
    );
    expect(
      screen.getByText(
        'Balayage has options, so each option sets its own price, length and buffer, the same on every calendar. There is nothing to set for one calendar.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState?.disabled).toBe(true);
  });

  it("shows the route's sentence when it refuses a calendar price on a service with options (409 OPTION_VALUES_PER_OPTION)", async () => {
    const sentence =
      'This service has options, so each option sets its own price, length and buffer. A calendar cannot have its own.';
    mockHandler = () => {
      throw new ApiError(sentence, 409, { error: sentence, code: 'OPTION_VALUES_PER_OPTION' });
    };
    // The options were added since this list loaded: the step still offers a price, and the server says no.
    await renderStep(
      <CalendarValuesStep
        mode="host"
        collectiveId="col-1"
        serviceName="Balayage"
        target={memberCalendar}
        flags={NO_CALENDAR_VALUE_FLAGS}
        defaults={defaults}
        currencySymbol="£"
        hasOptions={false}
        onSaved={jest.fn()}
        onBack={jest.fn()}
      />,
    );
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Price'), '50');
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    });
    expect(screen.getByText(sentence)).toBeTruthy();
  });

  it('names a value the calendar cannot take, and sends nothing', async () => {
    await renderStep(
      <CalendarValuesStep
        mode="host"
        collectiveId="col-1"
        serviceName="Balayage"
        target={memberCalendar}
        flags={NO_CALENDAR_VALUE_FLAGS}
        defaults={defaults}
        currencySymbol="£"
        hasOptions={false}
        onSaved={jest.fn()}
        onBack={jest.fn()}
      />,
    );
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Buffer after (minutes)'), '500');
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    });
    expect(screen.getByText('Check the buffer after (minutes): it is not a value this calendar can take.')).toBeTruthy();
    expect(mockCalls).toEqual([]);
  });

  it("goes back without a save when nothing changed, and shows the route's refusal", async () => {
    const onBack = jest.fn();
    await renderStep(
      <CalendarValuesStep
        mode="host"
        collectiveId="col-1"
        serviceName="Balayage"
        target={memberCalendar}
        flags={NO_CALENDAR_VALUE_FLAGS}
        defaults={defaults}
        currencySymbol="£"
        hasOptions={false}
        onSaved={jest.fn()}
        onBack={onBack}
      />,
    );
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    });
    expect(onBack).toHaveBeenCalled();
    expect(mockCalls).toEqual([]);

    mockHandler = () => {
      throw new ApiError('Light 3 is still updating. Try again in a moment.', 409, {
        error: 'Light 3 is still updating. Try again in a moment.',
      });
    };
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Price'), '50');
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    });
    expect(screen.getByText('Light 3 is still updating. Try again in a moment.')).toBeTruthy();
  });

  it("shows an admin only the allowed fields on its own calendar, and saves through the venue's route", async () => {
    const onSaved = jest.fn();
    await renderStep(
      <CalendarValuesStep
        mode="own"
        collectiveId={null}
        serviceName="Cut"
        target={{ ...memberCalendar, calendarName: 'Amy', venueName: '', serviceId: 's1', calendarId: 'cal-a' }}
        flags={{ ...NO_CALENDAR_VALUE_FLAGS, duration: true }}
        defaults={defaults}
        currencySymbol="£"
        hasOptions={false}
        onSaved={onSaved}
        onBack={jest.fn()}
      />,
    );
    expect(screen.getByText('What Amy charges and takes for this service. Other calendars keep their own.')).toBeTruthy();
    expect(screen.queryByLabelText('Price')).toBeNull();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Length (minutes)'), '40');
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    });
    expect(mockCalls).toEqual([
      {
        path: '/api/venue/practitioner-service-overrides',
        method: 'PATCH',
        body: { service_id: 's1', calendar_id: 'cal-a', custom_duration_minutes: 40 },
      },
    ]);
    expect(onSaved).toHaveBeenCalledWith([]);
  });

  it('says so when the service lets calendars set nothing', async () => {
    await renderStep(
      <CalendarValuesStep
        mode="own"
        collectiveId={null}
        serviceName="Cut"
        target={memberCalendar}
        flags={NO_CALENDAR_VALUE_FLAGS}
        defaults={defaults}
        currencySymbol="£"
        hasOptions={false}
        onSaved={jest.fn()}
        onBack={jest.fn()}
      />,
    );
    expect(screen.getByText(/This service does not let calendars set their own values/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState?.disabled).toBe(true);
  });
});
