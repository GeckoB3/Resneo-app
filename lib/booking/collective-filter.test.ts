import {
  collectiveChoicesFor,
  collectiveFilterLabel,
  filterByCollective,
  matchesCollectiveFilter,
} from './collective-filter';

const own = { collective_id: null, collective_name: null };
const viaA = { collective_id: 'col-a', collective_name: 'Aura Hair' };
const viaB = { collective_id: 'col-b', collective_name: null };

describe('matchesCollectiveFilter', () => {
  it('keeps everything on all', () => {
    expect([own, viaA, viaB].filter((r) => matchesCollectiveFilter(r, 'all'))).toHaveLength(3);
  });

  it('keeps only bookings not made through a collective on none', () => {
    expect([own, viaA, viaB, {}].filter((r) => matchesCollectiveFilter(r, 'none'))).toEqual([own, {}]);
  });

  it('keeps only the chosen collective', () => {
    expect([own, viaA, viaB].filter((r) => matchesCollectiveFilter(r, 'col-a'))).toEqual([viaA]);
  });
});

describe('collectiveChoicesFor', () => {
  it('is empty when no booking came through a collective', () => {
    expect(collectiveChoicesFor([own, own], 'all')).toEqual([]);
  });

  it('lists each collective once, in first-seen order, naming an unnamed one Collective', () => {
    expect(collectiveChoicesFor([viaB, own, viaA, viaB], 'all')).toEqual([
      { id: 'col-b', name: 'Collective' },
      { id: 'col-a', name: 'Aura Hair' },
    ]);
  });

  it('keeps a chosen collective that is no longer in the rows', () => {
    expect(collectiveChoicesFor([own], 'col-gone')).toEqual([{ id: 'col-gone', name: 'Collective' }]);
  });

  it('does not add a choice for none', () => {
    expect(collectiveChoicesFor([own], 'none')).toEqual([]);
  });
});

describe('collectiveFilterLabel', () => {
  const choices = [{ id: 'col-a', name: 'Aura Hair' }];
  it('labels each filter', () => {
    expect(collectiveFilterLabel('all', choices)).toBeNull();
    expect(collectiveFilterLabel('none', choices)).toBe('Not through a collective');
    expect(collectiveFilterLabel('col-a', choices)).toBe('Aura Hair');
    expect(collectiveFilterLabel('col-x', choices)).toBe('Collective');
  });
});

describe('filterByCollective', () => {
  const rows = [
    { id: 'own-1', collective_id: null },
    { id: 'own-2', collective_id: 'col-a' },
    { id: 'linked-1', collective_id: null },
  ];
  const isLinked = (id: string) => id.startsWith('linked');

  it('narrows own bookings and lets linked venues through', () => {
    expect(filterByCollective(rows, 'col-a', isLinked).map((r) => r.id)).toEqual(['own-2', 'linked-1']);
    expect(filterByCollective(rows, 'none', isLinked).map((r) => r.id)).toEqual(['own-1', 'linked-1']);
  });

  it('keeps everything on all', () => {
    expect(filterByCollective(rows, 'all', isLinked)).toHaveLength(3);
  });
});
