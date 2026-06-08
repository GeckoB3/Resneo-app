/**
 * GET /api/venue/appointment-availability response shapes.
 * @see _reference/reserve-ni/src/lib/availability/appointment-engine.ts
 */

export interface AppointmentSlot {
  practitioner_id: string;
  practitioner_name: string;
  service_id: string;
  service_name: string;
  start_time: string;
  duration_minutes: number;
  price_pence: number | null;
}

export interface AppointmentAvailabilityService {
  id: string;
  name: string;
  duration_minutes: number;
  price_pence: number | null;
  deposit_pence: number | null;
}

export interface AppointmentAvailabilityPractitioner {
  id: string;
  name: string;
  services: AppointmentAvailabilityService[];
  slots: AppointmentSlot[];
}

export interface AppointmentAvailabilityResponse {
  date: string;
  venue_id: string;
  practitioners: AppointmentAvailabilityPractitioner[];
}
