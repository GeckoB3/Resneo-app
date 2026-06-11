/**
 * GET /api/venue/practitioners response shapes (subset used by the calendar).
 * @see _reference/reserve-ni/src/app/api/venue/practitioners/route.ts
 */

export interface PractitionerTimeRange {
  start: string;
  end: string;
}

export interface Practitioner {
  id: string;
  name: string;
  /** Hex colour used to tint this practitioner's appointment blocks. */
  colour?: string | null;
  sort_order: number;
  is_active: boolean;
  /** "practitioner" | "resource" | "class" | "event" (unified calendars only). */
  calendar_type?: string | null;
  /** Recurring breaks: every working day (when by_day is null/empty). */
  break_times?: PractitionerTimeRange[];
  /** Per-weekday breaks — keys "0"–"6" (Sun–Sat) or "sun"–"sat". */
  break_times_by_day?: Record<string, PractitionerTimeRange[]> | null;
  /** Per-weekday working hours — keys "0"–"6" (Sun–Sat) or "sun"–"sat" (roster=1). */
  working_hours?: Record<string, PractitionerTimeRange[]> | null;
}

export interface PractitionersResponse {
  practitioners: Practitioner[];
}
