/**
 * GET /api/venue/booking-activity: one row per new booking, cancellation or move, newest first
 * (web Docs/booking-activity-plan.md, BA2). Mirrors web `src/lib/booking-activity/types.ts`.
 *
 * The server words every row, so the app shows `client_name`, `text`, `by_label` and `at_label`
 * as they come and never builds a sentence of its own.
 */

export type BookingActivityKind = 'new' | 'cancelled' | 'moved';

/** A new booking not on the books yet: the client still has to add a card or pay. */
export type BookingActivityState = 'waiting_for_card' | 'waiting_for_payment';

export interface BookingActivityItem {
  /** Stable key for the row. */
  id: string;
  kind: BookingActivityKind;
  /** When it happened (ISO). */
  at: string;
  /** When it happened in the venue's time zone: "Today 10:42am", "Yesterday 4:20pm", "Mon 24 Nov, 9:15am". */
  at_label: string;
  /** The booking a tap opens (the visit's first service for a visit). */
  booking_id: string;
  /** The client's name, shown first and in bold. */
  client_name: string;
  /** What happened, already worded by the server. */
  text: string;
  /** Who did it: "Online", "By the client", "By Jenny Ross", "By your team", ... Null when unknown. */
  by_label: string | null;
  /** Set on a new booking still waiting for the client. */
  state: BookingActivityState | null;
}

export interface BookingActivityResponse {
  items: BookingActivityItem[];
  /** Pass back as `before` for the next page; null when there is nothing older. */
  next_before: string | null;
  /** Whether this person works any calendar here, so "Just my clients" means something. */
  has_calendars: boolean;
  /** True when this person only ever sees their own clients (their other diaries are Hidden). */
  only_mine: boolean;
}

export const BOOKING_ACTIVITY_KINDS = ['all', 'new', 'cancelled', 'moved'] as const;
export type BookingActivityFilter = (typeof BOOKING_ACTIVITY_KINDS)[number];

/** The filter chips' words. */
export const BOOKING_ACTIVITY_FILTER_LABELS: Record<BookingActivityFilter, string> = {
  all: 'All',
  new: 'New',
  cancelled: 'Cancelled',
  moved: 'Moved',
};

/** The pill on a new booking still waiting for the client. */
export const BOOKING_ACTIVITY_STATE_LABELS: Record<BookingActivityState, string> = {
  waiting_for_card: 'Waiting for card',
  waiting_for_payment: 'Waiting for payment',
};

/** Rows per page (web BOOKING_ACTIVITY_PAGE). */
export const BOOKING_ACTIVITY_PAGE = 50;
