import {
  collectiveAdoptedSlug,
  collectiveEmbedOptions,
  collectivePublicPath,
  combinedScopeEmbedTarget,
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
      publicPath: '/book/c/hair-collective',
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

describe('combinedScopeEmbedTarget', () => {
  it('embeds a live collective at the address guests use', () => {
    expect(combinedScopeEmbedTarget(base)).toEqual({
      slug: 'hair-collective',
      name: 'The Hair Collective',
      path: '/book/c/hair-collective',
    });
    const adopted = { ...base, slugStrategy: 'adopt_member' as const, adoptedVenueId: 'venue-member' };
    expect(combinedScopeEmbedTarget(adopted)?.path).toBe('/book/member-barbers');
    // The embed itself is always the collective's /embed/c/{slug}: only the QR follows the address.
    expect(combinedScopeEmbedTarget(adopted)?.slug).toBe('hair-collective');
  });

  it('offers nothing for a page that is not live', () => {
    expect(combinedScopeEmbedTarget(null)).toBeNull();
    expect(combinedScopeEmbedTarget({ ...base, activeMemberCount: 1 })).toBeNull();
    expect(combinedScopeEmbedTarget({ ...base, status: 'dissolved' })).toBeNull();
  });
});

describe('collectiveEmbedOptions', () => {
  it('lists the live collectives this venue is an active member of, as the web choice does', () => {
    const second = { ...base, id: 'col-2', name: 'Directory', slug: 'directory', pageMode: 'directory' as const };
    expect(collectiveEmbedOptions([base, second]).map((o) => o.slug)).toEqual(['hair-collective', 'directory']);
    expect(collectiveEmbedOptions([{ ...base, myMembershipStatus: 'invited' }])).toEqual([]);
    expect(collectiveEmbedOptions([{ ...base, activeMemberCount: 1 }])).toEqual([]);
    expect(collectiveEmbedOptions([{ ...base, status: 'dissolved' }])).toEqual([]);
  });
});
