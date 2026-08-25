/**
 * The optimistic half of a calendar quick action.
 *
 * The bar's colour and its button set are read from the calendar-grid feed and
 * nothing else, so until this existed the bar could not change until a PATCH AND
 * a full grid refetch had both landed — two serial round trips, and on a
 * multi-service bar the refetch restarted once per service. Patching the cache on
 * press is what removes that wait; the reconcile afterwards is a backstop, not the
 * thing the user waits for.
 *
 * (The booking detail panel had this all along via `optimisticStatusPatch`, which
 * writes `bookings.*` only — never `calendar.*`. That asymmetry is exactly why the
 * panel felt instant and the calendar did not.)
 */
import { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queries/keys';
import {
  patchCalendarGridBookings,
  revertCalendarGridBookings,
} from '@/lib/queries/useCalendarQuickActions';
import type { CalendarGridBooking, CalendarGridResponse } from '@/types/calendar-grid';

function booking(over: Partial<CalendarGridBooking> & { id: string }): CalendarGridBooking {
  return {
    guestName: 'Sam Patel',
    serviceName: 'Cut',
    startTime: '10:00',
    endTime: '10:30',
    status: 'Booked',
    ...over,
  };
}

function grid(bookings: CalendarGridBooking[]): CalendarGridResponse {
  return {
    calendars: [
      {
        calendarId: 'cal-1',
        calendarName: 'Alex',
        dates: [{ date: '2026-08-25', workingHours: [], bookings, blocks: [], sessions: [] }],
      },
    ],
  };
}

const KEY = queryKeys.calendar.grid('tok', 'cal-1', '2026-08-25', '2026-08-25');

function rows(client: QueryClient, key = KEY): CalendarGridBooking[] {
  return client.getQueryData<CalendarGridResponse>(key)!.calendars[0].dates[0].bookings;
}

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

it('patches every listed booking and leaves the rest alone', () => {
  client.setQueryData(
    KEY,
    grid([booking({ id: 'b1' }), booking({ id: 'b2' }), booking({ id: 'other' })]),
  );

  patchCalendarGridBookings(client, ['b1', 'b2'], { status: 'Seated' });

  expect(rows(client).map((b) => [b.id, b.status])).toEqual([
    ['b1', 'Seated'],
    ['b2', 'Seated'],
    ['other', 'Booked'],
  ]);
});

it('moves a booking in every cached range it appears in', () => {
  const weekKey = queryKeys.calendar.grid('tok', 'cal-1', '2026-08-24', '2026-08-30');
  client.setQueryData(KEY, grid([booking({ id: 'b1' })]));
  client.setQueryData(weekKey, grid([booking({ id: 'b1' })]));

  patchCalendarGridBookings(client, ['b1'], { status: 'Completed' });

  expect(rows(client)[0].status).toBe('Completed');
  expect(rows(client, weekKey)[0].status).toBe('Completed');
});

it('returns the previous values so a failed write can be put back', () => {
  client.setQueryData(KEY, grid([booking({ id: 'b1', status: 'Booked', client_arrived_at: null })]));

  const snapshot = patchCalendarGridBookings(client, ['b1'], { status: 'Seated' });
  expect(rows(client)[0].status).toBe('Seated');

  revertCalendarGridBookings(client, snapshot);
  expect(rows(client)[0].status).toBe('Booked');
});

it('reverts only the failed segments, keeping the ones that landed', () => {
  client.setQueryData(KEY, grid([booking({ id: 'b1' }), booking({ id: 'b2' })]));

  const snapshot = patchCalendarGridBookings(client, ['b1', 'b2'], { status: 'Seated' });
  // b2 came back 409; b1 was written.
  const failed = new Map([['b2', snapshot.get('b2')!]]);
  revertCalendarGridBookings(client, failed);

  expect(rows(client).map((b) => [b.id, b.status])).toEqual([
    ['b1', 'Seated'],
    ['b2', 'Booked'],
  ]);
});

it('patches the arrival stamp', () => {
  client.setQueryData(KEY, grid([booking({ id: 'b1', client_arrived_at: null })]));

  const snapshot = patchCalendarGridBookings(client, ['b1'], {
    client_arrived_at: '2026-08-25T09:55:00Z',
  });
  expect(rows(client)[0].client_arrived_at).toBe('2026-08-25T09:55:00Z');

  revertCalendarGridBookings(client, snapshot);
  expect(rows(client)[0].client_arrived_at).toBeNull();
});

it('leaves a cached value that is not a grid response untouched', () => {
  const oddKey = [...queryKeys.calendar.all(), 'something-else'] as const;
  const value = { notAGrid: true };
  client.setQueryData(oddKey, value);

  expect(() => patchCalendarGridBookings(client, ['b1'], { status: 'Seated' })).not.toThrow();
  expect(client.getQueryData(oddKey)).toBe(value);
});

it('is a no-op for an empty id list', () => {
  const data = grid([booking({ id: 'b1' })]);
  client.setQueryData(KEY, data);

  expect(patchCalendarGridBookings(client, [], { status: 'Seated' }).size).toBe(0);
  // Same object: an empty batch must not even churn the cache identity.
  expect(client.getQueryData(KEY)).toBe(data);
});
