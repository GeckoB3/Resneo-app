/**
 * Camera scanning's pure parts (UX spec §13.6): the forms a UPC-A code is stored under, and taking
 * each code once while the camera keeps seeing it.
 */
import { acceptScan, NEW_SCAN_GATE, SAME_CODE_PAUSE_MS, sameBarcode, scanCandidates } from '@/lib/retail/scan';
import { lineForCode } from '@/lib/retail/stocktake-draft';
import type { StocktakeLine } from '@/types/retail';

describe('scanCandidates', () => {
  it('tries a UPC-A code with and without the EAN-13 leading 0, scanned form first', () => {
    expect(scanCandidates('012345678905')).toEqual(['012345678905', '0012345678905']);
    expect(scanCandidates('0012345678905')).toEqual(['0012345678905', '012345678905']);
  });

  it('leaves every other code as it is', () => {
    expect(scanCandidates(' 5012345678900 ')).toEqual(['5012345678900']);
    expect(scanCandidates('SKU-1')).toEqual(['SKU-1']);
    expect(scanCandidates('  ')).toEqual([]);
  });

  it('matches a stored barcode in either form', () => {
    expect(sameBarcode('012345678905', '0012345678905')).toBe(true);
    expect(sameBarcode('5012345678900', '012345678905')).toBe(false);
    expect(sameBarcode('', '')).toBe(false);
  });
});

describe('acceptScan', () => {
  it('takes a code once while it stays in view, and again after a pause', () => {
    let gate = NEW_SCAN_GATE;
    let r = acceptScan(gate, '5012345678900', 1000);
    expect(r.accept).toBe(true);
    gate = r.gate;
    r = acceptScan(gate, '5012345678900', 1300);
    expect(r.accept).toBe(false);
    gate = r.gate;
    // Still in view: each sighting keeps it from counting again.
    r = acceptScan(gate, '5012345678900', 1300 + SAME_CODE_PAUSE_MS - 1);
    expect(r.accept).toBe(false);
    gate = r.gate;
    r = acceptScan(gate, '5012345678900', 1300 + 2 * SAME_CODE_PAUSE_MS);
    expect(r.accept).toBe(true);
  });

  it('takes a different code straight away, and ignores an empty read', () => {
    const first = acceptScan(NEW_SCAN_GATE, 'A1234', 0);
    expect(acceptScan(first.gate, 'B1234', 10).accept).toBe(true);
    expect(acceptScan(first.gate, '  ', 10).accept).toBe(false);
  });
});

describe('lineForCode with a camera scan', () => {
  const line = (over: Partial<StocktakeLine>): StocktakeLine => ({
    variant_id: 'v1',
    product_id: 'p1',
    product_name: 'Shampoo',
    option_name: null,
    sku: 'SH-1',
    barcodes: ['012345678905'],
    in_scope: true,
    expected_at_start: 3,
    counted: null,
    counted_at: null,
    last_counted_by_name: null,
    moved_since: 0,
    on_hand_now: 3,
    reserved: 0,
    tracked: true,
    change: null,
    value_pence: null,
    zeroed: null,
    flagged_for_review: null,
    ...over,
  });

  it('finds a UPC-A product an iPhone read as EAN-13', () => {
    expect(lineForCode([line({})], '0012345678905')?.variant_id).toBe('v1');
  });
});
