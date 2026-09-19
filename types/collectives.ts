/**
 * Venue Collectives (combined / shared booking pages) — shared types for the app.
 * Ported from the web reference `src/lib/linked-accounts/{collectives,catalogue}.ts`.
 * See Docs/LINKED_VENUES_IMPLEMENTATION_PLAN.md §2.6 / Appendix B.
 */

import type {
  BookingPageCoverCropBox,
  BookingPageImageFraming,
} from '@/lib/booking/bookingPageConfig';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type CollectiveStatus = 'active' | 'dissolved';
export type CollectiveMemberStatus = 'invited' | 'active' | 'left' | 'removed';
export type ServiceGrouping = 'by_practitioner' | 'by_service_type';
export type PageMode = 'directory' | 'unified_catalog';
export type SlugStrategy = 'dedicated' | 'adopt_member';
export type SoloPageBehavior = 'keep_live' | 'redirect';
export type ItemStatus = 'active' | 'archived';
/** Member consent on the commercial terms for its calendars (plan D6). */
export type ProviderApprovalStatus = 'pending' | 'approved' | 'rejected';
/** Link/eligibility-driven bookability of a provider (plan §8). */
export type ProviderStatus = 'active' | 'suspended' | 'removed';
export type PricingDisplay = 'from' | 'fixed' | 'per_provider';

// ---------------------------------------------------------------------------
// Combined-page config (single-venue-grade; merged non-destructively on save)
// ---------------------------------------------------------------------------

export interface BookingTeamProfile {
  bio?: string | null;
  photo?: string | null;
  specialties?: string | null;
  hidden?: boolean;
}

export interface CombinedBookingPageConfig {
  brand_primary?: string | null;
  font_preset?: string | null;
  // Crop framing shares the canonical booking-page types so the single-venue
  // editor's croppers + preview wire in directly (the host editor reuses them).
  logo_crop?: BookingPageImageFraming | null;
  cover_crop_box?: BookingPageCoverCropBox | null;
  cover_photo_url?: string | null;
  cover_full_width?: boolean;
  about?: string | null;
  announcement?: string | null;
  social_links?: { instagram?: string; facebook?: string; tiktok?: string; x?: string } | null;
  gallery?: string[] | null;
  show_services_tab?: boolean;
  show_team_tab?: boolean;
  show_about_tab?: boolean;
  team_profiles?: Record<string, BookingTeamProfile> | null;
}

export interface CollectiveBranding {
  logo_url?: string | null;
  primary_colour?: string | null;
  description?: string | null;
}

// ---------------------------------------------------------------------------
// Collective view (returned by GET/POST/PATCH /collectives)
// ---------------------------------------------------------------------------

export interface CollectiveMemberView {
  venueId: string;
  venueName: string;
  /** The venue's own booking-page slug (`/book/{slug}`), the combined page's address when adopted (web 2026-09-05). */
  venueSlug?: string | null;
  status: CollectiveMemberStatus;
  displayOrder: number;
  soloPageBehavior: SoloPageBehavior;
  /** Classes, events or rooms the venue also runs, which stay on its own page (web W20). */
  alsoRuns?: string | null;
}

export interface CollectiveView {
  id: string;
  slug: string;
  name: string;
  status: CollectiveStatus;
  branding: CollectiveBranding;
  serviceGrouping: ServiceGrouping;
  allowAnyPractitioner: boolean;
  pageMode: PageMode;
  slugStrategy: SlugStrategy;
  adoptedVenueId: string | null;
  timezone: string | null;
  bookingPageConfig: CombinedBookingPageConfig | null;
  isHost: boolean;
  hostVenueId: string;
  /**
   * `legacy_copies` (service copies), `migrating` or `replicas` (shared services, web W3+). Optional:
   * older payloads omit it, which reads as the older model.
   */
  serviceModel?: 'legacy_copies' | 'migrating' | 'replicas' | string;
  /**
   * The host venue's public contact details and opening hours, exactly what
   * the combined page shows in its header and About tab (web #190). Read-only:
   * they are set in the host's own Profile and Business hours settings.
   * Optional: older payloads omit it.
   */
  hostContact?: {
    phone: string | null;
    websiteUrl: string | null;
    address: string | null;
    /** The host venue's `opening_hours` JSON, keyed "0" (Sun) to "6" (Sat). */
    openingHours: Record<string, unknown> | null;
  };
  /** The host venue's two flow flags, which the combined page follows (shown in the manager's note). */
  hostAnyAvailablePractitioner?: boolean;
  hostStaffFirstBookingFlow?: boolean;
  myVenueId: string;
  myMembershipStatus: CollectiveMemberStatus | null;
  myConfig: {
    visiblePractitionerIds: string[];
    visibleServiceIds: string[];
    allowAnyPractitionerSubstitution: boolean;
    displayOrder: number;
    soloPageBehavior: SoloPageBehavior;
  } | null;
  members: CollectiveMemberView[];
  activeMemberCount: number;
  /** When the collective lost its host and is waiting for one (web W7). */
  pausedAt?: string | null;
  /** A move of hosting in progress (web W7). */
  pendingHost?: { venueId: string; venueName: string; transferAt: string | null } | null;
}

