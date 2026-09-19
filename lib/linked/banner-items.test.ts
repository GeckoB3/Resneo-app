import { bannerItemsFromFeed, filterVisibleBannerItems } from '@/lib/linked/banner-items';

describe('bannerItemsFromFeed (web plan §4)', () => {
  it('turns each feed array into a row with its own destination', () => {
    const items = bannerItemsFromFeed({
      incomingRequests: [
        { id: 'l1', otherVenueName: 'Sept 22 Hair', createdAt: '2026-09-19T10:00:00Z', collective: { id: 'c1', name: 'Sept Collective' } },
        { id: 'l2', otherVenueName: 'Plain Venue', createdAt: '2026-09-19T10:00:00Z', collective: null },
      ],
      outgoingRequests: [{ id: 'l3', otherVenueName: 'Waiting Venue', createdAt: '2026-09-19T10:00:00Z', collective: null }],
      pendingChanges: [{ id: 'l4', otherVenueName: 'Change Venue' }],
      collectiveSetup: [{ collectiveId: 'c2', name: 'Two Salons', slug: 'two-salons', memberNames: ['A', 'B'], reason: 'no_services' }],
      memberWaiting: [{ collectiveId: 'c3', name: 'Host Collective', hostName: 'The Host' }],
    });
    expect(items.map((i) => [i.id, i.href])).toEqual([
      ['request:l1', '/linked-venues?review=l1'],
      ['request:l2', '/linked-venues?review=l2'],
      ['waiting:l3', '/linked-venues'],
      ['change:l4', '/linked-venues/l4'],
      ['setup:c2', '/collectives?setup=c2'],
      ['member-waiting:c3', '/collectives'],
    ]);
    expect(items[0]!.text).toBe('Sept 22 Hair wants to link with your venue and start Sept Collective, a shared booking page.');
    expect(items[1]!.text).toBe('Plain Venue wants to link with your venue.');
    expect(items[4]!.text).toBe('A and B joined Two Salons. Two short steps make your shared booking page live.');
    expect(items[4]!.cta).toBe('Continue setup');
    expect(items[5]!.text).toContain('The Host is setting up the services');
  });

  it('copes with an older server that sends only the first two arrays', () => {
    expect(bannerItemsFromFeed({ incomingRequests: [], pendingChanges: [] })).toEqual([]);
    expect(bannerItemsFromFeed(undefined)).toEqual([]);
  });

  it('hides a row dismissed within the last 24 hours and shows it again after', () => {
    const items = bannerItemsFromFeed({ incomingRequests: [{ id: 'l1', otherVenueName: 'V', createdAt: '' }], pendingChanges: [] });
    const now = 1_000_000_000_000;
    expect(filterVisibleBannerItems(items, { 'request:l1': now - 60_000 }, now)).toEqual([]);
    expect(filterVisibleBannerItems(items, { 'request:l1': now - 25 * 60 * 60 * 1000 }, now)).toHaveLength(1);
  });
});
