import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * Another business's service of a visit across businesses, as this staff member may see it
 * (web split-visit plan 7.2, 7.3; `GET /api/venue/visits/partner-lines`). Read-only: the service, the
 * person, the business and the status, never the client's contact details.
 *
 * @see _reference/Resneo/src/lib/booking/visit-partner-lines.ts
 */
export interface VisitPartnerLine {
  booking_id: string;
  linked_visit_id: string;
  venue_id: string;
  venue_name: string;
  booking_date: string;
  /** HH:MM */
  start_time: string;
  /** HH:MM, or null when the row has no end. */
  end_time: string | null;
  service_name: string;
  person_name: string | null;
  status: string;
}

const EMPTY: ReadonlyMap<string, VisitPartnerLine[]> = new Map();

/** "10:45 Gel Manicure with Bea, SV Nails, Booked": the visit card's read-only line (7.3). */
export function partnerLineText(line: VisitPartnerLine): string {
  const who = line.person_name ? ` with ${line.person_name}` : '';
  return `${line.start_time} ${line.service_name}${who}, ${line.venue_name}, ${line.status}`;
}

/**
 * The partner lines of `linkedVisitIds`, by link. An empty map while loading, on error, against a
 * server that predates the route, and for a person who may see none: the chip then counts only what
 * the grid holds, as before. Refetched whenever the app comes back to the foreground.
 */
export function useVisitPartnerLines(linkedVisitIds: readonly (string | null | undefined)[]): ReadonlyMap<string, VisitPartnerLine[]> {
  const accessToken = useAccessToken();
  const ids = [...new Set(linkedVisitIds.filter((v): v is string => Boolean(v)))].sort();
  const key = ids.join(',');
  const query = useQuery({
    queryKey: ['visit-partner-lines', keyScope(accessToken), key] as const,
    enabled: isBackendConfigured() && accessToken !== null && ids.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const body = await apiFetch<{ visits?: Record<string, VisitPartnerLine[]> }>(
        `/api/venue/visits/partner-lines?ids=${encodeURIComponent(key)}`,
        { accessToken },
      );
      return new Map(Object.entries(body.visits ?? {})) as ReadonlyMap<string, VisitPartnerLine[]>;
    },
  });
  return ids.length === 0 ? EMPTY : (query.data ?? EMPTY);
}
