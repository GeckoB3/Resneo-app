/**
 * Web QA 2026-11-08 SCH-F15: the staff form listed times that the save then refused ("Allow
 * same-day bookings" off, "Max advance"). The web now holds a phone booking's day, chain and month
 * lookups to the guest's date rules when they say `source=phone`, as the save is, and says why a
 * date has no times. The app's lookups now send the booking's source too, and show the reason.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockApiFetch = jest.fn();
jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

import { TimeSlotStep } from '@/components/booking-wizard/TimeSlotStep';
import { useAppointmentAvailability } from '@/lib/queries/useAppointmentAvailability';
import { chainAvailabilityPath } from '@/lib/queries/useChainAvailability';
import { useMonthAvailability } from '@/lib/queries/useMonthAvailability';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const sourceOf = (url: string) => new URL(url, 'https://x').searchParams.get('source');

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({ date: '2027-02-26', venue_id: 'v1', practitioners: [], available_dates: [] });
});

describe('staff time lookups say how the booking is taken', () => {
  it('the day list sends source=phone, and a move sends none', async () => {
    renderHook(
      () => useAppointmentAvailability({ date: '2027-02-26', serviceId: 's1', practitionerId: 'p1', source: 'phone' }),
      { wrapper },
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(sourceOf(mockApiFetch.mock.calls[0]![0] as string)).toBe('phone');

    mockApiFetch.mockClear();
    renderHook(
      () => useAppointmentAvailability({ date: '2027-02-26', serviceId: 's1', practitionerId: 'p1', excludeBookingId: 'b1' }),
      { wrapper },
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(sourceOf(mockApiFetch.mock.calls[0]![0] as string)).toBeNull();
  });

  it('the month sends the source', async () => {
    renderHook(
      () => useMonthAvailability({ serviceId: 's1', practitionerId: 'p1', year: 2027, month: 2, source: 'walk-in' }),
      { wrapper },
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(sourceOf(mockApiFetch.mock.calls[0]![0] as string)).toBe('walk-in');
  });

  it('the visit chain sends the source', () => {
    const url = chainAvailabilityPath({
      venueId: 'v1',
      date: '2027-02-26',
      practitionerId: 'p1',
      chain: [{ service_id: 'a' }, { service_id: 'b' }],
      source: 'phone',
    });
    expect(sourceOf(url)).toBe('phone');
    expect(sourceOf(chainAvailabilityPath({ venueId: 'v1', date: '2027-02-26', practitionerId: 'p1', chain: [] }))).toBeNull();
  });

  it("shows the server's reason when a rule rules the date out", async () => {
    const reason =
      'Cut can be booked up to 90 days ahead, so this date is too far away. To book it anyway, tick "Override availability" on the first step of New booking.';
    mockApiFetch.mockResolvedValue({ date: '2027-02-26', venue_id: 'v1', practitioners: [], unavailable_reason: reason });
    await render(
      <TimeSlotStep
        date="2027-02-26"
        serviceId="s1"
        practitionerId="p1"
        durationMinutes={null}
        venueId="v1"
        selectedSlot={null}
        onSelectSlot={jest.fn()}
        onContinue={jest.fn()}
        source="phone"
      />,
      { wrapper },
    );
    expect(await screen.findByText(reason)).toBeTruthy();
    expect(sourceOf(mockApiFetch.mock.calls[0]![0] as string)).toBe('phone');
  });
});
