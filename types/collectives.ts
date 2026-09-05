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

export interface CollectiveMemberActionPayload {
  action: CollectiveMemberAction;
  venueId?: string;
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
  | 'set_providers';

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
}

export type PageAssetKind = 'logo' | 'cover' | 'gallery' | 'offering' | 'team';

// ---------------------------------------------------------------------------
// API response wrappers
// ---------------------------------------------------------------------------

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
}
export interface PageAssetResponse {
  url: string;
}
