/**
 * Where a customer's booking stands, read from the status the API sends.
 *
 * The API sends the database's own values ("Booked", "Cancelled", "No-Show",
 * "Completed"), not lower-case keys. The customer screens compared against
 * 'cancelled' and 'no_show', which never matched, so a cancelled booking
 * showed as BOOKED with Cancel and "Confirm I am coming" still offered. One
 * reading here keeps the list, the detail and the actions in step.
 */
export type CustomerBookingState = 'live' | 'cancelled' | 'completed' | 'missed';

export function customerBookingState(status: string | null | undefined): CustomerBookingState {
  const key = (status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (key === 'cancelled' || key === 'canceled') return 'cancelled';
  if (key === 'completed') return 'completed';
  if (key === 'no_show' || key === 'noshow') return 'missed';
  return 'live';
}
