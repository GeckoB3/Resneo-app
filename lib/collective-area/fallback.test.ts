/**
 * Manage Collective for a host with nothing on the page yet (CQ-10.3, R2-21): the collective comes
 * from the collectives list when the services carry no block, so the host can invite a venue or end
 * it rather than reading "No collective".
 */
import { areaCollectiveWithFallback } from '@/lib/collective-area/fallback';
import type { AreaService } from '@/lib/collective-area/model';
import type { CollectiveView } from '@/types/collectives';

function view(overrides: Partial<CollectiveView>): CollectiveView {
  return {
    id: 'col-1',
    slug: 'plus-1',
    name: 'Plus 1',
    status: 'active',
    branding: {},
    serviceGrouping: 'by_practitioner',
    allowAnyPractitioner: true,
    pageMode: 'unified_catalog',
    slugStrategy: 'dedicated',
    adoptedVenueId: null,
    timezone: 'Europe/London',
    bookingPageConfig: null,
    isHost: true,
    hostVenueId: 'v-host',
    serviceModel: 'replicas',
    myVenueId: 'v-host',
    myMembershipStatus: 'active',
    myConfig: null,
    members: [
      { venueId: 'v-host', venueName: 'Aura Hair Studio', status: 'active', displayOrder: 0, soloPageBehavior: 'redirect' },
      { venueId: 'v-16', venueName: 'Light 16', status: 'invited', displayOrder: 1, soloPageBehavior: 'redirect' },
    ],
    activeMemberCount: 1,
    ...overrides,
  };
}

describe('areaCollectiveWithFallback', () => {
  it('reads the collective from the services when they carry one', () => {
    const services = [
      {
        id: 's1',
        collective: {
          collective_id: 'col-9',
          collective_name: 'From services',
          host_venue_name: 'Aura Hair Studio',
          role: 'master',
          venue_role: 'host',
        },
      },
    ] as unknown as AreaService[];
    expect(areaCollectiveWithFallback(services, [view({})])).toEqual({
      id: 'col-9',
      name: 'From services',
      hostVenueName: 'Aura Hair Studio',
      isHost: true,
    });
  });

  it("falls back to the shared-services collective this venue hosts, with nothing on the page", () => {
    expect(areaCollectiveWithFallback([], [view({})])).toEqual({
      id: 'col-1',
      name: 'Plus 1',
      hostVenueName: 'Aura Hair Studio',
      isHost: true,
      noServices: true,
      activeMemberCount: 1,
    });
  });

  it('finds none for a member, an ended collective or an older one', () => {
    expect(areaCollectiveWithFallback([], [view({ isHost: false })])).toBeNull();
    expect(areaCollectiveWithFallback([], [view({ status: 'dissolved' })])).toBeNull();
    expect(areaCollectiveWithFallback([], [view({ serviceModel: 'legacy_copies' })])).toBeNull();
    expect(areaCollectiveWithFallback([], undefined)).toBeNull();
  });
});
