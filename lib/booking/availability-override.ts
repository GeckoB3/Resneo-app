/**
 * The staff "Override availability" tick box (web #187,
 * `Docs/staff-availability-override-plan.md`): book any service with anyone,
 * on any date from today and at any time, over anything, with the engine's
 * reasons shown as warnings rather than refusals.
 *
 * Additive on the server: `override_availability: true` on
 * `POST /api/venue/bookings` and `POST /api/booking/create-multi-service`
 * (staff sources only), the same flag on `POST /api/booking/validate-appointment-slot`
 * as a dry run answering `{ ok, warnings }`, and
 * `GET /api/booking/appointment-catalog?override=1` listing every active
 * calendar with every active service, each with `assigned`. Only a past date,
 * an unknown service or calendar, or a length outside the limits still refuse.
 * This module is the pure half: copy, and the dry-run bodies for a chain.
 */

import type { MultiServiceSegment } from '@/lib/booking/multi-service-chain';

/** The tick box's label and help (web `AVAILABILITY_OVERRIDE_HELP`, verbatim). */
export const AVAILABILITY_OVERRIDE_LABEL = 'Override availability';
export const AVAILABILITY_OVERRIDE_HELP =
  'Book any service with anyone, on any date from today and at any time, even over other bookings. Use this to squeeze someone in. You will see what it overrides before you save.';
/** Under the date and time controls while the override is on. */
export const AVAILABILITY_OVERRIDE_DATE_TIME_NOTE =
  'Availability is overridden: choose any date from today and any time.';
/** The route's refusal for a past date, repeated client-side before asking. */
export const AVAILABILITY_OVERRIDE_PAST_DATE_ERROR = 'Choose today or a later date.';
/** The review box's heading and its empty state. */
export const AVAILABILITY_OVERRIDE_BOX_TITLE = 'What this overrides';
export const AVAILABILITY_OVERRIDE_NOTHING =
  'Nothing: this time would have been offered anyway.';

/** "Not usually offered by Ann" on a service card; the person's name when known. */
export function notUsuallyOfferedBy(name: string | null | undefined): string {
  return `Not usually offered by ${name?.trim() || 'this person'}`;
}
/** On a person's card under the practitioner step. */
export const DOES_NOT_USUALLY_OFFER = 'Does not usually offer this service';

/** One earlier segment of the chain, as the dry run is told about it. */
export interface OverridePhantom {
  practitioner_id: string;
  /** HH:mm[:ss] */
  start_time: string;
  duration_minutes: number;
  buffer_minutes: number;
  processing_time_blocks: { start_minute: number; duration_minutes: number }[];
}

/** The body for one segment's dry run on `validate-appointment-slot`. */
export interface OverrideDryRunBody {
  venue_id: string;
  booking_date: string;
  practitioner_id: string;
  service_id: string;
  variant_id?: string;
  addons?: { addon_id: string }[];
  start_time: string;
  phantoms: OverridePhantom[];
  staff: true;
  override_availability: true;
  duration_minutes?: number;
}

/**
 * The dry-run bodies for a chain, one per segment in visit order, each told
 * about the segments before it as phantoms (web `validateMultiServiceChain`):
 * so an earlier segment's gaps, and any wait after it, count as free while the
 * next is checked, the way the create route treats them.
 */
export function overrideDryRunBodies(args: {
  venueId: string;
  bookingDate: string;
  chain: readonly MultiServiceSegment[];
  /** The staff core override per segment (null = catalogue length). */
  customDurationOf: (segment: MultiServiceSegment) => number | null;
}): OverrideDryRunBody[] {
  const phantoms: OverridePhantom[] = [];
  const bodies: OverrideDryRunBody[] = [];
  for (const seg of args.chain) {
    const custom = args.customDurationOf(seg);
    bodies.push({
      venue_id: args.venueId,
      booking_date: args.bookingDate,
      practitioner_id: seg.practitionerId,
      service_id: seg.serviceId,
      ...(seg.serviceVariantId ? { variant_id: seg.serviceVariantId } : {}),
      ...(seg.addonIds && seg.addonIds.length > 0
        ? { addons: seg.addonIds.map((id) => ({ addon_id: id })) }
        : {}),
      start_time: seg.startTime,
      phantoms: [...phantoms],
      staff: true,
      override_availability: true,
      ...(custom != null ? { duration_minutes: custom } : {}),
    });
    phantoms.push({
      practitioner_id: seg.practitionerId,
      start_time: seg.startTime,
      duration_minutes: seg.durationMinutes,
      buffer_minutes: seg.bufferMinutes,
      processing_time_blocks: (seg.processingTimeBlocks ?? []).map((b) => ({
        start_minute: b.start_minute,
        duration_minutes: b.duration_minutes,
      })),
    });
  }
  return bodies;
}

/** The warnings of a visit, each prefixed with its service so staff know which one. */
export function prefixOverrideWarnings(
  segment: Pick<MultiServiceSegment, 'serviceName'>,
  warnings: readonly string[] | undefined,
): string[] {
  return (warnings ?? []).map((w) => `${segment.serviceName}: ${w}`);
}
