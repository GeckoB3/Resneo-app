import type { BookingModel } from '@/types/venue';

const VALID: BookingModel[] = [
  'table_reservation',
  'practitioner_appointment',
  'unified_scheduling',
  'event_ticket',
  'class_session',
  'resource_booking',
];

function isBookingModel(raw: unknown): raw is BookingModel {
  return typeof raw === 'string' && (VALID as string[]).includes(raw);
}

/**
 * Infer booking model from a list/detail row — mirrors web `inferBookingRowModel`.
 */
export function inferBookingRowModel(row: {
  booking_model?: string | null;
  experience_event_id?: string | null;
  class_instance_id?: string | null;
  resource_id?: string | null;
  event_session_id?: string | null;
  calendar_id?: string | null;
  service_item_id?: string | null;
  practitioner_id?: string | null;
  appointment_service_id?: string | null;
}): BookingModel {
  if (isBookingModel(row.booking_model)) {
    return row.booking_model;
  }
  if (row.experience_event_id) return 'event_ticket';
  if (row.class_instance_id) return 'class_session';
  if (row.resource_id) return 'resource_booking';
  if (row.event_session_id) return 'unified_scheduling';
  if (row.calendar_id && row.service_item_id) return 'unified_scheduling';
  if (row.practitioner_id && row.appointment_service_id) return 'practitioner_appointment';
  return 'table_reservation';
}

export function isTableReservationBooking(row: {
  booking_model?: string | null;
  inferred_booking_model?: string | null;
  experience_event_id?: string | null;
  class_instance_id?: string | null;
  resource_id?: string | null;
  event_session_id?: string | null;
  calendar_id?: string | null;
  service_item_id?: string | null;
  practitioner_id?: string | null;
  appointment_service_id?: string | null;
}): boolean {
  if (row.inferred_booking_model) {
    return row.inferred_booking_model === 'table_reservation';
  }
  return inferBookingRowModel(row) === 'table_reservation';
}

/** Dining uses "Seated"; appointments/classes use "Started" (same status value). */
export function bookingSeatedStatusDisplayLabel(isTableReservation: boolean): 'Seated' | 'Started' {
  return isTableReservation ? 'Seated' : 'Started';
}

export function bookingStatusDisplayLabel(status: string, isTableReservation: boolean): string {
  if (status === 'Seated') {
    return bookingSeatedStatusDisplayLabel(isTableReservation);
  }
  return status;
}

const SHORT: Record<BookingModel, string> = {
  table_reservation: 'Table',
  practitioner_appointment: 'Appointment',
  unified_scheduling: 'Appointment',
  event_ticket: 'Event',
  class_session: 'Class',
  resource_booking: 'Resource',
};

export function bookingModelShortLabel(model: BookingModel | string): string {
  return SHORT[model as BookingModel] ?? model;
}
