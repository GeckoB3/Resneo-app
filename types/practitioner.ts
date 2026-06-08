/**
 * GET /api/venue/practitioners response shapes (subset used by the calendar).
 * @see _reference/reserve-ni/src/app/api/venue/practitioners/route.ts
 */

export interface Practitioner {
  id: string;
  name: string;
  /** Hex colour used to tint this practitioner's appointment blocks. */
  colour?: string | null;
  sort_order: number;
  is_active: boolean;
  /** "practitioner" | "resource" | "class" | "event" (unified calendars only). */
  calendar_type?: string | null;
}

export interface PractitionersResponse {
  practitioners: Practitioner[];
}