// ---------------------------------------------------------------------------
// Catalogue (builder) views
// ---------------------------------------------------------------------------

export interface CatalogueProviderView {
  id: string;
  itemId: string;
  venueId: string;
  venueName: string;
  sourceServiceId: string;
  sourceServiceName: string | null;
  practitionerId: string | null;
  practitionerName: string | null;
  effectivePricePence: number | null;
  effectiveDurationMinutes: number | null;
  status: ProviderStatus;
  sourceLive: boolean;
  /**
   * Where this venue's copy stands against the offering's origin (web #187
   * service sync, #190 drift on every copy). `none` for the origin's own
   * service, an unrelated service, or a database without the sync columns.
   * `inStep` compares duration, buffer, processing periods and options; for an
   * `independent` copy it is drift information only. Optional: older payloads
   * omit it, and the builder then shows no sync state.
   */
  sync?: {
    state: 'none' | 'independent' | 'linked' | 'customised';
    originVenueName: string | null;
    inStep: boolean | null;
  };
}

export interface CatalogueItemView {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
  displayOrder: number;
  defaultDurationMinutes: number | null;
  defaultPricePence: number | null;
  pricingDisplay: PricingDisplay;
  allowAnyAvailable: boolean;
  status: ItemStatus;
  providers: CatalogueProviderView[];
  /** The venue the tick copies from: the host's when it provides the offering, else the earliest provider's. */
  originVenueId?: string | null;
  originVenueName?: string | null;
}

export interface CatalogueMemberSource {
  venueId: string;
  venueName: string;
  services: { id: string; name: string; durationMinutes: number | null; pricePence: number | null }[];
  practitioners: { id: string; name: string; services: { id: string; name: string }[] }[];
}

export interface CatalogueManagementView {
  collectiveId: string;
  pageMode: PageMode;
  items: CatalogueItemView[];
  memberSources: CatalogueMemberSource[];
}

// ---------------------------------------------------------------------------
// API payloads
// ---------------------------------------------------------------------------

export interface CreateCollectivePayload {
  name: string;
  slug: string;
  branding?: CollectiveBranding;
  serviceGrouping?: ServiceGrouping;
  allowAnyPractitioner?: boolean;
  inviteVenueIds: string[];
}

export interface UpdateCollectivePayload {
  name?: string;
  branding?: CollectiveBranding;
  serviceGrouping?: ServiceGrouping;
  allowAnyPractitioner?: boolean;
  slugStrategy?: SlugStrategy;
  adoptedVenueId?: string | null;
  bookingPageConfig?: CombinedBookingPageConfig;
  logoUrl?: string | null;
  coverPhotoUrl?: string | null;
}

export type CollectiveMemberAction =
  | 'invite'
  | 'accept'
  | 'decline'
  | 'leave'
  | 'remove'
  | 'configure'
  | 'transfer_host';

export interface CollectiveMemberActionPayload extends Partial<JoinChoices> {
  action: CollectiveMemberAction;
  venueId?: string;
  /** `accept` on shared services: the join preview's version, with the choices below (web contract 6). */
  consent_version?: string;
  visiblePractitionerIds?: string[];
  visibleServiceIds?: string[];
  allowAnyPractitionerSubstitution?: boolean;
  displayOrder?: number;
  soloPageBehavior?: SoloPageBehavior;
}

export type CatalogueAction =
  | 'create_item'
  /** Bulk add: several member services become offerings in ONE request (web #105). */
  | 'create_items'
  | 'update_item'
  | 'archive_item'
  | 'add_provider'
  | 'remove_provider'
  /** Batch calendar assignment: apply every staged add/remove at once (web #106). */
  | 'set_providers'
  /** Bring one linked/customised copy into step with its origin (`forceSync` for a customised one). Web #187. */
  | 'sync_provider'
  /** A linked copy stops following its origin; its settings stay. Web #187. */
  | 'detach_provider'
  /** Link an independent copy to the origin and update it, add-ons included. Web #187. */
  | 'link_provider'
  /** Link and update every copy of every offering (or of `itemId`) at a non-origin venue. Web #190. */
  | 'sync_all_providers'
  /** Unlink every linked copy of every offering (or of `itemId`); settings untouched. Web #190. */
  | 'unlink_all_providers';

/** One selected member service for the `create_items` bulk add. */
export interface CatalogueBulkAddService {
  name: string;
  venueId: string;
  sourceServiceId: string;
}

