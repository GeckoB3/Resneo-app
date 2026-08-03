/**
 * Where a staff member has to be for a booking (web parity:
 * `src/lib/booking/staff-booking-location.ts`).
 *
 * Guests are told the location too, but their needs are the opposite of the
 * team's: the guest email deliberately omits directions for a client-address
 * booking because the client lives there. Staff are the ones who have to travel,
 * so here the address gets a maps link and the online joining details are shown
 * in full.
 *
 * Business-venue bookings resolve to null: the team already knows where their own
 * venue is, and a "Location: here" row on every booking would bury the ones that
 * actually need attention. Legacy rows created before the location snapshot
 * existed have a null `location_type` and resolve to null too.
 */

export type StaffBookingLocationKind = 'client_address' | 'online';

/** Why the useful part is absent, so the UI can say something better than nothing. */
export type StaffBookingLocationGap =
  | 'none'
  /** Client-address service saved without an address (legacy or staff-created booking). */
  | 'address_not_recorded'
  /** Linked-venue viewer without permission to see the other venue's client details. */
  | 'address_hidden'
  /** Online service with no meeting link set on the service. */
  | 'no_link'
  /**
   * Online booking still rendering from the /summary prefetch, which spreads the
   * booking row and so carries `location_type` but never the joining details
   * (those are resolved live from the service by the full GET only). Without this
   * the callout would accuse the venue of having no meeting link for the fraction
   * of a second before the full detail lands.
   */
  | 'link_pending';

export interface StaffBookingLocationView {
  kind: StaffBookingLocationKind;
  /** One-line client address; null when not recorded or hidden. */
  address: string | null;
  /** Maps search link for the address; null when there is no address to search. */
  mapsUrl: string | null;
  /** Online joining link, read live from the service so a corrected link shows here. */
  joinUrl: string | null;
  /** Joining instructions shown to the client, so staff can answer questions about them. */
  joinInfo: string | null;
  gap: StaffBookingLocationGap;
}

export interface StaffBookingLocationInput {
  location_type?: string | null;
  client_address_line1?: string | null;
  client_address_line2?: string | null;
  client_address_city?: string | null;
  client_address_postcode?: string | null;
  /** Resolved live from the service; only present once the full booking detail has loaded. */
  online_meeting_url?: string | null;
  online_meeting_info?: string | null;
  /**
   * True while the payload is still the /summary placeholder, so a missing join
   * link means "not fetched yet" rather than "never configured".
   */
  detailPending?: boolean;
  /**
   * True when the viewer is a linked venue without PII rights, so the API nulled
   * the address fields. Without this the UI would tell staff the address was never
   * recorded, which reads as a data-entry mistake rather than a permission
   * boundary. No app surface passes this yet — linked bookings render through
   * their own read-only sheet — but the distinction belongs with the resolver.
   */
  addressHidden?: boolean;
}

/** "12 Elm Row, Flat 2, Edinburgh, EH7 4AA" — null when nothing was recorded. */
export function formatClientAddressOneLine(addr: {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  postcode?: string | null;
}): string | null {
  const parts = [addr.line1, addr.line2, addr.city, addr.postcode]
    .map((p) => (p ?? '').trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Google Maps search link for an address. Mirrors the web's
 * `buildGoogleMapsDirectionsUrl`, but built with `encodeURIComponent` rather than
 * `URLSearchParams` (React Native ships only a partial implementation of it).
 *
 * This is a universal link: it opens the Maps app when one is installed and falls
 * back to the browser when not.
 */
export function buildMapsSearchUrl(address: string | null | undefined): string | null {
  const a = (address ?? '').trim();
  if (!a) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
}

/** Null when the booking is at the business venue, or predates the location snapshot. */
export function resolveStaffBookingLocation(
  input: StaffBookingLocationInput,
): StaffBookingLocationView | null {
  // Deliberate divergence from web, which resolves every null `location_type` to
  // null: a legacy row that predates the snapshot but still recorded an address is
  // a client-address booking in all but the column, and the app used to show that
  // address. An address is only ever captured for client-address services, so
  // trusting it here cannot mislabel a booking at the venue.
  const isLegacyClientAddress =
    input.location_type == null && !!input.client_address_line1?.trim();

  if (input.location_type === 'client_address' || isLegacyClientAddress) {
    const address = formatClientAddressOneLine({
      line1: input.client_address_line1,
      line2: input.client_address_line2,
      city: input.client_address_city,
      postcode: input.client_address_postcode,
    });
    return {
      kind: 'client_address',
      address,
      mapsUrl: buildMapsSearchUrl(address),
      joinUrl: null,
      joinInfo: null,
      gap: address ? 'none' : input.addressHidden ? 'address_hidden' : 'address_not_recorded',
    };
  }

  if (input.location_type === 'online') {
    const joinUrl = input.online_meeting_url?.trim() || null;
    return {
      kind: 'online',
      address: null,
      mapsUrl: null,
      joinUrl,
      joinInfo: input.online_meeting_info?.trim() || null,
      gap: joinUrl ? 'none' : input.detailPending ? 'link_pending' : 'no_link',
    };
  }

  return null;
}

/** Short marker for a collapsed row, where there is only room for a couple of words. */
export function staffBookingLocationPillLabel(kind: StaffBookingLocationKind): string {
  return kind === 'online' ? 'Online' : 'Client address';
}
