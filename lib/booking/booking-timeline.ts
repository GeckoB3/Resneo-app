import { format, parseISO } from 'date-fns';

/**
 * Booking activity timeline — mirrors web
 * `_reference/reserve-ni/src/lib/booking/format-booking-timeline-event.ts`.
 * Consumes the `events` array on GET /api/venue/bookings/[id] (Bearer-ready).
 */

export interface BookingTimelineEventRow {
  id: string;
  event_type: string;
  created_at: string;
  payload?: Record<string, unknown> | null;
}

interface BookingModifiedSnapshot {
  booking_date?: string | null;
  booking_time?: string | null;
  booking_end_time?: string | null;
  party_size?: number | null;
}

export interface DisplayTimelineEvent extends BookingTimelineEventRow {
  title: string;
  detail?: string;
}

function formatBookingDate(iso: string): string {
  try {
    return format(parseISO(`${iso}T12:00:00`), 'EEE d MMM');
  } catch {
    return iso;
  }
}

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
}

function timeHm(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const hm = value.trim().slice(0, 5);
  return /^\d{2}:\d{2}$/.test(hm) ? hm : null;
}

function describeScheduleChange(
  before: BookingModifiedSnapshot,
  after: BookingModifiedSnapshot,
): string[] {
  const parts: string[] = [];
  if (before.booking_date && after.booking_date && before.booking_date !== after.booking_date) {
    parts.push(`Date ${formatBookingDate(before.booking_date)} → ${formatBookingDate(after.booking_date)}`);
  }
  const beforeTime = timeHm(before.booking_time);
  const afterTime = timeHm(after.booking_time);
  if (beforeTime && afterTime && beforeTime !== afterTime) {
    parts.push(`Time ${beforeTime} → ${afterTime}`);
  }
  const beforeEnd = timeHm(before.booking_end_time);
  const afterEnd = timeHm(after.booking_end_time);
  if (beforeEnd && afterEnd && beforeEnd !== afterEnd) {
    parts.push(`End ${beforeEnd} → ${afterEnd}`);
  } else if (!beforeEnd && afterEnd) {
    parts.push(`End set to ${afterEnd}`);
  } else if (beforeEnd && !afterEnd) {
    parts.push(`End removed (was ${beforeEnd})`);
  }
  if (
    typeof before.party_size === 'number' &&
    typeof after.party_size === 'number' &&
    before.party_size !== after.party_size
  ) {
    parts.push(`Party size ${before.party_size} → ${after.party_size}`);
  }
  return parts;
}

/** Whether this event should appear in the booking timeline UI. */
export function shouldShowBookingTimelineEvent(event: BookingTimelineEventRow): boolean {
  const payload = payloadRecord(event.payload);
  switch (event.event_type) {
    case 'booking_status_changed':
      // Every change, not only confirmations (web QA B-5). The database trigger records each one as
      // { old_status, new_status }; the staff route then writes its own audit copy as { from, to },
      // which is skipped so a change shows once.
      return typeof payload?.new_status === 'string';
    case 'client_arrived_changed':
    case 'booking_created':
    case 'booking_modified':
    case 'auto_cancelled':
    case 'waitlist_converted':
    case 'card_hold_saved':
    case 'card_hold_released':
    case 'card_hold_charged':
    case 'card_hold_charge_failed':
    case 'card_hold_charge_refunded':
      return true;
    default:
      return false;
  }
}

/** "2500" -> "£25.00" for timeline detail lines. */
function poundsFromPence(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `£${(value / 100).toFixed(2)}`;
}

const CARD_HOLD_RELEASE_REASON_LABELS: Record<string, string> = {
  cancelled: 'booking cancelled',
  expired: 'charge window passed',
  refunded: 'fee refunded',
  abandoned: 'card not added in time',
  admin: 'waived by staff',
};

