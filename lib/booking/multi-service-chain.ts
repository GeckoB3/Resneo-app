/**
 * Multi-service back-to-back appointment chaining + group-booking payload shapes.
 *
 * Mirrors the web staff `AppointmentBookingFlow` (`recomputeMultiServiceChain`,
 * `MultiServiceSegment`) and the two dedicated create endpoints:
 *   - POST /api/booking/create-multi-service  (one guest, one practitioner,
 *     consecutive services linked by a single group_booking_id)
 *   - POST /api/booking/create-group          (multiple distinct attendees,
 *     one organiser contact, linked by a single group_booking_id)
 *
 * Both are PUBLIC `/api/booking/*` routes the web staff flow posts to with
 * `source: 'phone' | 'walk-in'` (they run admin-side server work, so the app's
 * Bearer token is harmless/ignored). Kept as a pure module so the chain maths
 * and payload shapes are unit-testable without a device.
 */

import { minutesToTime, timeToMinutes } from '@/lib/booking/booking-format';
import type { ServiceLocationType } from '@/types/services-manage';

/** A single service in a multi-service (back-to-back) visit for one client. */
export interface MultiServiceSegment {
  serviceId: string;
  serviceName: string;
  /** When the parent service has variants, the picked sub-option id. */
  serviceVariantId?: string | null;
  practitionerId: string;
  practitionerName: string;
  /** Recomputed by `recomputeMultiServiceChain`; the working value before that is ignored. */
  startTime: string;
  /** Includes add-on minutes so chain start times line up with the server's consecutive check. */
  durationMinutes: number;
  bufferMinutes: number;
  /** Service+variant price only (add-on price tracked separately). */
  pricePence: number | null;
  /** Chosen add-on ids for this segment. */
  addonIds?: string[];
  /** Sum of add-on price for display on the review card. */
  addonTotalPence?: number;
  /** Sum of add-on minutes folded into `durationMinutes`. */
  addonTotalMinutes?: number;
}

/**
 * Re-chain the segment start times so each starts at the previous segment's
 * end + buffer, anchored at `firstStart` (HH:mm). Verbatim mirror of the web's
 * `recomputeMultiServiceChain` — the server re-validates the same invariant
 * (`each start === previous end + buffer`) in /api/booking/create-multi-service.
 */
export function recomputeMultiServiceChain(
  segments: MultiServiceSegment[],
  firstStart: string,
): MultiServiceSegment[] {
  let runningMinutes = timeToMinutes(firstStart);
  return segments.map((seg) => {
    const row = { ...seg, startTime: minutesToTime(runningMinutes) };
    runningMinutes += seg.durationMinutes + seg.bufferMinutes;
    return row;
  });
}

/** One attendee in a group booking (a distinct person, own service + slot). */
export interface GroupPerson {
  /** Display label for the attendee (e.g. their name or "Guest 2"). */
  label: string;
  serviceId: string;
  serviceName: string;
  serviceVariantId?: string | null;
  practitionerId: string;
  practitionerName: string;
  bookingDate: string;
  /** HH:mm[:ss]. */
  bookingTime: string;
  durationMinutes: number;
  pricePence: number | null;
  addonIds?: string[];
  addonTotalPence?: number;
  /** Where this attendee's service is delivered; 'client_address' makes the group
   *  flow collect a visit address. App-internal — not serialized into the payload. */
  locationType?: ServiceLocationType;
}

export type BookingSource = 'phone' | 'walk-in';

/** Organiser/contact details shared by every booking in a group or chain. */
export interface BookingContact {
  first_name: string;
  last_name: string;
  /** Already-normalised phone (E.164 or raw) or undefined. */
  phone?: string;
  email?: string;
  /** Free-text comment, folded into dietary_notes (web parity). */
  dietary_notes?: string;
}

/** Address fields for at-home (`client_address`) services. */
export interface ClientAddressInput {
  client_address_line1?: string;
  client_address_line2?: string;
  client_address_city?: string;
  client_address_postcode?: string;
}

/** Drop empty address fields; line1 is the gate (mirrors web `clientAddressPayloadFields`). */
export function clientAddressPayloadFields(
  address: ClientAddressInput | null | undefined,
): ClientAddressInput {
  const line1 = address?.client_address_line1?.trim();
  if (!line1) return {};
  const out: ClientAddressInput = { client_address_line1: line1 };
  const line2 = address?.client_address_line2?.trim();
  const city = address?.client_address_city?.trim();
  const postcode = address?.client_address_postcode?.trim();
  if (line2) out.client_address_line2 = line2;
  if (city) out.client_address_city = city;
  if (postcode) out.client_address_postcode = postcode;
  return out;
}

