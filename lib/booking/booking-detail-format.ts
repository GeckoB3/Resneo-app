/**
 * Small pure helpers of the booking detail panel
 * (`components/bookings/BookingDetailContent.tsx`), moved out of the panel
 * unchanged (codebase standards P5.2).
 */
import { format, parseISO } from 'date-fns';
import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { type CardHoldPillVariant } from '@/lib/booking/card-hold';
import { formatPositivePence } from '@/lib/format';
import { type RebookBootstrapPayload } from '@/lib/rebook-bootstrap';
import type { GuestBookingHistoryRow } from '@/types/guest-detail';
import type { BookingDetail, BookingStatus } from '@/types/booking-detail';

export const TERMINAL_STATUSES = new Set<BookingStatus>(['Cancelled', 'Completed', 'No-Show']);

export function formatGuestName(booking: BookingDetail): string {
  const guest = booking.guest;
  if (guest) {
    const parts = [guest.first_name, guest.last_name].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(' ');
    }
  }
  return 'Client';
}

/** "Friday 13 June" — the appointment's day, headline-style. */
export function formatBookingDateLabel(date: string, time: string): string {
  try {
    return format(parseISO(`${date}T${time.slice(0, 5)}:00`), 'EEEE d MMMM');
  } catch {
    return date;
  }
}

/**
 * "14:00 – 15:00", falling back to the start plus the resolved core duration
 * when the row has no `booking_end_time` (every guest-created appointment), and
 * to the bare start when nothing resolves an end at all.
 */
export function formatBookingTimeRange(
  time: string,
  endTime?: string | null,
  durationMinutes?: number | null,
): string {
  const start = time.slice(0, 5);
  if (endTime?.trim()) {
    return `${start} – ${endTime.slice(0, 5)}`;
  }
  if (durationMinutes != null && durationMinutes > 0) {
    // Wrap, don't clamp: `minutesToTime` pins anything past midnight to 23:59,
    // so a 23:30 appointment running an hour read "23:30 – 23:59" instead of
    // "23:30 – 00:30". The date lives elsewhere on the card, as it does for the
    // stored `booking_end_time`, which is a bare wall clock for the same reason.
    return `${start} – ${minutesToTime((timeToMinutes(start) + durationMinutes) % (24 * 60))}`;
  }
  return start;
}

export const formatDeposit = formatPositivePence;

/** Web pill variants (§9.1) → app Badge tones ('info' teal maps to accent). */
export const CARD_HOLD_BADGE_TONE: Record<CardHoldPillVariant, 'warning' | 'accent' | 'neutral' | 'brand'> = {
  warning: 'warning',
  info: 'accent',
  neutral: 'neutral',
  brand: 'brand',
};

/**
 * Appointment rebook block from a guest-history row, or null when the row isn't
 * a repeatable appointment (events/classes/resources pick a fresh slot). Mirrors
 * the practitioner/service id fallbacks used by the detail's Rebook action.
 */
export function historyRowAppointment(
  row: GuestBookingHistoryRow,
): RebookBootstrapPayload['appointment'] | null {
  const practitionerId = row.practitioner_id ?? row.calendar_id ?? null;
  const serviceId = row.appointment_service_id ?? row.service_item_id ?? null;
  if (!practitionerId || !serviceId) return null;
  return {
    serviceId,
    practitionerId,
    variantId: row.service_variant_id ?? null,
  };
}

export function formatShortDate(value: string): string {
  try {
    return format(parseISO(value), 'd MMM yyyy');
  } catch {
    return value;
  }
}
