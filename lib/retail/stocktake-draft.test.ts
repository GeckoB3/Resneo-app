/**
 * Stocktake counts kept on the phone for poor signal (POS app step 4, UX spec §6.11,
 * `app.stocktake.offline`), and the stocktake's review figures.
 */
import { ApiError } from '@/lib/api/client';
import { reviewSummary, movementReference, joinNames } from '@/lib/retail/stock-words';
import { countWithPending, isOfflineError, lineForCode, lineMatches, type PendingCount } from '@/lib/retail/stocktake-draft';
import { posCopyFor } from '@/lib/pos/copy';
import type { StockMovement, StocktakeLine } from '@/types/retail';

function line(over: Partial<StocktakeLine> = {}): StocktakeLine {
  return {
    variant_id: 'v1',
    product_id: 'p1',
    product_name: 'Shampoo',
    option_name: '250 ml',
    sku: 'SH250',
    barcodes: ['5012345678900'],
    in_scope: true,
    expected_at_start: 5,
    counted: null,
    counted_at: null,
    last_counted_by_name: null,
    moved_since: 0,
    on_hand_now: 5,
    reserved: 0,
    tracked: true,
    change: null,
    value_pence: null,
    zeroed: null,
    flagged_for_review: null,
    ...over,
  };
}

const pending = (variant_id: string, kind: 'add' | 'set', quantity: number): PendingCount => ({
  client_request_id: `${variant_id}-${kind}-${quantity}`,
  variant_id,
  kind,
  quantity,
  label: 'x',
  at: 0,
});

describe('counts waiting on the phone', () => {
  it('show on the row as the server would count them: a set replaces, an add adds', () => {
    const waiting = [pending('v1', 'add', 1), pending('v2', 'set', 9), pending('v1', 'set', 4), pending('v1', 'add', 2)];
    expect(countWithPending(null, waiting, 'v1')).toBe(6);
    expect(countWithPending(3, [pending('v1', 'add', 1)], 'v1')).toBe(4);
    expect(countWithPending(3, [], 'v1')).toBe(3);
    expect(countWithPending(null, [], 'v1')).toBeNull();
  });

  it('are kept only when the server could not be reached', () => {
    expect(isOfflineError(new ApiError('Network request failed.', 0))).toBe(true);
    expect(isOfflineError(new ApiError('Request timed out.', 408))).toBe(true);
    expect(isOfflineError(new ApiError("Shampoo isn't part of this stocktake.", 409))).toBe(false);
    expect(isOfflineError(new Error('x'))).toBe(false);
  });
});

describe('scanning in a stocktake', () => {
  const lines = [line(), line({ variant_id: 'v2', sku: 'COND', barcodes: [], product_name: 'Conditioner', option_name: null })];
  it('finds the row by barcode or SKU (any case), and filters by name', () => {
    expect(lineForCode(lines, '5012345678900')?.variant_id).toBe('v1');
    expect(lineForCode(lines, 'cond')?.variant_id).toBe('v2');
    expect(lineForCode(lines, '999')).toBeNull();
    expect(lines.filter((l) => lineMatches(l, 'condit')).map((l) => l.variant_id)).toEqual(['v2']);
  });
});

describe('the review', () => {
  it('adds up the change at cost and what a commit changes', () => {
    const lines = [
      line({ counted: 3, change: -2, value_pence: -1400 }),
      line({ variant_id: 'v2', counted: 5, change: 0, value_pence: 0 }),
      line({ variant_id: 'v3', counted: null, on_hand_now: 2 }),
      line({ variant_id: 'v4', counted: null, on_hand_now: 0 }),
    ];
    expect(reviewSummary(lines, { full: true, zeroUncounted: false })).toMatchObject({ variancePence: -1400, commitCount: 1, counted: 2 });
    expect(reviewSummary(lines, { full: true, zeroUncounted: true }).commitCount).toBe(2);
    expect(reviewSummary(lines, { full: false, zeroUncounted: true }).commitCount).toBe(1);
  });

  it('names movements by what they point at', () => {
    const t = posCopyFor('client');
    const m = { sale_id: 's', sale_number: 1042, return_id: null, stocktake_id: null, stocktake_number: null, purchase_order_id: null, purchase_order_number: null, booking_id: null, business_date: '2026-10-09' } as StockMovement;
    expect(movementReference(m, t)).toBe('Sale 1042');
    expect(movementReference({ ...m, return_id: 'r' }, t)).toBe('Return on Sale 1042');
    expect(movementReference({ ...m, sale_id: null, stocktake_id: 'st', stocktake_number: 3 }, t)).toBe('Stocktake 3');
    expect(joinNames(['Sam', 'Ali', 'Jo'])).toBe('Sam, Ali and Jo');
  });
});
