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
  applyOptimisticGridPatch,
  patchCalendarGridBookings,
  revertCalendarGridBookings,
} from '@/lib/queries/useCalendarQuickActions';
import type { CalendarGridBooking, CalendarGridResponse } from '@/types/calendar-grid';
import type { LinkedBooking, LinkedCalendarResponse } from '@/types/linked-venues';

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

/**
 * The device-reported regression: "the bar responds immediately, but the state
 * sometimes reverts after a few seconds."
 *
 * A read already in flight when the press lands — the 60-second poll, a resume
 * refetch, or the reconcile from a previous press — resolves with pre-press rows
 * and writes them straight over the patch. `applyOptimisticGridPatch` cancels
 * those reads, and re-asserts afterwards because cancelling reverts the query to
 * the state captured when the cancelled fetch STARTED.
 */
describe('applyOptimisticGridPatch', () => {
  it('survives a fetch that was already in flight when the press landed', async () => {
    let release: (value: CalendarGridResponse) => void = () => {};
    const inFlight = new Promise<CalendarGridResponse>((resolve) => {
      release = resolve;
    });

    client.setQueryData(KEY, grid([booking({ id: 'b1', status: 'Booked' })]));
    // A poll starts BEFORE the press, holding pre-press rows.
    const fetching = client.fetchQuery({ queryKey: KEY, queryFn: () => inFlight });

    await applyOptimisticGridPatch(client, ['b1'], { status: 'Seated' });
    expect(rows(client)[0].status).toBe('Seated');

    // The poll now comes back with what it read before the press.
    release(grid([booking({ id: 'b1', status: 'Booked' })]));
    await fetching.catch(() => undefined);
    await Promise.resolve();

    // Was 'Booked' before the cancel — the bar visibly flipping back.
    expect(rows(client)[0].status).toBe('Seated');
  });

  it('still reports the PRE-press values so a rollback restores the real status', async () => {
    client.setQueryData(KEY, grid([booking({ id: 'b1', status: 'Booked' })]));

    const snapshot = await applyOptimisticGridPatch(client, ['b1'], { status: 'Seated' });
    revertCalendarGridBookings(client, snapshot);

    // Not 'Seated': re-reading the snapshot after the re-assert would capture the
    // optimistic value as "previous" and a failed write would never roll back.
    expect(rows(client)[0].status).toBe('Booked');
  });
});

/**
 * A partner's bar on an editable linked column answers from the linked feed,
 * not the grid, so the same press patches that feed in its own field names.
 */
describe("a linked venue's booking", () => {
  const LINKED_KEY = queryKeys.linkedCalendar.range('tok', '2026-08-25', '2026-08-25');

  function linkedBooking(over: Partial<LinkedBooking> & { id: string }): LinkedBooking {
    return {
      practitionerId: 'p1',
      bookingDate: '2026-08-25',
      bookingTime: '10:00:00',
      bookingEndTime: '10:30:00',
      status: 'Booked',
      guestName: 'Ada',
      serviceName: 'Cut',
      editable: true,
      ...over,
    };
  }

  function feed(bookings: LinkedBooking[]): LinkedCalendarResponse {
    return {
      from: '2026-08-25',
      to: '2026-08-25',
      venues: [
        {
          venueId: 'v1',
          venueName: 'light2',
          linkId: 'l1',
          visibility: 'full_details',
          action: 'edit_existing',
          pii: true,
          practitioners: [],
          services: [],
          resources: [],
          bookings,
        },
      ],
    };
  }

  function linkedRows(): LinkedBooking[] {
    return client.getQueryData<LinkedCalendarResponse>(LINKED_KEY)!.venues[0].bookings;
  }

  it('patches the status and the arrival stamp in the feed, and reports what they were', () => {
    client.setQueryData(
      LINKED_KEY,
      feed([linkedBooking({ id: 'lb1', clientArrivedAt: null }), linkedBooking({ id: 'other' })]),
    );

    const snapshot = patchCalendarGridBookings(client, ['lb1'], {
      status: 'Seated',
      client_arrived_at: '2026-08-25T09:55:00Z',
    });

    expect(linkedRows().map((b) => [b.id, b.status, b.clientArrivedAt ?? null])).toEqual([
      ['lb1', 'Seated', '2026-08-25T09:55:00Z'],
      ['other', 'Booked', null],
    ]);
    expect(snapshot.get('lb1')).toEqual({ status: 'Booked', client_arrived_at: null });

    revertCalendarGridBookings(client, snapshot);
    expect(linkedRows()[0]).toMatchObject({ status: 'Booked', clientArrivedAt: null });
  });

  it('leaves the other feed rows and a venue with no match untouched', () => {
    const value = feed([linkedBooking({ id: 'other' })]);
    client.setQueryData(LINKED_KEY, value);

    patchCalendarGridBookings(client, ['lb1'], { status: 'Seated' });
    expect(client.getQueryData(LINKED_KEY)).toBe(value);
  });

  it('survives an in-flight read of the feed, like the grid does', async () => {
    client.setQueryData(LINKED_KEY, feed([linkedBooking({ id: 'lb1' })]));

    const snapshot = await applyOptimisticGridPatch(client, ['lb1'], { status: 'Completed' });
    expect(linkedRows()[0].status).toBe('Completed');
    expect(snapshot.get('lb1')?.status).toBe('Booked');
  });
});
