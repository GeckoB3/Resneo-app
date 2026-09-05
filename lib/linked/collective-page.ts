import type { CollectiveMemberView, CollectiveView } from '@/types/collectives';

type CollectiveAddressView = Pick<CollectiveView, 'slug' | 'slugStrategy' | 'adoptedVenueId'> & {
  members: Pick<CollectiveMemberView, 'venueId' | 'venueSlug'>[];
};

/**
 * The member venue's own booking slug when the collective adopted that venue's
 * address, else null. Needs `members[].venueSlug`, which the collectives list
 * carries since web 2026-09-05; an older payload answers null and the
 * dedicated address is used, which is what it showed before.
 */
export function collectiveAdoptedSlug(collective: CollectiveAddressView): string | null {
  if (collective.slugStrategy !== 'adopt_member' || !collective.adoptedVenueId) return null;
  const adopted = collective.members.find((m) => m.venueId === collective.adoptedVenueId);
  return adopted?.venueSlug ?? null;
}

/**
 * The address customers actually use: a member venue's own page when the
 * collective adopted it, otherwise the dedicated combined address (web parity:
 * the manager's page link and the panel's "View combined booking page").
 */
export function collectivePublicPath(collective: CollectiveAddressView): string {
  const adopted = collectiveAdoptedSlug(collective);
  return adopted ? `/book/${adopted}` : `/book/c/${collective.slug}`;
}

/** The live venue collective a venue belongs to, as the Booking page settings notice needs it. */
export interface SettingsCollectiveNote {
  id: string;
  name: string;
  /** This venue hosts the collective, so it can open Manage combined page. */
  isHost: boolean;
  hostVenueName: string;
  /** The combined page is served at this venue's own booking address. */
  adoptedThisVenue: boolean;
}

type CollectiveNoteView = Pick<
  CollectiveView,
  | 'id'
  | 'name'
  | 'status'
  | 'pageMode'
  | 'myMembershipStatus'
  | 'activeMemberCount'
  | 'isHost'
  | 'hostVenueId'
  | 'slugStrategy'
  | 'adoptedVenueId'
> & { members: Pick<CollectiveMemberView, 'venueId' | 'venueName'>[] };

/**
 * The collective whose combined page this venue is part of: active, in
 * `unified_catalog` mode, with this venue an active member and at least two
 * active members, the gate the combined page applies to render (web
 * `findStaffCollectiveForVenue`, minus the plan-eligibility check the server
 * keeps to itself). Null when the venue books for itself.
 */
export function settingsCollectiveNote(
  collectives: readonly CollectiveNoteView[],
  myVenueId: string | null | undefined,
): SettingsCollectiveNote | null {
  if (!myVenueId) return null;
  const live = collectives.find(
    (c) =>
      c.status === 'active' &&
      c.pageMode === 'unified_catalog' &&
      c.myMembershipStatus === 'active' &&
      c.activeMemberCount >= 2,
  );
  if (!live) return null;
  return {
    id: live.id,
    name: live.name,
    isHost: live.isHost,
    hostVenueName:
      live.members.find((m) => m.venueId === live.hostVenueId)?.venueName ?? 'The host venue',
    adoptedThisVenue: live.slugStrategy === 'adopt_member' && live.adoptedVenueId === myVenueId,
  };
}
