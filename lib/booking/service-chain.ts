/**
 * A visit made of several services booked back to back with one person.
 *
 * Port of web's `src/lib/booking/service-chain.ts` (resneo 7acff0ba): the
 * shape that crosses the wire as the `services` query parameter on
 * `GET /api/booking/availability`, and the span arithmetic both sides share.
 * With `services` present the day view returns only the starts at which the
 * WHOLE chain fits with one person; the slots come back labelled with the first
 * service and carrying the span as `duration_minutes`.
 *
 * The chain lives on the PUBLIC availability route only — the staff
 * `/api/venue/appointment-availability` never gained it — which is why
 * `useChainAvailability` calls that route with `venue_id`, as web's staff modal
 * does.
 */

/** Most services one visit can hold; also the `create-multi-service` cap. */
export const MAX_SERVICES_PER_VISIT = 4;

export interface ServiceChainSegmentParam {
  service_id: string;
  variant_id?: string | null;
  addon_ids?: string[];
  /**
   * Staff custom CORE duration for this segment. Public callers may send it
   * too; it only narrows what fits.
   */
  duration_minutes?: number | null;
}

/** Serialise the chain for the query string, dropping empty optionals. */
export function serialiseServiceChainParam(chain: readonly ServiceChainSegmentParam[]): string {
  return JSON.stringify(
    chain.map((s) => ({
      service_id: s.service_id,
      ...(s.variant_id ? { variant_id: s.variant_id } : {}),
      ...(s.addon_ids && s.addon_ids.length > 0 ? { addon_ids: s.addon_ids } : {}),
      ...(s.duration_minutes != null ? { duration_minutes: s.duration_minutes } : {}),
    })),
  );
}

/**
 * Minutes from the first start to the last end, counting the buffer between
 * services but not the buffer after the last one. This is the block the month
 * view asks about, since the month route only knows one length.
 */
export function chainSpanMinutes(
  segments: readonly { durationMinutes: number; bufferMinutes: number }[],
): number {
  let total = 0;
  segments.forEach((seg, i) => {
    total += seg.durationMinutes;
    if (i < segments.length - 1) total += seg.bufferMinutes;
  });
  return total;
}
