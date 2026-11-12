/**
 * Follow-on groups as the venue routes send them (web `src/lib/follow-ons/group-input.ts`,
 * Docs/follow-on-services-plan.md 7.2). After a client picks one of a group's trigger services,
 * they are asked whether they would like one of its offered services, booked as its own service in
 * the visit.
 * @see _reference/Resneo/src/lib/follow-ons/group-input.ts
 */

/** A group as GET /api/venue/follow-on-groups returns it. */
export interface FollowOnGroup {
  id: string;
  venue_id: string;
  /** The venue's own label, never shown to clients. */
  name: string;
  /** The question clients see; null shows the default question. */
  prompt_to_client: string | null;
  /** single: a client picks at most one; multi: any number, up to the visit limit. */
  selection_type: 'single' | 'multi';
  /** Online clients must pick one before they can continue. Staff can always skip. */
  required: boolean;
  is_active: boolean;
  sort_order: number;
  /** The services the group offers, in the order clients see them. */
  offered_service_ids: string[];
  /** The services after which the question is asked. */
  trigger_service_ids: string[];
  /** Set on a member's copy of its collective host's group: the host's to change. Absent on older servers. */
  managed_by_collective_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Who sets a member's copies of its live collective host's groups, by collective id. */
export type FollowOnManagedBy = Record<string, { collective_name: string; host_name: string }>;

export interface FollowOnGroupsResponse {
  groups: FollowOnGroup[];
  /** Absent on servers before phase 4 of the follow-on plan. */
  managed_by?: FollowOnManagedBy;
}

/** What POST and PATCH /api/venue/follow-on-groups take as `group`. */
export interface FollowOnGroupInput {
  name: string;
  prompt_to_client: string | null;
  selection_type: 'single' | 'multi';
  required: boolean;
  is_active: boolean;
  offered_service_ids: string[];
  trigger_service_ids: string[];
}

export interface FollowOnGroupUpsertResponse {
  group: FollowOnGroup;
}

/** The follow-on groups GET /api/venue/appointment-services lists on each service (asked after it). */
export interface ServiceFollowOnSummary {
  id: string;
  name: string;
  required: boolean;
}
