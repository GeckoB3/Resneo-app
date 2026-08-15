/**
 * Linked Venues (web: "Linked Accounts") — shared types for the mobile app.
 *
 * Ported from the web reference `src/lib/linked-accounts/{types,calendar}.ts`.
 * The API returns links already framed for "me" (iCan / theyCan), so the app
 * never deals with the raw low/high column model — see Docs/LINKED_VENUES_IMPLEMENTATION_PLAN.md §2.
 */

import type { ScheduleBlockDTO } from './schedule-blocks';

// ---------------------------------------------------------------------------
// Core enums
// ---------------------------------------------------------------------------

export type LinkStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'revoked'
  | 'expired'
  | 'suspended';

export type LinkCalendarVisibility = 'none' | 'time_only' | 'full_details';

export type LinkActionLevel = 'none' | 'edit_existing' | 'create_edit_cancel';

export type LinkTerminationReason =
  | 'unlinked'
  | 'subscription_lapsed'
  | 'venue_deleted'
  | 'plan_ineligible'
  | 'request_expired';

// ---------------------------------------------------------------------------
// Permission grant model (§2.2)
// ---------------------------------------------------------------------------

/** One direction of a link's permissions. */
export interface LinkGrant {
  calendar: LinkCalendarVisibility;
  pii: boolean;
  act: LinkActionLevel;
  /**
   * Calendar-scoped sharing (§18): the granting venue's practitioner/calendar
   * ids this direction is limited to. `null`/`undefined`/empty = ALL of the
   * granting venue's calendars. Only meaningful when calendar is not `none`.
   */
  calendarIds?: string[] | null;
}

/** A pair of grants as sent to the API. `mine` = what I expose to them; `theirs` = what they expose to me. */
export interface LinkGrantPair {
  mine: LinkGrant;
  theirs: LinkGrant;
}

// ---------------------------------------------------------------------------
// Link views (perspective-resolved for "me")
// ---------------------------------------------------------------------------

export interface AccountLinkView {
  id: string;
  status: LinkStatus;
  /** The other venue on this link. */
  otherVenue: { id: string; name: string; slug: string };
  /** Whether this venue initiated the request. */
  initiatedByMe: boolean;
  /** What I am allowed to do to the other venue's data. */
  iCan: LinkGrant;
  /** What the other venue is allowed to do to my data. */
  theyCan: LinkGrant;
  requestMessage: string | null;
  /** A pending negotiated permission change, if one is awaiting acceptance. */
  pendingChange: {
    proposedByMe: boolean;
    iCan: LinkGrant;
    theyCan: LinkGrant;
    proposedAt: string;
  } | null;
  createdAt: string;
  respondedAt: string | null;
  terminatedAt: string | null;
  terminationReason: LinkTerminationReason | null;
}

/** Whether this venue may hold / create links right now (§eligibility). */
export interface LinkEligibility {
  feature: boolean;
  canCreate: boolean;
  reason: string | null;
}

// ---------------------------------------------------------------------------
// Constants (§2.1) — keep in sync with the web reference
// ---------------------------------------------------------------------------

export const LIVE_LINK_STATUSES: LinkStatus[] = ['pending', 'accepted', 'suspended'];
export const PAST_LINK_STATUSES: LinkStatus[] = ['rejected', 'revoked', 'expired'];

/** Default preset for a new link request, mutually applied (§5.4). */
export const DEFAULT_LINK_GRANT: LinkGrant = {
  calendar: 'full_details',
  pii: true,
  act: 'edit_existing',
};

export const MAX_PENDING_OUTGOING_REQUESTS = 10;
export const REJECTED_REQUEST_COOLDOWN_DAYS = 7;
export const PENDING_REQUEST_EXPIRY_DAYS = 30;
export const SUSPENDED_LINK_EXPIRY_DAYS = 30;
/** Soft UI warning when live link count reaches this threshold (§3). */
export const LINK_COUNT_SOFT_WARNING = 10;

// ---------------------------------------------------------------------------
// API request payloads
// ---------------------------------------------------------------------------

export interface CreateLinkPayload {
  targetSlug: string;
  requestMessage?: string;
  grants: LinkGrantPair;
}

export type RespondLinkAction =
  | 'accept'
  | 'accept_with_changes'
  | 'reject'
  | 'cancel'
  | 'propose_change'
  | 'accept_change'
  | 'reject_change'
  | 'cancel_change';

