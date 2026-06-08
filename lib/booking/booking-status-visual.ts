/**
 * Booking status colours — ported from web `booking-status-visual.ts`.
 * Used for list stripes, pills, and badges across the mobile app.
 */
export interface BookingStatusVisual {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  dotColor: string;
  listStripeColor: string;
}

const DEFAULT: BookingStatusVisual = {
  backgroundColor: '#F8FAFB',
  borderColor: '#E2E8EC',
  textColor: '#5C6B73',
  dotColor: '#8A969C',
  listStripeColor: '#94A3B8',
};

/** Web dashboard palette — Pending amber, Booked sky, Confirmed indigo, Seated emerald. */
const MAP: Record<string, BookingStatusVisual> = {
  Pending: {
    backgroundColor: '#FFEDD5',
    borderColor: '#FDBA74',
    textColor: '#9A3412',
    dotColor: '#EA580C',
    listStripeColor: '#EA580C',
  },
  Booked: {
    backgroundColor: '#E0F2FE',
    borderColor: '#38BDF8',
    textColor: '#0C4A6E',
    dotColor: '#0369A1',
    listStripeColor: '#0369A1',
  },
  Confirmed: {
    backgroundColor: '#E0E7FF',
    borderColor: '#818CF8',
    textColor: '#312E81',
    dotColor: '#4338CA',
    listStripeColor: '#4338CA',
  },
  Seated: {
    backgroundColor: '#D1FAE5',
    borderColor: '#34D399',
    textColor: '#064E3B',
    dotColor: '#047857',
    listStripeColor: '#047857',
  },
  Arrived: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FBBF24',
    textColor: '#78350F',
    dotColor: '#D97706',
    listStripeColor: '#D97706',
  },
  Completed: {
    backgroundColor: '#E5E7EB',
    borderColor: '#9CA3AF',
    textColor: '#374151',
    dotColor: '#4B5563',
    listStripeColor: '#4B5563',
  },
  'No-Show': {
    backgroundColor: '#FEE2E2',
    borderColor: '#F87171',
    textColor: '#991B1B',
    dotColor: '#DC2626',
    listStripeColor: '#DC2626',
  },
  Cancelled: {
    backgroundColor: '#E5E7EB',
    borderColor: '#D1D5DB',
    textColor: '#4B5563',
    dotColor: '#4B5563',
    listStripeColor: '#4B5563',
  },
  'Deposit Pending': {
    backgroundColor: '#FFEDD5',
    borderColor: '#FB923C',
    textColor: '#9A3412',
    dotColor: '#EA580C',
    listStripeColor: '#EA580C',
  },
};

export function bookingStatusVisualForKey(statusKey: string): BookingStatusVisual {
  return MAP[statusKey] ?? DEFAULT;
}
