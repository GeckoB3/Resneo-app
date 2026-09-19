/**
 * What a service is to a venue collective, in the Services screen's words (web W5/W12, 2026-09).
 *
 * Since web moved collectives to shared services, GET /api/venue/appointment-services may add a
 * `collective` block to each service:
 *
 * - `master`   the host's own service, on the collective page. Saving it updates every venue.
 * - `replica`  a member's copy of a host service. The host owns everything except which of the
 *              member's calendars offer it; the server refuses any other change
 *              (409 `COLLECTIVE_MANAGED_SERVICE`).
 * - `retired`  a copy of a service the host took off the page. It takes no new bookings.
 * - `parked`   the venue's own service, not on the page: nobody can book it while the collective
 *              is live (409 `COLLECTIVE_SERVICE_PARKED` on create). It stays the venue's to edit.
 *
 * Absent at a venue outside a shared-services collective, which keeps today's behaviour.
 * @see Docs/MOBILE_API.md (web), "Venue collectives: what changes for the app"
 */
import type { BadgeTone } from '@/components/ui/Badge';
import type { ManagedService, ServiceCollectiveBlock } from '@/types/services-manage';

export function collectiveBlockOf(service: Pick<ManagedService, 'collective'>): ServiceCollectiveBlock | null {
  return service.collective ?? null;
}

/** The host owns this service: the venue only chooses which of its calendars offer it. */
export function isManagedByHost(service: Pick<ManagedService, 'collective'>): boolean {
  const role = service.collective?.role;
  return role === 'replica' || role === 'retired';
}

export function isParked(service: Pick<ManagedService, 'collective'>): boolean {
  return service.collective?.role === 'parked';
}

export interface CollectiveBadge {
  label: string;
  tone: BadgeTone;
}

/** The one badge a service row shows for its collective role, or null outside a collective. */
export function collectiveBadge(service: Pick<ManagedService, 'collective'>): CollectiveBadge | null {
  const block = service.collective;
  if (!block) return null;
  switch (block.role) {
    case 'master':
      return { label: 'Collective', tone: 'brand' };
    case 'replica':
      return { label: `From ${block.host_venue_name}`, tone: 'brand' };
    case 'retired':
      return { label: 'Retired', tone: 'neutral' };
    case 'parked':
      return { label: 'Parked', tone: 'warning' };
    default:
      return null;
  }
}

/** How the copies are doing, as a short badge, when there is something to say. */
export function collectiveStatusBadge(service: Pick<ManagedService, 'collective'>): CollectiveBadge | null {
  const block = service.collective;
  if (!block || block.role === 'parked' || block.role === 'retired') return null;
  switch (block.status) {
    case 'setting_up':
      return { label: 'Setting up', tone: 'neutral' };
    case 'updating':
      return { label: 'Updating', tone: 'neutral' };
    case 'failed':
      return { label: 'Could not update', tone: 'danger' };
    case 'paused':
      return { label: 'Paused', tone: 'neutral' };
    case 'hidden': {
      const venues = [...new Set(block.hidden_reasons.map((r) => r.venue_name))];
      const staffOnly = block.hidden_reasons.some((r) => r.reason === 'staff_only');
      return {
        label: !staffOnly && venues.length === 1 ? `Hidden at ${venues[0]}` : 'Hidden',
        tone: 'warning',
      };
    }
    default:
      return null;
  }
}

/** The sentences under an expanded row: what the venue may do, and why guests may not book. */
export function collectiveServiceLines(service: Pick<ManagedService, 'collective'>): string[] {
  const block = service.collective;
  if (!block) return [];
  const host = block.host_venue_name;
  const collective = block.collective_name;
  const lines: string[] = [];
  switch (block.role) {
    case 'master':
      lines.push(`This service is on the ${collective} page. Saving it updates it at every venue.`);
      break;
    case 'replica':
      lines.push(
        `${host} manages this service for ${collective}. You choose which of your calendars offer it. For anything else, ask ${host}.`,
      );
      break;
    case 'retired':
      lines.push(
        `${host} took this off the ${collective} page. It takes no new bookings, and bookings already made are not changed.`,
      );
      break;
    case 'parked':
      // The host's own parked service is a service it has not put on the page yet; a member's is
      // parked until it leaves (web `svc.card.parked`, read from `venue_role`, 2026-09-19).
      lines.push(
        block.venue_role === 'host'
          ? `Parked while ${collective} is live. Put it on the page to take bookings for it.`
          : `Parked while your venue is part of ${collective}: nobody can book it, your team included. Bookings already made are not changed. It is bookable again if you leave.`,
      );
      break;
  }
  if (block.role !== 'parked' && block.status_reason) lines.push(block.status_reason);
  return lines;
}