/**
 * One staged calendar-assignment change for `set_providers`. `add` needs
 * itemId + venueId + practitionerId; `remove` needs providerId.
 */
export interface CatalogueProviderOp {
  op: 'add' | 'remove';
  itemId?: string;
  venueId?: string;
  practitionerId?: string;
  providerId?: string;
  /**
   * `add` only: the calendar's venue already has a same-named service, and the
   * host said yes to updating it to the origin's shape and keeping it in step
   * (web #190, asked at tick time). A copy the tick creates is in step already.
   */
  sync?: boolean;
}

export interface CatalogueActionPayload {
  action: CatalogueAction;
  /** `create_items` — 1 to 50 selected services (same-named ones merge server-side). */
  services?: CatalogueBulkAddService[];
  /** `set_providers` — 1 to 200 staged add/remove ops applied in one request. */
  ops?: CatalogueProviderOp[];
  itemId?: string;
  name?: string;
  description?: string | null;
  category?: string | null;
  displayOrder?: number;
  defaultDurationMinutes?: number | null;
  defaultPricePence?: number | null;
  pricingDisplay?: PricingDisplay;
  allowAnyAvailable?: boolean;
  imageUrl?: string | null;
  sourceServiceIds?: { venueId: string; sourceServiceId: string }[];
  providerId?: string;
  venueId?: string;
  sourceServiceId?: string;
  practitionerId?: string | null;
  /** `sync_provider`: re-sync a customised copy too (it would otherwise be left alone). */
  forceSync?: boolean;
}

export type PageAssetKind = 'logo' | 'cover' | 'gallery' | 'offering' | 'team';

// ---------------------------------------------------------------------------
// API response wrappers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Joining a shared-services collective (web `replicas/join.ts`, plan contract 6)
// ---------------------------------------------------------------------------

export interface JoinOption {
  id: string;
  name: string;
}

export interface JoinSameName {
  item_id: string;
  host_service_id: string;
  name: string;
  my_service_id: string;
  my_options: JoinOption[];
  host_options: JoinOption[];
}

/** GET /api/venue/collectives/[id]/join: what an invited venue decides before it joins. */
export interface JoinPreview {
  consent_version: string;
  collective_name: string;
  host_name: string;
  /** Why the venue cannot join, in words, or null. */
  blocked: string | null;
  services_to_set_up: number;
  same_name: JoinSameName[];
  own_services: JoinOption[];
  forms: { host_type_id: string; name: string; my_type_id: string }[];
  warnings: { no_stripe_paid_services: number; form_services: number; forms_off: boolean };
  /** The venue's classes, events or rooms in words, which stay on its own page, or null. */
  other_models: string | null;
  /** A pending full-access link from the host stands in for the mesh (web plan L4). */
  pending_link?: boolean;
}

/** The venue's answers, as the join and the accept-with-collective bodies carry them. */
export interface JoinChoices {
  same_name_choices: {
    item_id: string;
    choice: 'use_mine' | 'add_new';
    my_service_id?: string;
    option_map?: { my_variant_id: string; host_variant_id: string | null }[];
  }[];
  own_service_choices: { service_id: string; choice: 'ask' | 'park' }[];
  form_choices: { host_type_id: string; choice: 'use_existing' | 'use_theirs'; my_type_id?: string }[];
}

/** GET /api/venue/collectives/[id]/same-names (host): members holding a same-named service, by host service id. */
export interface SameNameMatch {
  venue_id: string;
  venue_name: string;
  service_id: string;
}

/** GET /api/venue/collectives/[id]/adoptions (member): questions the host asked and this venue has not answered. */
export interface PendingAdoption {
  item_id: string;
  service_id: string;
  service_name: string;
  requested_at: string;
}

export interface AdoptionsResponse {
  host_name: string;
  collective_name: string;
  adoptions: PendingAdoption[];
}

/** GET /api/venue/collectives/[id]/adoptions/[itemId]: one question, with both sides' options. */
export interface AdoptionReview {
  item_id: string;
  collective_name: string;
  host_name: string;
  service: { id: string; name: string; options: JoinOption[] };
  host_options: JoinOption[];
  /** Each of the member's options, matched to the host's by name where one fits. */
  suggested_map: { my_variant_id: string; host_variant_id: string | null }[];
}

export interface CollectivesListResponse {
  collectives: CollectiveView[];
}
export interface CollectiveResponse {
  collective: CollectiveView | null;
}
export interface CatalogueResponse {
  catalogue: CatalogueManagementView | null;
  importSources?: unknown[];
}
export interface SlugAvailableResponse {
  available: boolean;
  reason: string | null;
  /** True when the address uses characters outside a-z, 0-9 and hyphens (web `slug-available`). */
  format?: boolean;
}
export interface PageAssetResponse {
  url: string;
}
