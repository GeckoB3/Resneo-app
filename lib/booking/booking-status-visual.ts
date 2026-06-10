/**
 * Booking status colours — ported from web `table-management/booking-status-visual.ts`.
 * Used for list stripes, status dots, and the calendar day-grid booking bars.
 */
export interface BookingStatusVisual {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  dotColor: string;
  listStripeColor: string;
  /** Bold, saturated fill for calendar day-grid booking bars (status is the hero). */
  calendarBlock: BookingStatusCalendarBlock;
}

/**
 * Calendar booking bars use **bold, saturated fills** (`bg`) so they pop against the pale grid,
 * with `text` white on dark fills (or a deep hue on the two light fills, Arrived/Cancelled).
 * `accent` is the deep status hue (status dot / frosted pill label, legible on white).
 */
export interface BookingStatusCalendarBlock {
  bg: string;
  text: string;
  border: string;
  accent: string;
}

const DEFAULT: BookingStatusVisual = {
  backgroundColor: '#F8FAFB',
  borderColor: '#E2E8EC',
  textColor: '#5C6B73',
  dotColor: '#8A969C',
  listStripeColor: '#94A3B8',
  calendarBlock: { bg: '#64748B', text: '#FFFFFF', border: '#475569', accent: '#475569' },
};

/** Web dashboard palette — Pending orange, Booked sky, Confirmed navy, Seated/Started emerald. */
const MAP: Record<string, BookingStatusVisual> = {
  Pending: {
    backgroundColor: '#FFEDD5',
    borderColor: '#FDBA74',
    textColor: '#9A3412',
    dotColor: '#EA580C',
    listStripeColor: '#EA580C',
    calendarBlock: { bg: '#EA580C', text: '#FFFFFF', border: '#C2410C', accent: '#C2410C' },
  },
  Booked: {
    backgroundColor: '#E0F2FE',
    borderColor: '#38BDF8',
    textColor: '#0C4A6E',
    dotColor: '#0369A1',
    listStripeColor: '#0369A1',
    calendarBlock: { bg: '#0369A1', text: '#FFFFFF', border: '#075985', accent: '#0369A1' },
  },
  Confirmed: {
    backgroundColor: '#C6D8E9',
    borderColor: '#003B6F',
    textColor: '#00264A',
    dotColor: '#003B6F',
    listStripeColor: '#003B6F',
    calendarBlock: { bg: '#003B6F', text: '#FFFFFF', border: '#00284B', accent: '#003B6F' },
  },
  Seated: {
    backgroundColor: '#D1FAE5',
    borderColor: '#34D399',
    textColor: '#064E3B',
    dotColor: '#047857',
    listStripeColor: '#047857',
    // Started / in-progress: brighter emerald-600 fill so active bookings pop; emerald-700 edge.
    calendarBlock: { bg: '#059669', text: '#FFFFFF', border: '#047857', accent: '#047857' },
  },
  Arrived: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FBBF24',
    textColor: '#78350F',
    dotColor: '#D97706',
    listStripeColor: '#D97706',
    calendarBlock: { bg: '#F59E0B', text: '#451A03', border: '#D97706', accent: '#B45309' },
  },
  Completed: {
    backgroundColor: '#E5E7EB',
    borderColor: '#9CA3AF',
    textColor: '#374151',
    dotColor: '#4B5563',
    listStripeColor: '#4B5563',
    calendarBlock: { bg: '#475569', text: '#FFFFFF', border: '#334155', accent: '#4B5563' },
  },
  'No-Show': {
    backgroundColor: '#FEE2E2',
    borderColor: '#F87171',
    textColor: '#991B1B',
    dotColor: '#DC2626',
    listStripeColor: '#DC2626',
    calendarBlock: { bg: '#DC2626', text: '#FFFFFF', border: '#B91C1C', accent: '#DC2626' },
  },
  Cancelled: {
    backgroundColor: '#E5E7EB',
    borderColor: '#D1D5DB',
    textColor: '#4B5563',
    dotColor: '#4B5563',
    listStripeColor: '#4B5563',
    // Cancelled is excluded from the calendar grid; stays a recessive pale ghost, never a bold fill.
    calendarBlock: { bg: '#E2E8F0', text: '#475569', border: '#CBD5E1', accent: '#475569' },
  },
  'Deposit Pending': {
    backgroundColor: '#FFEDD5',
    borderColor: '#FB923C',
    textColor: '#9A3412',
    dotColor: '#EA580C',
    listStripeColor: '#EA580C',
    calendarBlock: { bg: '#EA580C', text: '#FFFFFF', border: '#C2410C', accent: '#C2410C' },
  },
};

export function bookingStatusVisualForKey(statusKey: string): BookingStatusVisual {
  return MAP[statusKey] ?? DEFAULT;
}

/** Booking fields that drive the calendar/list display key (lifecycle + attendance + arrived). */
export interface BookingStatusVisualRow {
  status: string;
  client_arrived_at?: string | null;
  staff_attendance_confirmed_at?: string | null;
  guest_attendance_confirmed_at?: string | null;
}

function isAttendanceConfirmed(row: BookingStatusVisualRow): boolean {
  return !!row.staff_attendance_confirmed_at || !!row.guest_attendance_confirmed_at;
}

/** Guest marked arrived while still pending / booked / confirmed (waiting to start). */
export function isArrivedWaitingDisplay(row: BookingStatusVisualRow): boolean {
  if (!row.client_arrived_at) return false;
  return row.status === 'Pending' || row.status === 'Booked' || row.status === 'Confirmed';
}

/**
 * Canonical visual key for booking bars and list stripes (lifecycle + attendance + arrived).
 * Mirrors the web `bookingDisplayVisualKey`. Calendar bars resolve through this so a guest who's
 * arrived (but not yet started) and an attendance-confirmed booking each get their own colour.
 */
export function bookingDisplayVisualKey(row: BookingStatusVisualRow): string {
  const status = row.status;
  if (status === 'Cancelled') return 'Cancelled';
  if (status === 'No-Show') return 'No-Show';
  if (status === 'Completed') return 'Completed';
  if (status === 'Seated') return 'Seated';
  if (isArrivedWaitingDisplay(row)) return 'Arrived';
  if (status === 'Confirmed') return 'Confirmed';
  if (status === 'Pending' || status === 'Booked') {
    if (isAttendanceConfirmed(row)) return 'Confirmed';
    if (status === 'Pending') return 'Pending';
    return 'Booked';
  }
  return 'Booked';
}

/** Saturated fill palette for a calendar day-grid booking bar (after applying attendance/arrived overlay). */
export function bookingCalendarBlockPalette(row: BookingStatusVisualRow): BookingStatusCalendarBlock {
  return bookingStatusVisualForKey(bookingDisplayVisualKey(row)).calendarBlock;
}
