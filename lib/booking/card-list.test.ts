/**
 * Card on file on lists, rosters and home (card-on-file-plan §6.1, §6.4, §6.5, §4.16): the pills
 * for every state and for an older server's rows, the Card filter counts, what a selection allows,
 * the "Select all" count, and that the home count and the list's "View" read the same range.
 */
import { rangeFor } from '@/app/(app)/(tabs)/bookings';
import {
  CARD_FILTER_OPTIONS,
  CARD_UPCOMING_DAYS,
  cardBulkAbilities,
  cardStateCounts,
  confirmWithoutCardUndoneMessage,
  isCardBulkState,
  rowCardPill,
  rowsCarryCardState,
  selectAllCardCount,
  selectAllCardLabel,
  selectAllCardOffered,
  undoDeadlineMs,
} from '@/lib/booking/card-list';
import { addDaysToDateStr } from '@/lib/dates/venue-dates';
import { markWaitingForCard } from '@/lib/queries/useCalendarGrid';
import type { CalendarGridResponse } from '@/types/calendar-grid';

describe('rowCardPill', () => {
  it('names every card state, Waiting for card being the one that asks for attention', () => {
    expect(rowCardPill({ card_state: 'protected' })).toEqual({ state: 'protected', label: 'Protected', tone: 'success' });
    expect(rowCardPill({ card_state: 'waiting' })).toEqual({ state: 'waiting', label: 'Waiting for card', tone: 'warning' });
    expect(rowCardPill({ card_state: 'not_needed' })?.label).toBe('Card not needed');
    expect(rowCardPill({ card_state: 'charged' })?.label).toBe('Fee charged');
  });

  it('shows nothing for a booking without a card hold', () => {
    expect(rowCardPill({ card_state: null, deposit_status: 'Paid' })).toBeNull();
    expect(rowCardPill({ deposit_status: 'Pending' })).toBeNull();
  });

  it('reads an older server row by its hold-only deposit status', () => {
    expect(rowCardPill({ deposit_status: 'Card Held' })?.label).toBe('Protected');
    expect(rowCardPill({ deposit_status: 'Charged' })?.label).toBe('Fee charged');
  });
});

describe('Card filter', () => {
  it('lists the four states in the plan order', () => {
    expect(CARD_FILTER_OPTIONS.map((o) => o.label)).toEqual([
      'Waiting for card',
      'Protected',
      'Card not needed',
      'Fee charged',
    ]);
  });

  it('counts rows per state and knows when the server answers card states', () => {
    const rows = [
      { card_state: 'waiting' },
      { card_state: 'waiting' },
      { card_state: 'not_needed' },
      { card_state: null },
    ];
    expect(cardStateCounts(rows)).toEqual({ waiting: 2, protected: 0, not_needed: 1, charged: 0 });
    expect(rowsCarryCardState(rows)).toBe(true);
    expect(rowsCarryCardState([{ deposit_status: 'Pending' }])).toBe(false);
  });
});

