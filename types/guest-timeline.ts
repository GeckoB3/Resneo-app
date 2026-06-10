/**
 * GET /api/venue/guests/[guestId]/timeline — merged activity feed.
 * @see _reference/reserve-ni/src/app/api/venue/guests/[guestId]/timeline/route.ts
 */
export interface GuestTimelineEvent {
  id: string;
  event_type: 'booking' | 'communication' | 'audit' | 'marketing_consent' | 'merge' | string;
  label: string;
  occurred_at: string;
  metadata?: Record<string, unknown>;
}

export interface GuestTimelineResponse {
  events: GuestTimelineEvent[];
}
