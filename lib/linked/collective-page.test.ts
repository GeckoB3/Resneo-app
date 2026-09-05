import {
  collectiveAdoptedSlug,
  collectivePublicPath,
  settingsCollectiveNote,
} from '@/lib/linked/collective-page';

const base = {
  id: 'col-1',
  name: 'The Hair Collective',
  slug: 'hair-collective',
  status: 'active' as const,
  pageMode: 'unified_catalog' as const,
  myMembershipStatus: 'active' as const,
  activeMemberCount: 2,
  isHost: true,
  hostVenueId: 'venue-host',
  slugStrategy: 'dedicated' as const,
  adoptedVenueId: null,
  members: [
    { venueId: 'venue-host', venueName: 'Host Salon', venueSlug: 'host-salon' },
    { venueId: 'venue-member', venueName: 'Member Barbers', venueSlug: 'member-barbers' },
  ],
};

describe('collectivePublicPath', () => {
  it('uses the dedicated combined address by default', () => {
    expect(collectiveAdoptedSlug(base)).toBeNull();
    expect(collectivePublicPath(base)).toBe('/book/c/hair-collective');
  });

  it('uses the adopted member venue address when the collective adopted one', () => {
    const adopted = { ...base, slugStrategy: 'adopt_member' as const, adoptedVenueId: 'venue-member' };
    expect(collectiveAdoptedSlug(adopted)).toBe('member-barbers');
    expect(collectivePublicPath(adopted)).toBe('/book/member-barbers');
  });

  it('falls back to the dedicated address when an older payload carries no member slug', () => {
    const adopted = {
      ...base,
      slugStrategy: 'adopt_member' as const,
      adoptedVenueId: 'venue-member',
      members: base.members.map(({ venueId }) => ({ venueId })),
    };
    expect(collectivePublicPath(adopted)).toBe('/book/c/hair-collective');
  });
});

describe('settingsCollectiveNote', () => {
  it('names the live collective for a host, with the host venue name', () => {
    expect(settingsCollectiveNote([base], 'venue-host')).toEqual({
      id: 'col-1',
      name: 'The Hair Collective',
      isHost: true,
      hostVenueName: 'Host Salon',
      adoptedThisVenue: false,
    });
  });

  it('says when the combined page is served at this venue\'s own address', () => {
    const adopted = {
      ...base,
      isHost: false,
      slugStrategy: 'adopt_member' as const,
      adoptedVenueId: 'venue-member',
    };
    expect(settingsCollectiveNote([adopted], 'venue-member')).toMatchObject({
      isHost: false,
      adoptedThisVenue: true,
    });
    expect(settingsCollectiveNote([adopted], 'venue-host')?.adoptedThisVenue).toBe(false);
  });

  it('ignores a dissolved collective, an open invitation, a solo host and a pairwise-only venue', () => {
    expect(settingsCollectiveNote([{ ...base, status: 'dissolved' }], 'venue-host')).toBeNull();
    expect(settingsCollectiveNote([{ ...base, myMembershipStatus: 'invited' }], 'venue-host')).toBeNull();
    expect(settingsCollectiveNote([{ ...base, activeMemberCount: 1 }], 'venue-host')).toBeNull();
    expect(settingsCollectiveNote([{ ...base, pageMode: 'directory' }], 'venue-host')).toBeNull();
    expect(settingsCollectiveNote([], 'venue-host')).toBeNull();
    expect(settingsCollectiveNote([base], null)).toBeNull();
  });
});