/** A status change other than a confirmation, in the words staff use for the buttons. */
function statusChangeTitle(oldStatus: string | null, newStatus: string): { title: string; detail?: string } {
  const from = oldStatus ? `From ${oldStatus.replace(/_/g, ' ')}` : undefined;
  switch (newStatus) {
    case 'Cancelled':
      return { title: 'Booking cancelled', detail: from };
    case 'No-Show':
      return { title: 'Marked as a no-show' };
    case 'Seated':
      return oldStatus === 'Completed' ? { title: 'Completion undone' } : { title: 'Started' };
    case 'Completed':
      return { title: 'Completed' };
    case 'Booked':
      if (oldStatus === 'Cancelled') return { title: 'Booking reinstated' };
      if (oldStatus === 'No-Show') return { title: 'No-show undone' };
      if (oldStatus === 'Confirmed') return { title: 'Confirmation undone' };
      if (oldStatus === 'Seated') return { title: 'Start undone' };
      return { title: 'Status changed to Booked', detail: from };
    default:
      return { title: `Status changed to ${newStatus.replace(/_/g, ' ')}`, detail: from };
  }
}

export function formatBookingTimelineEvent(event: BookingTimelineEventRow): {
  title: string;
  detail?: string;
} {
  const payload = payloadRecord(event.payload);

  switch (event.event_type) {
    case 'booking_created':
      return { title: 'Booking created' };

    case 'booking_status_changed': {
      const confirmedBy = payload?.confirmed_by;
      if (confirmedBy === 'guest') return { title: 'Confirmed by guest' };
      if (confirmedBy === 'staff') return { title: 'Confirmed by staff' };
      if (confirmedBy === 'both') return { title: 'Confirmed by guest and staff' };
      const oldStatus = typeof payload?.old_status === 'string' ? payload.old_status : null;
      const newStatus = typeof payload?.new_status === 'string' ? payload.new_status : null;
      if (newStatus && newStatus !== 'Confirmed') {
        return statusChangeTitle(oldStatus, newStatus);
      }
      const detail = oldStatus && oldStatus !== 'Confirmed' ? `From ${oldStatus.replace(/_/g, ' ')}` : undefined;
      return { title: 'Booking confirmed', detail };
    }

    case 'client_arrived_changed':
      return { title: payload?.arrived === false ? 'Arrival undone' : 'Client arrived' };

    case 'booking_modified': {
      const actor =
        payload?.modification_actor === 'guest'
          ? 'Guest'
          : payload?.modification_actor === 'staff'
            ? 'Staff'
            : 'User';
      const before = (payload?.before ?? {}) as BookingModifiedSnapshot;
      const after = (payload?.after ?? {}) as BookingModifiedSnapshot;
      const changes = describeScheduleChange(before, after);
      return {
        title: `Booking modified (${actor})`,
        detail: changes.length > 0 ? changes.join(' · ') : 'Booking details updated',
      };
    }

    case 'auto_cancelled':
      return { title: 'Booking auto-cancelled' };

    case 'waitlist_converted':
      return { title: 'Converted from waitlist' };

    case 'card_hold_saved': {
      const fee = poundsFromPence(payload?.fee_pence);
      return {
        title: 'Card saved for no-show fee',
        detail: fee ? `No-show fee up to ${fee}` : undefined,
      };
    }

    case 'card_hold_charged': {
      const charged = poundsFromPence(payload?.charged_pence);
      return {
        title: 'No-show fee charged',
        detail: charged ? `${charged} charged to the saved card` : undefined,
      };
    }

    case 'card_hold_charge_refunded': {
      const charged = poundsFromPence(payload?.charged_pence);
      return {
        title: 'No-show fee refunded',
        detail: charged ? `${charged} refunded` : undefined,
      };
    }

    case 'card_hold_charge_failed': {
      const code =
        typeof payload?.failure_code === 'string' ? payload.failure_code.replace(/_/g, ' ') : null;
      return {
        title: 'No-show fee charge failed',
        detail: code ? `Reason: ${code}` : undefined,
      };
    }

    case 'card_hold_released': {
      const reason =
        typeof payload?.release_reason === 'string'
          ? CARD_HOLD_RELEASE_REASON_LABELS[payload.release_reason]
          : null;
      return {
        title: 'Card hold ended',
        detail: reason ? `Reason: ${reason}` : undefined,
      };
    }

    default:
      return {
        title: event.event_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      };
  }
}

export function bookingTimelineEventsForDisplay(
  events: BookingTimelineEventRow[],
): DisplayTimelineEvent[] {
  return events.filter(shouldShowBookingTimelineEvent).map((event) => {
    const { title, detail } = formatBookingTimelineEvent(event);
    return { ...event, title, detail };
  });
}

/** Human label for an event timestamp, e.g. "9 Jun, 14:30". */
export function formatTimelineEventTime(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM, HH:mm');
  } catch {
    return iso;
  }
}
