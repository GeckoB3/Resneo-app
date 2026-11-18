import { groupServicesForOrdering, serviceOrderIds, withGroupOrder } from '@/lib/services/service-order';

const services = [
  { id: 'a', name: 'Cut', duration_minutes: 30, heading: 'Hair' },
  { id: 'b', name: 'Colour', duration_minutes: 90, heading: 'Hair' },
  { id: 'c', name: 'Gel polish', duration_minutes: 45, heading: 'Nails' },
  { id: 'd', name: 'Brow tint', duration_minutes: null, heading: 'Other services' },
];

describe('groupServicesForOrdering', () => {
  it('buckets a sorted list under its headings, in order', () => {
    const groups = groupServicesForOrdering(services, (s) => s.heading);
    expect(groups.map((g) => g.heading)).toEqual(['Hair', 'Nails', 'Other services']);
    expect(groups[0]!.services.map((s) => s.id)).toEqual(['a', 'b']);
    expect(groups[0]!.services[1]).toEqual({ id: 'b', name: 'Colour', durationMinutes: 90 });
    expect(groups[2]!.services[0]!.durationMinutes).toBeNull();
  });

  it('makes one untitled group when the venue uses no categories', () => {
    const groups = groupServicesForOrdering(services, () => null);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.heading).toBeNull();
    expect(groups[0]!.services).toHaveLength(4);
  });
});

describe('withGroupOrder and serviceOrderIds', () => {
  it('saves a drag inside one heading as the full new order', () => {
    const groups = groupServicesForOrdering(services, (s) => s.heading);
    const hair = groups[0]!.services;
    const next = withGroupOrder(groups, 'Hair', [hair[1]!, hair[0]!]);
    expect(serviceOrderIds(next)).toEqual(['b', 'a', 'c', 'd']);
    // The other headings are untouched.
    expect(next[1]).toBe(groups[1]);
  });
});
