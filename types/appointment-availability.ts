/**
 * GET /api/venue/appointment-availability response shapes.
 * @see _reference/reserve-ni/src/lib/availability/appointment-engine.ts
 */

import type { ProcessingTimeBlock } from '@/types/services-manage';

export interface AppointmentSlot {
  practitioner_id: string;
  practitioner_name: string;
  service_id: string;
  service_name: string;
  start_time: string;
  duration_minutes: number;
  price_pence: number | null;
  /**
   * A visit with a person per service (web split-visit plan 8.3): the server's plan for this start,
   * one entry per service in visit order. The review and the create use these times and people
   * exactly. Absent on every other slot.
   */
  segments?: PlannedVisitSegment[];
}

/** One service of a planned visit, as `GET /api/booking/availability?services=` spells it out. */
export interface PlannedVisitSegment {
  /** The id the request named (on a collective, the offering). */
  service_id: string;
  practitioner_id: string;
  practitioner_name: string;
  /** The business that does this service (a member business on a collective). */
  venue_id: string;
  start_time: string;
  end_time: string;
  /** Add-on minutes included. */
  duration_minutes: number;
  buffer_minutes: number;
  processing_time_blocks: ProcessingTimeBlock[];
  /** The client's wait before this service. */
  wait_before_minutes: number;
  /** On this person's calendar, add-ons included. */
  price_pence: number | null;
  /** Taken online when booking: a deposit or the full price; null when nothing is. */
  deposit_pence: number | null;
  payment: 'deposit' | 'full_payment' | 'card_hold' | null;
  card_hold_fee_pence: number | null;
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
  /**
   * Staff lookups only: why the date has no times when a booking rule rules it out ("Cut can be
   * booked up to 90 days ahead, so this date is too far away. ..."), web QA 2026-11-08 SCH-F15.
   */
  unavailable_reason?: string;
}
