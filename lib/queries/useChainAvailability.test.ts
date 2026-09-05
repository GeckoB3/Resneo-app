import { chainAvailabilityPath } from '@/lib/queries/useChainAvailability';
import { ANY_AVAILABLE_PRACTITIONER_ID } from '@/types/appointment-catalog';

/**
 * The chain goes to the PUBLIC availability route (web put `services` there and
 * nowhere else), keyed by venue and practitioner, or pooled with any_available.
 */
describe('chainAvailabilityPath', () => {
  const chain = [
    { service_id: 'a', variant_id: 'v1' },
    { service_id: 'b', addon_ids: ['x'], duration_minutes: 40 },
  ];

  it('asks the public route for one practitioner with the serialised chain', () => {
    const url = new URL(
      chainAvailabilityPath({ venueId: 'venue-1', date: '2026-09-07', practitionerId: 'prac-1', chain }),
      'https://x',
    );
    expect(url.pathname).toBe('/api/booking/availability');
    expect(url.searchParams.get('venue_id')).toBe('venue-1');
    expect(url.searchParams.get('date')).toBe('2026-09-07');
    expect(url.searchParams.get('practitioner_id')).toBe('prac-1');
    expect(url.searchParams.get('any_available')).toBeNull();
    expect(JSON.parse(url.searchParams.get('services')!)).toEqual([
      { service_id: 'a', variant_id: 'v1' },
      { service_id: 'b', addon_ids: ['x'], duration_minutes: 40 },
    ]);
  });

  it('pools with any_available=1 and no practitioner_id for the sentinel', () => {
    const url = new URL(
      chainAvailabilityPath({
        venueId: 'venue-1',
        date: '2026-09-07',
        practitionerId: ANY_AVAILABLE_PRACTITIONER_ID,
        chain,
      }),
      'https://x',
    );
    expect(url.searchParams.get('any_available')).toBe('1');
    expect(url.searchParams.get('practitioner_id')).toBeNull();
  });

  it('sends staff=1 only when booking for a collective, so member-own services resolve', () => {
    const base = { venueId: 'col-1', date: '2026-09-07', practitionerId: 'prac-1', chain };
    const withStaff = new URL(chainAvailabilityPath({ ...base, staff: true }), 'https://x');
    expect(withStaff.searchParams.get('staff')).toBe('1');
    const without = new URL(chainAvailabilityPath(base), 'https://x');
    expect(without.searchParams.get('staff')).toBeNull();
  });
});
