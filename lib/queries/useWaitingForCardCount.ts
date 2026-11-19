import { useMemo } from 'react';

import { CARD_UPCOMING_DAYS, rowsCarryCardState } from '@/lib/booking/card-list';
import { addDaysToDateStr } from '@/lib/dates/venue-dates';
import { useBookingsRange } from '@/lib/queries/useBookingsRange';
import { useDashboardHome } from '@/lib/queries/useDashboardHome';

/**
 * How many upcoming bookings wait for a card (web Docs/card-on-file-plan.md §6.5).
 *
 * The dashboard home payload answers `waiting_for_card_count` (every booking from the venue's
 * today onwards, counted as the bulk routes count them) with `waiting_for_card_from_date`. The
 * Today screen already reads that payload, so the count costs nothing more. "Send card requests"
 * then sends the filter from that date with no end date, as the web does, so the server counts the
 * same set.
 *
 * A server from before that field (or one that could not count, `null`) is read the old way:
 * GET /api/venue/bookings/list from today for {@link CARD_UPCOMING_DAYS} days with
 * `card_state=waiting` (the server filters, so the answer is only those rows), counted here. That
 * read waits for the home payload, so it never runs where the payload has the count.
 *
 * `available` is false on an older server, which ignores the filter and sends rows without
 * `card_state`: the home card stays hidden there.
 */
export function useWaitingForCardCount(today: string, enabled = true) {
  const home = useDashboardHome();
  const served = home.data?.waiting_for_card_count;
  const servedCount = typeof served === 'number' ? served : null;
  const servedFrom = home.data?.waiting_for_card_from_date || today;
  // The home payload has landed (or failed) without a count: read the list instead.
  const homeSettled = home.data !== undefined || home.isError;
  const fallback = enabled && homeSettled && servedCount === null;
  const rangeTo = addDaysToDateStr(today, CARD_UPCOMING_DAYS);
  const query = useBookingsRange({ from: today, to: rangeTo, cardState: 'waiting', enabled: fallback });
  return useMemo(() => {
    if (servedCount !== null) {
      return {
        count: servedCount,
        available: true,
        from: servedFrom,
        /** No end date: the count is every booking from `from` onwards. */
        to: null as string | null,
        isLoading: false,
      };
    }
    const rows = query.data?.bookings ?? [];
    const available = rowsCarryCardState(rows);
    const count = available ? rows.filter((row) => row.card_state === 'waiting').length : 0;
    return {
      count,
      available,
      from: today,
      to: rangeTo as string | null,
      isLoading: !homeSettled || query.isLoading,
    };
  }, [servedCount, servedFrom, query.data, query.isLoading, homeSettled, today, rangeTo]);
}
