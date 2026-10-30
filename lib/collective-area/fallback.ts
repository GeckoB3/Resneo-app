/**
 * Manage Collective for a host whose collective has nothing on the page yet (CQ-10.3, R2-21; web
 * `CollectiveAreaClient`'s fallback, 2026-10-26).
 *
 * The area reads its collective from the services' collective blocks (`areaCollective`). Those exist
 * only once something is parked or on the page, which needs two active venues: right after Create, or
 * after the only member leaves or declines, a host has none, and the screen said "No collective" with
 * no way to invite a venue or end it from the phone. The collectives list still names it, so the area
 * falls back to that: the live shared-services collective this venue hosts.
 */
import { areaCollective, type AreaCollective, type AreaService } from '@/lib/collective-area/model';
import type { CollectiveView } from '@/types/collectives';

export interface AreaCollectiveWithFallback extends AreaCollective {
  /** Read from the collectives list, not the services: nothing is on the page, or parked, yet. */
  noServices?: boolean;
  /** Active venues in it, the host included, when read from the list. */
  activeMemberCount?: number;
}

export function areaCollectiveWithFallback(
  services: readonly AreaService[],
  collectives: readonly CollectiveView[] | null | undefined,
): AreaCollectiveWithFallback | null {
  const fromServices = areaCollective(services);
  if (fromServices) return fromServices;
  const hosted = (collectives ?? []).find(
    (c) => c.isHost && c.serviceModel === 'replicas' && c.status !== 'dissolved',
  );
  if (!hosted) return null;
  const host = hosted.members.find((m) => m.venueId === hosted.hostVenueId);
  return {
    id: hosted.id,
    name: hosted.name,
    hostVenueName: host?.venueName ?? hosted.name,
    isHost: true,
    noServices: true,
    activeMemberCount: hosted.activeMemberCount,
  };
}
