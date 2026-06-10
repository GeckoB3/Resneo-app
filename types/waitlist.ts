/**
 * Subset of GET /api/venue/waitlist used by the mobile waitlist screen.
 * @see _reference/reserve-ni/src/app/api/venue/waitlist/route.ts
 */
export type WaitlistStatus = 'waiting' | 'offered' | 'confirmed' | 'expired' | 'cancelled';

export type WaitlistKind = 'appointment' | 'table';

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
  can_offer?: boolean;
}

export interface WaitlistResponse {
  entries: WaitlistEntry[];
  waitlist_mode?: string;
}
