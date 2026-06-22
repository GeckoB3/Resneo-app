import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { addDaysToDateStr } from '@/lib/dates/venue-dates';
import { isBackendConfigured } from '@/lib/env';
import { keyScope } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useGuests } from '@/lib/queries/useGuests';
import type { BookingListRow, BookingsListResponse } from '@/types/booking-list';

/**
 * Historical booking activity for the Reports → History section.
 *
 * Derived client-side from GET /api/venue/bookings/list?from=&to=&view=calendar
 * (Bearer-capable: the web route uses createVenueRouteClient(request)). The
 * calendar view excludes cancelled bookings, so every bucket counts bookings
 * that were actually held (or no-showed) on that calendar day.
 */

// ── Local query keys (keys.ts is owned by another workstream) ────────────────
const reportHistoryKeys = {
  all: ['reserveNI', 'reportHistory'] as const,
  range: (accessToken: string | null, from: string, to: string) =>
    [...reportHistoryKeys.all, keyScope(accessToken), from, to] as const,
};

// ── Types ─────────────────────────────────────────────────────────────────────
/** One zero-filled calendar day of historical booking activity. */
export interface HistoryDayRow {
  /** Calendar date (YYYY-MM-DD). */
  date: string;
  /** Non-cancelled bookings scheduled on this day. */
  bookings: number;
  /** Places booked (sum of party_size). */
  covers: number;
  /** Places that reached arrived / started / completed. */
  seen_covers: number;
  /** Bookings marked No-Show. */
  no_shows: number;
  /** Deposits collected (deposit_status === 'Paid'), in pence. */
  deposit_paid_pence: number;
}

export interface ReportHistoryTotals {
  bookings: number;
  covers: number;
  seen_covers: number;
  no_shows: number;
  deposit_paid_pence: number;
}

export interface ReportHistoryData {
  from: string;
  to: string;
  days: HistoryDayRow[];
  totals: ReportHistoryTotals;
}

/** A chart bucket — one day, or one N-day window for long ranges. */
export interface HistoryBucket {
  key: string;
  /** Short x-axis label (MM-DD of the bucket start). */
  label: string;
  bookings: number;
  covers: number;
  seen_covers: number;
  no_shows: number;
  deposit_paid_pence: number;
}

// ── Aggregation ───────────────────────────────────────────────────────────────
/** Hard cap on zero-filled days so a bad custom range cannot loop forever. */
const MAX_HISTORY_DAYS = 400;

function isSeenBooking(row: BookingListRow): boolean {
  if (row.status === 'Seated' || row.status === 'Completed') return true;
  return typeof row.client_arrived_at === 'string' && row.client_arrived_at.trim() !== '';
}

export function aggregateHistory(
  rows: BookingListRow[],
  from: string,
  to: string,
): ReportHistoryData {
  const byDate = new Map<string, HistoryDayRow>();

  // Zero-fill every calendar day in [from..to] so the trend has no gaps.
  for (
    let date = from, i = 0;
    date <= to && i < MAX_HISTORY_DAYS;
    date = addDaysToDateStr(date, 1), i += 1
  ) {
    byDate.set(date, {
      date,
      bookings: 0,
      covers: 0,
      seen_covers: 0,
      no_shows: 0,
      deposit_paid_pence: 0,
    });
  }

  for (const row of rows) {
    const day = byDate.get(row.booking_date);
    if (!day) continue;
    const partySize =
      typeof row.party_size === 'number' && row.party_size > 0 ? row.party_size : 0;
    day.bookings += 1;
    day.covers += partySize;
    if (isSeenBooking(row)) day.seen_covers += partySize;
    if (row.status === 'No-Show') day.no_shows += 1;
    if (row.deposit_status === 'Paid' && typeof row.deposit_amount_pence === 'number') {
      day.deposit_paid_pence += row.deposit_amount_pence;
    }
  }

  const days = [...byDate.values()];
  const totals = days.reduce<ReportHistoryTotals>(
    (acc, day) => ({
      bookings: acc.bookings + day.bookings,
      covers: acc.covers + day.covers,
      seen_covers: acc.seen_covers + day.seen_covers,
      no_shows: acc.no_shows + day.no_shows,
      deposit_paid_pence: acc.deposit_paid_pence + day.deposit_paid_pence,
    }),
    { bookings: 0, covers: 0, seen_covers: 0, no_shows: 0, deposit_paid_pence: 0 },
  );

  return { from, to, days, totals };
}

/**
 * Group daily rows into fixed-size buckets (e.g. 7 days) for readable charts
 * over long ranges. Buckets are labelled with their start date (MM-DD).
 */
export function bucketHistory(days: HistoryDayRow[], bucketSizeDays: number): HistoryBucket[] {
  if (bucketSizeDays <= 1) {
    return days.map((day) => ({
      key: day.date,
      label: day.date.slice(5),
      bookings: day.bookings,
      covers: day.covers,
      seen_covers: day.seen_covers,
      no_shows: day.no_shows,
      deposit_paid_pence: day.deposit_paid_pence,
    }));
  }

  const buckets: HistoryBucket[] = [];
  for (let start = 0; start < days.length; start += bucketSizeDays) {
    const slice = days.slice(start, start + bucketSizeDays);
    const first = slice[0];
    if (!first) break;
    buckets.push(
      slice.reduce<HistoryBucket>(
        (acc, day) => ({
          ...acc,
          bookings: acc.bookings + day.bookings,
          covers: acc.covers + day.covers,
          seen_covers: acc.seen_covers + day.seen_covers,
          no_shows: acc.no_shows + day.no_shows,
          deposit_paid_pence: acc.deposit_paid_pence + day.deposit_paid_pence,
        }),
        {
          key: first.date,
          label: first.date.slice(5),
          bookings: 0,
          covers: 0,
          seen_covers: 0,
          no_shows: 0,
          deposit_paid_pence: 0,
        },
      ),
    );
  }
  return buckets;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────
/**
 * Daily booking history for a date range (zero-filled), aggregated from the
 * Bearer-capable bookings list endpoint.
 */
export function useReportHistory(from: string, to: string, enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: reportHistoryKeys.range(accessToken, from, to),
    enabled: queryEnabled,
    queryFn: async (): Promise<ReportHistoryData> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const params = new URLSearchParams({ from, to, view: 'calendar' });
      const response = await apiFetch<BookingsListResponse>(
        `/api/venue/bookings/list?${params.toString()}`,
        { accessToken },
      );
      return aggregateHistory(response.bookings ?? [], from, to);
    },
  });
}

/**
 * Top identified clients by lifetime deposits collected (client lifetime
 * value). Uses the Bearer-capable guests directory with the web's
 * `paid_deposit_desc` spend sort.
 */
export function useTopClientsByLifetimeValue(limit = 8) {
  return useGuests({ sort: 'paid_deposit_desc', filter: 'identified', page: 0, limit });
}
