/**
 * Subset of GET /api/venue/waitlist used by the mobile waitlist screen.
 * @see _reference/Resneo/src/app/api/venue/waitlist/route.ts
 */
export type WaitlistStatus = 'waiting' | 'offered' | 'confirmed' | 'expired' | 'cancelled';

export type WaitlistKind = 'appointment' | 'table';

export type WaitlistMode = 'notify_in_order' | 'staff_choose';

export interface WaitlistEntry {
  id: string;
  waitlist_kind?: string;
  status?: WaitlistStatus | string;
  guest_name?: string | null;
  guest_first_name?: string | null;
  guest_last_name?: string | null;
  guest_phone?: string | null;
  guest_email?: string | null;
  desired_date?: string;
  desired_time?: string | null;
  desired_time_end?: string | null;
  party_size?: number;
  service_name?: string | null;
  practitioner_name?: string | null;
  time_window_label?: string | null;
  notes?: string | null;
  created_at?: string;
  expires_at?: string | null;
  offered_at?: string | null;
  can_offer?: boolean;
  offer_unavailable_reason?: string | null;
  booking_id?: string | null;
}

export interface WaitlistResponse {
  entries: WaitlistEntry[];
  waitlist_mode?: WaitlistMode | string;
}

/**
 * Shape of GET /api/venue/waitlist/alerts response.
 *
 * The live backend (`enrichWaitlistSlotOpportunities` in
 * `C:\Resneo/src/lib/booking/waitlist-slot-opportunity-service.ts`) returns
 * `slot_time_hm` (HH:mm) + `calendar_name`. The older `slot_time` /
 * `practitioner_name` aliases are kept optional so legacy consumers still
 * type-check; UI should read `slot_time_hm ?? slot_time` and
 * `calendar_name ?? practitioner_name`.
 */
export interface WaitlistAlert {
  id: string;
  venue_id?: string;
  slot_date?: string;
  /** Real backend field — HH:mm clock time of the freed slot. */
  slot_time_hm?: string;
  /** Legacy alias (HH:mm[:ss]); prefer `slot_time_hm`. */
  slot_time?: string;
  service_id?: string | null;
  service_name?: string | null;
  /** Real backend field — the calendar/practitioner the slot belongs to. */
  calendar_name?: string | null;
  practitioner_id?: string | null;
  /** Legacy alias; prefer `calendar_name`. */
  practitioner_name?: string | null;
  matching_waitlist_count: number;
  status?: string;
  created_at?: string;
}

export interface WaitlistAlertsResponse {
  alerts: WaitlistAlert[];
}