describe('bulk selection', () => {
  it('offers Confirm without a card only with a Waiting for card row', () => {
    const waiting = cardBulkAbilities([
      { id: 'a', card_state: 'waiting' },
      { id: 'b', card_state: 'not_needed' },
      { id: 'c', card_state: 'protected' },
    ]);
    expect(waiting).toEqual({
      waitingIds: ['a'],
      notNeededIds: ['b'],
      canConfirmWithoutCard: true,
      canSendCardRequests: true,
    });
    const notNeeded = cardBulkAbilities([{ id: 'b', card_state: 'not_needed' }]);
    expect(notNeeded.canConfirmWithoutCard).toBe(false);
    expect(notNeeded.canSendCardRequests).toBe(true);
    expect(cardBulkAbilities([{ id: 'c', card_state: 'protected' }]).canSendCardRequests).toBe(false);
  });

  it('counts booking rows in the dates for "Select all"', () => {
    const rows = [
      { booking_date: '2026-11-17', card_state: 'waiting' },
      { booking_date: '2026-11-18', card_state: 'waiting' },
      { booking_date: '2026-11-30', card_state: 'waiting' },
      { booking_date: '2026-11-18', card_state: 'protected' },
    ];
    expect(selectAllCardCount(rows, 'waiting', { from: '2026-11-17', to: '2026-11-20' })).toBe(2);
    expect(selectAllCardLabel(2)).toBe('Select all 2 bookings');
    expect(selectAllCardLabel(1)).toBe('Select all 1 booking');
    expect(isCardBulkState('protected')).toBe(false);
    expect(isCardBulkState('not_needed')).toBe(true);
  });

  it('offers "Select all" only while the Card filter and the dates are all that narrow the list', () => {
    expect(selectAllCardOffered({ cardFilter: 'waiting', ownVenue: true, otherFiltersActive: false })).toBe(true);
    // A stylist filter or a search: the server would act on bookings staff cannot see (2026-11-19).
    expect(selectAllCardOffered({ cardFilter: 'waiting', ownVenue: true, otherFiltersActive: true })).toBe(false);
    expect(selectAllCardOffered({ cardFilter: 'waiting', ownVenue: false, otherFiltersActive: false })).toBe(false);
    expect(selectAllCardOffered({ cardFilter: 'protected', ownVenue: true, otherFiltersActive: false })).toBe(false);
    expect(selectAllCardOffered({ cardFilter: null, ownVenue: true, otherFiltersActive: false })).toBe(false);
  });

  it('words what Undo of Confirm without a card did, kept bookings included', () => {
    expect(confirmWithoutCardUndoneMessage({ restored: 1, kept: 0 })).toBe('Undone. The booking is waiting for a card again.');
    expect(confirmWithoutCardUndoneMessage({ restored: 0, kept: 1 })).toBe(
      'This could not be undone because a card was added since. The booking stays confirmed and the card protects it.',
    );
    expect(confirmWithoutCardUndoneMessage({ restored: 1, kept: 2 })).toBe(
      'Undone. 1 booking is waiting for a card again. 2 could not be undone because a card was added since.',
    );
  });

  it('keeps Undo until the server says, or 5 minutes', () => {
    expect(undoDeadlineMs('2026-11-17T10:05:00Z', 0, 300_000)).toBe(Date.parse('2026-11-17T10:05:00Z'));
    expect(undoDeadlineMs(null, 1000, 300_000)).toBe(301_000);
  });
});

describe('home count and View', () => {
  it('reads the same dates as the list opened by View', () => {
    const today = '2026-11-17';
    expect(rangeFor('custom', today, CARD_UPCOMING_DAYS)).toEqual({
      from: today,
      to: addDaysToDateStr(today, CARD_UPCOMING_DAYS),
    });
  });
});

describe('markWaitingForCard (diary)', () => {
  const grid: CalendarGridResponse = {
    calendars: [
      {
        calendarId: 'c1',
        calendarName: 'Amy',
        dates: [
          {
            date: '2026-11-17',
            workingHours: [],
            blocks: [],
            sessions: [],
            bookings: [
              { id: 'b1', guestName: 'A', serviceName: 'Cut', startTime: '09:00', endTime: '10:00', status: 'Booked' },
              { id: 'b2', guestName: 'B', serviceName: 'Cut', startTime: '10:00', endTime: '11:00', status: 'Booked' },
            ],
          },
        ],
      },
    ],
  };

  it('marks only the waiting bookings', () => {
    const out = markWaitingForCard(grid, new Set(['b2']));
    const bookings = out.calendars[0].dates[0].bookings;
    expect(bookings[0].card_state).toBeUndefined();
    expect(bookings[1].card_state).toBe('waiting');
  });

  it('keeps the same grid when nothing waits', () => {
    expect(markWaitingForCard(grid, new Set())).toBe(grid);
    expect(markWaitingForCard(grid, null)).toBe(grid);
    expect(markWaitingForCard(grid, new Set(['other']))).toBe(grid);
  });
});
