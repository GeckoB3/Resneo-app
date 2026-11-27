import { useEffect, useState } from 'react';

import { ApiError, apiFetch } from '@/lib/api/client';
import { bookingQuoteKey, parseBookingQuote, type BookingQuote, type BookingQuoteRequest } from '@/lib/booking/booking-quote';
import { isBackendConfigured } from '@/lib/env';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/** How long the inputs must stay still before the quote is asked (a toggle tapped twice asks once). */
export const BOOKING_QUOTE_DEBOUNCE_MS = 250;

/** A quote stays good this long for the same inputs (going back and forth costs nothing). */
const QUOTE_FRESH_MS = 30_000;

/**
 * Answers by request, and requests in flight, shared by every screen asking (the visit's review
 * and its confirm step ask the same thing). Kept here rather than in React Query so a screen needs
 * no provider to fall back: without a quote it shows its local figures, as before.
 */
const answers = new Map<string, BookingQuote | null>();
const inFlight = new Map<string, Promise<BookingQuote | null>>();

/**
 * Set once a server answers 404: it has no quote route (web before P4.2), so this run of the app
 * stops asking and keeps its local rules.
 */
let quoteRouteMissing = false;

/** For tests: forget every answer, and that the route was missing. */
export function resetBookingQuotesForTests(): void {
  answers.clear();
  inFlight.clear();
  quoteRouteMissing = false;
}

/** Ask the server, once per request at a time; every failure answers null (the fallback). */
export function fetchBookingQuote(key: string, accessToken: string, expectedItems: number): Promise<BookingQuote | null> {
  if (answers.has(key)) return Promise.resolve(answers.get(key) ?? null);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const asked = apiFetch<unknown>('/api/venue/bookings/quote', { accessToken, method: 'POST', body: key })
    .then((body) => parseBookingQuote(body, expectedItems))
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) quoteRouteMissing = true;
      return null;
    })
    .then((quote) => {
      answers.set(key, quote);
      // Forgotten after a while: a deadline or a price may have moved on since.
      setTimeout(() => {
        if (answers.get(key) === quote) answers.delete(key);
      }, QUOTE_FRESH_MS);
      inFlight.delete(key);
      return quote;
    });
  inFlight.set(key, asked);
  return asked;
}

/** What the screen reads: the quote for the inputs as they are now, or null (use the local rules). */
export interface BookingQuoteState {
  quote: BookingQuote | null;
  /** A quote is being asked for the current inputs; the screen shows its local figures meanwhile. */
  isLoading: boolean;
}

/**
 * POST /api/venue/bookings/quote (web codebase standards plan P4.2): the server's times, prices and
 * charges for a staff booking before it is made. `request` null asks nothing.
 *
 * The screen stays usable while it loads, as it was: until the quote for the CURRENT inputs is
 * here, `quote` is null and the screen shows its local figures. A quote for older inputs is never
 * shown. A 404 (an older server), any refusal or a network failure is null too: the fallback.
 */
export function useBookingQuote(request: BookingQuoteRequest | null): BookingQuoteState {
  const accessToken = useAccessToken();
  const key = bookingQuoteKey(request);
  const itemCount = request?.items.length ?? 0;
  const [answer, setAnswer] = useState<{ key: string; quote: BookingQuote | null } | null>(null);
  const asks = key !== null && accessToken !== null && !quoteRouteMissing && isBackendConfigured();
  // Inputs already answered (going back to them) are read straight from what is kept.
  const known = asks && key !== null && answers.has(key);

  useEffect(() => {
    if (!asks || key === null || accessToken === null || known) return;
    let live = true;
    const timer = setTimeout(() => {
      void fetchBookingQuote(key, accessToken, itemCount).then((quote) => {
        if (live) setAnswer({ key, quote });
      });
    }, BOOKING_QUOTE_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [asks, key, accessToken, itemCount, known]);

  if (!asks) return { quote: null, isLoading: false };
  if (known && key !== null) return { quote: answers.get(key) ?? null, isLoading: false };
  const current = answer !== null && answer.key === key ? answer.quote : null;
  return { quote: current, isLoading: answer === null || answer.key !== key };
}
