import { useMemo } from 'react';

import { CARD_UPCOMING_DAYS, rowsCarryCardState } from '@/lib/booking/card-list';
import { addDaysToDateStr } from '@/lib/dates/venue-dates';
import { useBookingsRange } from '@/lib/queries/useBookingsRange';

/**
 * How many upcoming bookings wait for a card (web Docs/card-on-file-plan.md §6.5).
 *
 * The plan's `waiting_for_card_count` is not on the dashboard home payload yet, so this reads
 * GET /api/venue/bookings/list from today for {@link CARD_UPCOMING_DAYS} days with
 * `card_state=waiting` (the server filters, so the answer is only those rows) and counts them.
 * The bookings list's "View" opens the same range and filter, so both share one cached answer and
 * the numbers match.
 *
 * `available` is false on an older server, which ignores the filter and sends rows without
 * `card_state`: the home card stays hidden there.
 */
export function useWaitingForCardCount(today: string, enabled = true) {
  const to = addDaysToDateStr(today, CARD_UPCOMING_DAYS);
  const query = useBookingsRange({ from: today, to, cardState: 'waiting', enabled });
  return useMemo(() => {
    const rows = query.data?.bookings ?? [];
    const available = rowsCarryCardState(rows);
    const count = available ? rows.filter((row) => row.card_state === 'waiting').length : 0;
    return { count, available, from: today, to, isLoading: query.isLoading };
  }, [query.data, query.isLoading, today, to]);
}
