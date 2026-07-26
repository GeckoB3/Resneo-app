/**
 * Web-parity action colours — each booking action keeps the same colour as
 * its counterpart on the web dashboard so staff can track actions on sight:
 * Confirm = sky blue, Start/Seat & Complete = emerald, Arrived = amber,
 * staff-attendance confirm = violet, No-Show = rose, Cancel = red (danger).
 */
import type { BookingStatus } from '@/types/booking-detail';

export interface ActionColors {
  background: string;
  text: string;
}

export const ACTION_COLORS = {
  confirm: { background: '#0369A1', text: '#FFFFFF' }, // sky-700
  start: { background: '#059669', text: '#FFFFFF' }, // emerald-600
  complete: { background: '#047857', text: '#FFFFFF' }, // emerald-700
  arrived: { background: '#F59E0B', text: '#451A03' }, // amber attention
  attendance: { background: '#7C3AED', text: '#FFFFFF' }, // violet
  noShow: { background: '#E11D48', text: '#FFFFFF' }, // rose-600
  // Take payment: brand navy. Deliberately not green — emerald already means
  // "start/complete" in this toolbar, and a money action must not be mistaken
  // for a lifecycle one at a glance.
  payment: { background: '#003B6F', text: '#FFFFFF' },
} as const satisfies Record<string, ActionColors>;

/** Colour for a forward status transition, keyed by its TARGET status. */
export function primaryActionColors(target: BookingStatus): ActionColors | undefined {
  switch (target) {
    case 'Booked':
    case 'Confirmed':
      return ACTION_COLORS.confirm;
    case 'Seated':
      return ACTION_COLORS.start;
    case 'Completed':
      return ACTION_COLORS.complete;
    default:
      return undefined;
  }
}