export interface RespondLinkPayload {
  action: RespondLinkAction;
  grants?: LinkGrantPair;
}

// ---------------------------------------------------------------------------
// API response shapes (§2.4)
// ---------------------------------------------------------------------------

export interface AccountLinksListResponse {
  eligibility: LinkEligibility;
  venue: { id: string; name: string; slug: string };
  links: AccountLinkView[];
  outgoingPendingCount: number;
  maxOutgoingPending: number;
}

export interface IncomingLinksResponse {
  incomingRequests: { id: string; otherVenueName: string; createdAt: string }[];
  pendingChanges: { id: string; otherVenueName: string }[];
}

export interface VenueSearchResult {
  name: string;
  slug: string;
  eligible: boolean;
  reason: string | null;
}
export interface VenueSearchResponse {
  results: VenueSearchResult[];
  truncated: boolean;
}

export type VenueLookupResponse =
  | { found: false }
  | { found: true; eligible: boolean; name: string; slug: string; reason: string | null };

export interface InviteCreateResponse {
  url: string;
  qrDataUrl: string | null;
  expiresAt: string;
  venueName: string;
}

export type InviteVerifyResponse =
  | { valid: false; reason: 'invalid' | 'expired' | 'misconfigured' }
  | {
      valid: true;
      self: boolean;
      venueName: string;
      venueSlug: string;
      eligible: boolean;
      reason: string | null;
    };

export interface MyCalendarsResponse {
  calendars: { id: string; name: string }[];
}

export interface LinkResponse {
  link: AccountLinkView | null;
}

// ---------------------------------------------------------------------------
// Audit log (§2.4)
// ---------------------------------------------------------------------------

export type AuditActionType =
  | 'viewed_calendar'
  | 'viewed_booking'
  | 'created_booking'
  | 'edited_booking'
  | 'cancelled_booking'
  | 'deleted_booking';

export interface AccountLinkAuditEntry {
  id: string;
  createdAt: string;
  actionType: string;
  actionLabel: string;
  actingVenue: string;
  owningVenue: string;
  actingUser: string | null;
  resourceType: string | null;
  resourceId: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
}

