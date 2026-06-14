import { aggregateSourcesByLabel, formatBookingSourceLabel } from '@/lib/reports/csv-export';

/**
 * Pure helpers from the Reports CSV export module. The file-writing / share
 * paths (buildAndShareCsv) touch react-native, expo-file-system and the DOM, so
 * they are out of scope here — only the two pure aggregation helpers are tested.
 */

describe('formatBookingSourceLabel', () => {
  it('maps every known source key to its display label', () => {
    expect(formatBookingSourceLabel('online')).toBe('Online');
    expect(formatBookingSourceLabel('phone')).toBe('Phone');
    expect(formatBookingSourceLabel('walk-in')).toBe('Walk-in');
    expect(formatBookingSourceLabel('widget')).toBe('Website widget');
    expect(formatBookingSourceLabel('booking_page')).toBe('Booking page');
    expect(formatBookingSourceLabel('staff')).toBe('Staff');
    expect(formatBookingSourceLabel('unknown')).toBe('Unknown');
  });

  it('passes an unknown key through unchanged', () => {
    expect(formatBookingSourceLabel('api')).toBe('api');
    expect(formatBookingSourceLabel('')).toBe('');
    expect(formatBookingSourceLabel('Online')).toBe('Online'); // case-sensitive: not the 'online' key
  });
});

describe('aggregateSourcesByLabel', () => {
  it('maps raw keys onto display labels', () => {
    const out = aggregateSourcesByLabel({ online: 3, 'walk-in': 1 });
    expect(out).toEqual([
      { name: 'Online', value: 3 },
      { name: 'Walk-in', value: 1 },
    ]);
  });

  it('merges distinct keys that share a label and sums their counts', () => {
    // Both 'unknown' and any unmapped key resolving to the same label would merge;
    // here we force a real merge by passing a key whose label collides with another.
    const out = aggregateSourcesByLabel({ Online: 2, online: 5 });
    // 'online' -> 'Online' (mapped); 'Online' -> 'Online' (passthrough) — same label, summed.
    expect(out).toEqual([{ name: 'Online', value: 7 }]);
  });

  it('sorts results by volume descending', () => {
    const out = aggregateSourcesByLabel({ online: 2, phone: 10, staff: 5 });
    expect(out.map((r) => r.name)).toEqual(['Phone', 'Staff', 'Online']);
    expect(out.map((r) => r.value)).toEqual([10, 5, 2]);
  });

  it('returns an empty array for an empty input', () => {
    expect(aggregateSourcesByLabel({})).toEqual([]);
  });

  it('keeps unknown source keys under their raw passthrough label', () => {
    const out = aggregateSourcesByLabel({ api: 4, online: 1 });
    expect(out).toEqual([
      { name: 'api', value: 4 },
      { name: 'Online', value: 1 },
    ]);
  });
});
