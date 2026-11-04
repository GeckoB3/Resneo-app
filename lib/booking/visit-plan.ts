/**
 * A visit with a person per service (web Docs/split-staff-visit-plan.md 6.1, 7.1, 8.3, 8.9): the
 * review's segments built from the server's plan for the chosen start, the hand-laid times for
 * Start Now and Override, and the money grouped by business for a visit across businesses.
 *
 * Kept apart from `multi-service-chain.ts`, whose one-person chain arithmetic is unchanged: a visit
 * with one person is laid back to back exactly as before.
 */
import { minutesToTime, timeToMinutes } from '@/lib/booking/booking-format';
import type { MultiServiceSegment } from '@/lib/booking/multi-service-chain';
import { processingTailMinutes } from '@/lib/booking/processing-time-fit';
import { layVisitStarts } from '@/lib/booking/visit-people';
import type { PlannedVisitSegment } from '@/types/appointment-availability';
import type { AppointmentCatalogVariant, AppointmentServiceOption } from '@/types/appointment-catalog';

/** True when the visit's services are with more than one person. */
export function chainSpansPeople(segments: readonly Pick<MultiServiceSegment, 'practitionerId'>[]): boolean {
  const first = segments[0]?.practitionerId;
  return segments.some((s) => s.practitionerId !== first);
}

/** What the flow asked for one service of the visit: its option (from its person), choices and length. */
export interface VisitPlanAsk {
  option: AppointmentServiceOption;
  variant: AppointmentCatalogVariant | null;
  addonIds: readonly string[];
  /** Staff custom core length, or null for the catalogue length. */
  durationOverride: number | null;
}

/**
 * The review's segments, exactly as the server planned the chosen start: times, people, lengths,
 * prices and charges are the server's, so the review and the create route agree on every one
 * (web `segmentsFromVisitPlan`). Names and add-ons come from what the flow asked. Null when the plan
 * does not line up with the services asked for (a stale slot), so the caller can show the times again.
 */
export function segmentsFromVisitPlan(
  planned: readonly PlannedVisitSegment[],
  asks: readonly VisitPlanAsk[],
): MultiServiceSegment[] | null {
  if (planned.length !== asks.length || planned.length === 0) return null;
  const out: MultiServiceSegment[] = [];
  for (let i = 0; i < planned.length; i += 1) {
    const seg = planned[i]!;
    const ask = asks[i]!;
    if (seg.service_id !== ask.option.serviceId) return null;
    const chosen = (ask.option.addonGroups ?? [])
      .flatMap((g) => g.addons)
      .filter((a) => ask.addonIds.includes(a.id));
    const addonMinutes = chosen.reduce((sum, a) => sum + a.additional_duration_minutes, 0);
    const addonPence = chosen.reduce((sum, a) => sum + a.additional_price_pence, 0);
    const blocks = seg.processing_time_blocks ?? [];
    const naturalBase = ask.variant?.duration_minutes ?? ask.option.durationMinutes;
    out.push({
      serviceId: seg.service_id,
      serviceName: ask.option.serviceName,
      serviceVariantId: ask.variant?.id ?? null,
      practitionerId: seg.practitioner_id,
      practitionerName: seg.practitioner_name,
      startTime: seg.start_time.slice(0, 5),
      durationMinutes: seg.duration_minutes,
      // With no staff length the server's own length is the natural one, so no custom length is
      // sent back (this person's catalogue length may differ from the option's).
      naturalDurationMinutes: ask.durationOverride == null ? seg.duration_minutes : naturalBase + addonMinutes,
      bufferMinutes: seg.buffer_minutes,
      processingTimeBlocks: blocks,
      processingTailMinutes: processingTailMinutes(blocks, seg.duration_minutes),
      // The server's price includes the add-ons; the review shows them on their own.
      pricePence: seg.price_pence == null ? null : seg.price_pence - addonPence,
      addonIds: ask.addonIds.length > 0 ? [...ask.addonIds] : undefined,
      addonTotalPence: addonPence,
      addonTotalMinutes: addonMinutes,
      addonNames: chosen.map((a) => a.name),
      chargePence: seg.payment === 'card_hold' ? seg.card_hold_fee_pence ?? 0 : seg.deposit_pence ?? null,
      chargeLabel: seg.payment,
      venueId: seg.venue_id,
    });
  }
  return out;
}

/**
 * The visit's services laid from `firstStart` by hand (Start Now, Override; web 7.1): with one
 * person, back to back as always; with several, each service starts once the client is free, and
 * after its person's buffer when that person already had a service in the visit.
 */
export function layVisitSegments(segments: readonly MultiServiceSegment[], firstStart: string): MultiServiceSegment[] {
  const starts = layVisitStarts(
    segments.map((seg) => ({
      personId: seg.practitionerId,
      durationMinutes: seg.durationMinutes,
      bufferMinutes: seg.bufferMinutes,
      processingTailMinutes: seg.processingTailMinutes ?? 0,
    })),
    timeToMinutes(firstStart),
  );
  return segments.map((seg, i) => ({ ...seg, startTime: minutesToTime(starts[i]!) }));
}

/** One business of a visit across businesses, with what it asks for online (web 7.1). */
export interface VisitBusinessPart {
  venueId: string;
  name: string;
  /** Indexes of the visit's services with this business, in visit order. */
  segmentIndexes: number[];
  /** Money due when booking (deposits or full payments), card holds apart. */
  depositPence: number;
  chargeLabel: 'deposit' | 'full_payment';
  /** The no-show fee a card hold would secure. */
  holdPence: number;
}

/**
 * The visit's businesses in the order of their first service, when there are two or more; an empty
 * list for a visit with one business (or segments that do not say which), where today's single
 * deposit and card-hold choice stands.
 */
export function visitBusinessParts(
  segments: readonly MultiServiceSegment[],
  nameOf: (venueId: string) => string,
): VisitBusinessPart[] {
  if (segments.some((s) => !s.venueId)) return [];
  const order: string[] = [];
  for (const seg of segments) if (!order.includes(seg.venueId!)) order.push(seg.venueId!);
  if (order.length < 2) return [];
  return order.map((venueId) => {
    const indexes = segments.flatMap((s, i) => (s.venueId === venueId ? [i] : []));
    const mine = indexes.map((i) => segments[i]!);
    const charged = mine.filter((s) => s.chargeLabel !== 'card_hold' && (s.chargePence ?? 0) > 0);
    return {
      venueId,
      name: nameOf(venueId),
      segmentIndexes: indexes,
      depositPence: charged.reduce((sum, s) => sum + (s.chargePence ?? 0), 0),
      chargeLabel: charged.length > 0 && charged.every((s) => s.chargeLabel === 'full_payment') ? 'full_payment' : 'deposit',
      holdPence: mine.reduce((sum, s) => sum + (s.chargeLabel === 'card_hold' ? s.chargePence ?? 0 : 0), 0),
    };
  });
}