export interface AuditResponse {
  entries: AccountLinkAuditEntry[];
  users: { id: string; name: string }[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AuditFilters {
  page?: number;
  pageSize?: number;
  action?: AuditActionType | '';
  from?: string | null;
  to?: string | null;
  actingUserId?: string | null;
}

// ---------------------------------------------------------------------------
// Linked calendar (§2.5)
// ---------------------------------------------------------------------------

export type LinkedBookingStatus =
  | 'Pending'
  | 'Booked'
  | 'Confirmed'
  | 'Seated'
  | 'Completed'
  | 'No-Show'
  | 'Cancelled';

export interface LinkedPractitioner {
  id: string;
  name: string;
  isActive: boolean;
  workingHours?: unknown;
}

export interface LinkedService {
  id: string;
  name: string;
  durationMinutes?: number;
  bufferMinutes?: number;
  processingTimeBlocks?: unknown;
  colour?: string;
  pricePence?: number | null;
}

export interface LinkedResource {
  id: string;
  name: string;
  displayOnCalendarId: string;
  minBookingMinutes: number;
  maxBookingMinutes: number;
  slotIntervalMinutes: number;
  isActive: boolean;
  availabilityHours: unknown;
  availabilityExceptions?: unknown;
}

export interface LinkedBooking {
  id: string;
  practitionerId: string | null;
  bookingDate: string;
  bookingTime: string;
  bookingEndTime: string | null;
  status: string;
  guestName: string | null;
  serviceName: string | null;
  /** action != 'none' && visibility != 'time_only'. */
  editable: boolean;

  // full_details only
  partySize?: number;
  bookingModel?: string | null;
  source?: string | null;
  depositStatus?: string;
  depositAmountPence?: number | null;
  specialRequests?: string | null;
  internalNotes?: string | null;
  clientArrivedAt?: string | null;
  guestAttendanceConfirmedAt?: string | null;
  staffAttendanceConfirmedAt?: string | null;
  estimatedEndTime?: string | null;
  guestId?: string | null;
  guestEmail?: string | null; // only when pii granted
  guestPhone?: string | null; // only when pii granted
  appointmentServiceId?: string | null;
  serviceItemId?: string | null;
  serviceVariantId?: string | null;
  resourceId?: string | null;
  calendarId?: string | null;
  practitionerIdRaw?: string | null;
  experienceEventId?: string | null;
  classInstanceId?: string | null;
  eventSessionId?: string | null;
}

export interface LinkedVenueCalendar {
  venueId: string;
  venueName: string;
  venueTimezone?: string;
  linkId: string;
  visibility: LinkCalendarVisibility;
  action: LinkActionLevel;
  pii: boolean;
  practitioners: LinkedPractitioner[];
  services: LinkedService[];
  resources: LinkedResource[];
  bookings: LinkedBooking[];
  /** Classes / ticketed events / resource bookings shells (full_details only). */
  scheduleBlocks?: ScheduleBlockDTO[];
}

export interface LinkedCalendarResponse {
  date?: string;
  from: string;
  to: string;
  venues: LinkedVenueCalendar[];
}

export interface LinkedBookingCreatePayload {
  ownerVenueId: string;
  guestId: string;
  /**
   * Both REQUIRED (web's H38 fix, `linkedBookingCreateSchema`).
   *
   * They were optional here because they were optional on the server — and that
   * was the vulnerability, not a convenience. Every guard in the create route
   * was conditional on them (calendar-belongs-to-owner, service-belongs-to-owner,
   * overlap/working-hours), while `linked_apply_booking_insert` wrote the row
   * regardless. Omitting either put an unvalidated booking on a partner's diary,
   * and a row with no calendar escapes calendar scoping altogether because
   * `link_calendar_allows` returns true for a NULL calendar.
   *
   * Sending `null` is now a 400. Whoever builds the app's linked-booking create
   * UI must gate Save on both being chosen — do not restore `|| null`.
   */
  practitionerId: string;
  appointmentServiceId: string;
  bookingDate: string; // YYYY-MM-DD
  bookingTime: string; // HH:MM(:SS)
  bookingEndTime?: string;
  partySize?: number;
  specialRequests?: string;
}

export interface LinkedBookingChangePayload {
  bookingId: string;
  changes: {
    booking_date?: string;
    booking_time?: string;
    booking_end_time?: string;
    practitioner_id?: string | null;
    appointment_service_id?: string | null;
    status?: LinkedBookingStatus;
    special_requests?: string | null;
    dietary_notes?: string | null;
  };
}

export interface LinkedGuestsResponse {
  guests: { id: string; name: string; email: string | null }[];
}

// ---------------------------------------------------------------------------
// Owner-venue context roster (mobile-only — drives the venue switcher)
// ---------------------------------------------------------------------------

/** A linked venue the current staff can act on (derived from accepted links). */
export interface LinkedVenueSummary {
  venueId: string;
  venueName: string;
  linkId: string;
  /** What I can do to this venue's data. */
  grant: LinkGrant;
}

// ---------------------------------------------------------------------------
// Per-venue email notification prefs for cross-venue activity (web §17.4)
// ---------------------------------------------------------------------------

/** Which cross-venue write events email this venue. In-app rows are unaffected. */
export type LinkedNotificationCategory = 'cancel' | 'reschedule' | 'create' | 'notes';

export type LinkedNotificationPrefs = Record<LinkedNotificationCategory, boolean>;

/** All categories default OFF — opt-in, matching the web. */
export const DEFAULT_LINKED_NOTIFICATION_PREFS: LinkedNotificationPrefs = {
  cancel: false,
  reschedule: false,
  create: false,
  notes: false,
};

/** Stable display order + copy for the toggle rows. */
export const LINKED_NOTIFICATION_ROWS: { key: LinkedNotificationCategory; label: string }[] = [
  { key: 'create', label: 'Creates a new booking' },
  { key: 'reschedule', label: 'Reschedules a booking' },
  { key: 'cancel', label: 'Cancels a booking' },
  { key: 'notes', label: 'Edits booking notes or service' },
];

/** Merge a stored (possibly partial / malformed) prefs blob over the defaults. */
export function resolveLinkedNotificationPrefs(raw: unknown): LinkedNotificationPrefs {
  const out: LinkedNotificationPrefs = { ...DEFAULT_LINKED_NOTIFICATION_PREFS };
  if (raw && typeof raw === 'object') {
    const bag = raw as Record<string, unknown>;
    for (const key of Object.keys(out) as LinkedNotificationCategory[]) {
      if (typeof bag[key] === 'boolean') out[key] = bag[key] as boolean;
    }
  }
  return out;
}