/** Request body for POST /api/booking/create-multi-service. */
export interface CreateMultiServicePayload {
  venue_id: string;
  booking_date: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  source: BookingSource;
  services: Array<{
    service_id: string;
    practitioner_id: string;
    start_time: string;
    service_variant_id?: string;
    addons?: { addon_id: string }[];
  }>;
  dietary_notes?: string;
  client_address_line1?: string;
  client_address_line2?: string;
  client_address_city?: string;
  client_address_postcode?: string;
}

/** Request body for POST /api/booking/create-group. */
export interface CreateGroupPayload {
  venue_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  source: BookingSource;
  people: Array<{
    person_label: string;
    practitioner_id: string;
    appointment_service_id: string;
    service_variant_id?: string;
    addons?: { addon_id: string }[];
    booking_date: string;
    booking_time: string;
  }>;
  dietary_notes?: string;
  client_address_line1?: string;
  client_address_line2?: string;
  client_address_city?: string;
  client_address_postcode?: string;
}

function trimTime(time: string): string {
  return time.slice(0, 5);
}

/**
 * Build the multi-service create body from a chained segment list + contact.
 * `venueId` is the effective venue (own or linked owner). The caller must have
 * already run `recomputeMultiServiceChain` on the segments.
 */
export function buildMultiServicePayload(args: {
  venueId: string;
  bookingDate: string;
  contact: BookingContact;
  source: BookingSource;
  segments: MultiServiceSegment[];
  address?: ClientAddressInput | null;
}): CreateMultiServicePayload {
  const { venueId, bookingDate, contact, source, segments, address } = args;
  const email = contact.email?.trim();
  const phone = contact.phone?.trim();
  const dietary = contact.dietary_notes?.trim();
  return {
    venue_id: venueId,
    booking_date: bookingDate,
    first_name: contact.first_name.trim(),
    last_name: contact.last_name.trim(),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    source,
    services: segments.map((seg) => ({
      service_id: seg.serviceId,
      practitioner_id: seg.practitionerId,
      start_time: trimTime(seg.startTime),
      ...(seg.serviceVariantId ? { service_variant_id: seg.serviceVariantId } : {}),
      ...(seg.addonIds && seg.addonIds.length > 0
        ? { addons: seg.addonIds.map((id) => ({ addon_id: id })) }
        : {}),
    })),
    ...(dietary ? { dietary_notes: dietary } : {}),
    ...clientAddressPayloadFields(address),
  };
}

/** Build the group create body from a list of distinct attendees + organiser contact. */
export function buildGroupPayload(args: {
  venueId: string;
  contact: BookingContact;
  source: BookingSource;
  people: GroupPerson[];
  address?: ClientAddressInput | null;
}): CreateGroupPayload {
  const { venueId, contact, source, people, address } = args;
  const email = contact.email?.trim();
  const phone = contact.phone?.trim();
  const dietary = contact.dietary_notes?.trim();
  return {
    venue_id: venueId,
    first_name: contact.first_name.trim(),
    last_name: contact.last_name.trim(),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    source,
    people: people.map((p) => ({
      person_label: p.label.trim() || 'Guest',
      practitioner_id: p.practitionerId,
      appointment_service_id: p.serviceId,
      ...(p.serviceVariantId ? { service_variant_id: p.serviceVariantId } : {}),
      ...(p.addonIds && p.addonIds.length > 0
        ? { addons: p.addonIds.map((id) => ({ addon_id: id })) }
        : {}),
      booking_date: p.bookingDate,
      booking_time: trimTime(p.bookingTime),
    })),
    ...(dietary ? { dietary_notes: dietary } : {}),
    ...clientAddressPayloadFields(address),
  };
}

/** Total duration (incl. add-ons + buffers) of a chained visit, in minutes. */
export function chainTotalMinutes(segments: MultiServiceSegment[]): number {
  return segments.reduce((sum, s) => sum + s.durationMinutes + s.bufferMinutes, 0);
}

/** Total list price (service+variant+add-ons) of a chained visit, in pence. */
export function chainTotalPence(segments: MultiServiceSegment[]): number {
  return segments.reduce(
    (sum, s) => sum + (s.pricePence ?? 0) + (s.addonTotalPence ?? 0),
    0,
  );
}

/** Total list price across all group attendees, in pence. */
export function groupTotalPence(people: GroupPerson[]): number {
  return people.reduce((sum, p) => sum + (p.pricePence ?? 0) + (p.addonTotalPence ?? 0), 0);
}
