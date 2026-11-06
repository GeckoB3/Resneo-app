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
  /**
   * That business has taken payment for its part (web 2026-11-05), so the front desk does not send
   * the client there to pay. Still no price. Absent from older servers.
   */
  paid?: boolean;
  /**
   * Only from {@link useVisitDetail} (web 2026-11-05): the signed-in business's own service, listed
   * beside the others when a partner's booking is opened.
   */
  own?: boolean;
  /** Only from {@link useVisitDetail}: the service's price, as its own business's payments count it. */
  price_pence?: number | null;
}

/**
 * One business's part of a visit across businesses, in money (web `VisitPartMoney`, 2026-11-05):
 * what its services come to, what it has taken and what it still has to take, on its own account.
 */
export interface VisitPartMoney {
  venue_id: string;
  venue_name: string;
  /** The signed-in business's own part. */
  own: boolean;
  /** Null when any price is unknown. */
  total_pence: number | null;
  paid_pence: number;
  /** Null when the total is unknown. */
  outstanding_pence: number | null;
}

/**
 * Every service of one visit the staff member may see, their own business's included, and each
 * business's money (web `VisitDetail`). `legacy` when the server predates it and sent only the other
 * businesses' unpriced lines: the card then lists them as before.
 */
export interface VisitDetail {
  lines: VisitPartnerLine[];
  parts: VisitPartMoney[];
  legacy?: boolean;
}

const EMPTY: ReadonlyMap<string, VisitPartnerLine[]> = new Map();

/** "10:45 Gel Manicure with Bea, SV Nails, Booked, paid": the visit card's read-only line (7.3). */
export function partnerLineText(line: VisitPartnerLine): string {
  const who = line.person_name ? ` with ${line.person_name}` : '';
  return `${line.start_time} ${line.service_name}${who}, ${line.venue_name}, ${line.status}${line.paid ? ', paid' : ''}`;
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

/**
 * The booking card's whole visit across businesses (web `GET /api/venue/visits/partner-lines?detail=1`,
 * 2026-11-05): every service with its price and each business's money, so the card can say what the
 * signed-in business takes and what the other business takes on its own till. Null for an ordinary
 * booking, while loading, on error, and for a person who may see nothing at another business.
 * `refreshKey` reads it again when the opened booking's status or payment changes; it is also read
 * again when the app comes back to the foreground and after any booking change (the
 * `visit-partner-lines` prefix).
 */
export function useVisitDetail(linkedVisitId: string | null | undefined, refreshKey = ''): VisitDetail | null {
  const accessToken = useAccessToken();
  const id = linkedVisitId || null;
  const query = useQuery({
    queryKey: ['visit-partner-lines', 'detail', keyScope(accessToken), id, refreshKey] as const,
    enabled: isBackendConfigured() && accessToken !== null && id !== null,
    staleTime: 0,
    // A payment or status change reads it again: keep the last answer for the same visit meanwhile.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[3] === id ? previous : undefined),
    queryFn: async (): Promise<VisitDetail | null> => {
      const body = await apiFetch<{ visit?: VisitDetail | null; visits?: Record<string, VisitPartnerLine[]> }>(
        `/api/venue/visits/partner-lines?detail=1&ids=${encodeURIComponent(id ?? '')}`,
        { accessToken },
      );
      if (body.visit !== undefined) return body.visit;
      // An older server ignores `detail` and answers with the other businesses' lines only.
      const lines = body.visits?.[id ?? ''] ?? [];
      return lines.length > 0 ? { lines, parts: [], legacy: true } : null;
    },
  });
  return id ? (query.data ?? null) : null;
}
