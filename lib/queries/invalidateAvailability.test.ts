/**
 * Availability must go stale the moment a booking is written.
 *
 * The client sets a global `staleTime` of 30s, and no booking mutation used to
 * invalidate `appointments.availability`. So a slot just taken kept being served
 * from cache as bookable for up to half a minute — long enough for staff to tap
 * "Book another", pick the same slot, collect a client's details and only then
 * hit a 409 (or, on the walk-in path, double-book). A cancelled slot stayed
 * unbookable for the same window.
 *
 * Driven through a real QueryClient rather than by asserting on call arguments,
 * because the thing that matters is whether the CACHE ENTRY actually goes stale
 * — which depends on the key being a true prefix, not on the call being made.
 */
import { QueryClient } from '@tanstack/react-query';

import { invalidateAppointmentAvailability } from '@/lib/queries/invalidateAvailability';
import { queryKeys } from '@/lib/queries/keys';

const AVAILABILITY = queryKeys.appointments.availability(
  'token',
  '2026-08-12',
  'svc-1',
  'prac-1',
);
const MONTH = queryKeys.appointments.monthAvailability('token', 'svc-1', 'prac-1', 2026, 8);
const CATALOG = queryKeys.appointments.catalog('venue-1');
const BOOKINGS = queryKeys.bookings.all();

function seed(client: QueryClient) {
  // `setQueryData` alone leaves an entry with no observer; give each a state so
  // `isStale()` is meaningful.
  client.setQueryData(AVAILABILITY, { slots: [] });
  client.setQueryData(MONTH, { available_dates: [] });
  client.setQueryData(CATALOG, { practitioners: [] });
  client.setQueryData(BOOKINGS, { bookings: [] });
}

function isStale(client: QueryClient, key: readonly unknown[]): boolean {
  return client.getQueryCache().find({ queryKey: key })?.isStale() ?? false;
}

describe('invalidateAppointmentAvailability', () => {
  it('marks slot availability stale', () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
    seed(client);
    expect(isStale(client, AVAILABILITY)).toBe(false);

    invalidateAppointmentAvailability(client);

    expect(isStale(client, AVAILABILITY)).toBe(true);
  });

  it('marks month availability stale, so the date picker reopens honestly', () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
    seed(client);

    invalidateAppointmentAvailability(client);

    expect(isStale(client, MONTH)).toBe(true);
  });

  it('leaves the service catalogue alone', () => {
    // The catalogue changes when SERVICES change, never when a slot is filled.
    // Invalidating through `appointments.all()` would refetch it on every booking.
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
    seed(client);

    invalidateAppointmentAvailability(client);

    expect(isStale(client, CATALOG)).toBe(false);
  });

  it('reaches availability for every service, person and date, not just one', () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
    const other = queryKeys.appointments.availability('token', '2026-09-01', 'svc-2', 'prac-2');
    client.setQueryData(AVAILABILITY, { slots: [] });
    client.setQueryData(other, { slots: [] });

    invalidateAppointmentAvailability(client);

    expect(isStale(client, AVAILABILITY)).toBe(true);
    expect(isStale(client, other)).toBe(true);
  });
});

describe('availability key prefixes', () => {
  it('availabilityAll is a true prefix of a full availability key', () => {
    const prefix = queryKeys.appointments.availabilityAll();
    expect(AVAILABILITY.slice(0, prefix.length)).toEqual([...prefix]);
  });

  it('monthAvailabilityAll is a true prefix of a full month key', () => {
    const prefix = queryKeys.appointments.monthAvailabilityAll();
    expect(MONTH.slice(0, prefix.length)).toEqual([...prefix]);
  });

  it('the two prefixes cannot match each other, or the catalogue', () => {
    const availability = queryKeys.appointments.availabilityAll();
    const month = queryKeys.appointments.monthAvailabilityAll();
    expect(MONTH.slice(0, availability.length)).not.toEqual([...availability]);
    expect(AVAILABILITY.slice(0, month.length)).not.toEqual([...month]);
    expect(CATALOG.slice(0, availability.length)).not.toEqual([...availability]);
  });
});
