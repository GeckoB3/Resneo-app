import type { CalendarGridBooking, CalendarGridDay } from '@/types/calendar-grid';

import { resolveDayLoadState } from './day-load-state';

function booking(id: string): CalendarGridBooking {
  return {
    id,
    guestName: 'Guest',
    serviceName: 'Service',
    startTime: '10:00',
    endTime: '11:00',
    status: 'Booked',
  };
}

function day(over: Partial<CalendarGridDay> = {}): CalendarGridDay {
  return {
    date: '2026-06-19',
    workingHours: [],
    bookings: [],
    blocks: [],
    sessions: [],
    ...over,
  };
}

describe('resolveDayLoadState', () => {
  it('reads as loading (not closed) while keepPreviousData holds the prior range', () => {
    // The reported bug: stepping the day re-keys the query, the placeholder
    // (prior range) lacks the new date so `day` is null, yet isLoading is false.
    expect(
      resolveDayLoadState({ day: null, isFetching: true, isPlaceholderData: true }),
    ).toEqual({ isLoading: true, isClosed: false });
  });

  it('flags a settled day with no hours and no bookings as closed', () => {
    expect(
      resolveDayLoadState({
        day: day({ workingHours: [], bookings: [] }),
        isFetching: false,
        isPlaceholderData: false,
      }),
    ).toEqual({ isLoading: false, isClosed: true });
  });

  it('does not flag a day with working hours as closed', () => {
    expect(
      resolveDayLoadState({
        day: day({ workingHours: [{ start: '09:00', end: '17:00' }] }),
        isFetching: false,
        isPlaceholderData: false,
      }),
    ).toEqual({ isLoading: false, isClosed: false });
  });

  it('does not flag a day with bookings as closed, even with no working hours', () => {
    expect(
      resolveDayLoadState({
        day: day({ workingHours: [], bookings: [booking('b1')] }),
        isFetching: false,
        isPlaceholderData: false,
      }),
    ).toEqual({ isLoading: false, isClosed: false });
  });

  it('defers the closed verdict while placeholder data is still on screen', () => {
    // Scope switch can carry placeholder data that already contains the date.
    // It is real data, but mid-fetch — wait for the live result before judging.
    expect(
      resolveDayLoadState({
        day: day({ workingHours: [], bookings: [] }),
        isFetching: true,
        isPlaceholderData: true,
      }),
    ).toEqual({ isLoading: false, isClosed: false });
  });

  it('keeps the settled grid visible during a background refetch (no spinner)', () => {
    // 60s poll / pull-to-refresh of the current day: data is present and real,
    // so neither a spinner nor a flicker of the verdict.
    expect(
      resolveDayLoadState({
        day: day({ workingHours: [{ start: '09:00', end: '17:00' }] }),
        isFetching: true,
        isPlaceholderData: false,
      }),
    ).toEqual({ isLoading: false, isClosed: false });
  });

  it('does not spin forever when there is no record and no fetch in flight', () => {
    // e.g. a stale selected id: render an empty grid rather than a perpetual
    // spinner or a misleading closed banner.
    expect(
      resolveDayLoadState({ day: null, isFetching: false, isPlaceholderData: false }),
    ).toEqual({ isLoading: false, isClosed: false });
  });
});
