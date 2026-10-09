/**
 * The stock value tile (UX spec §6.8): since 2026-10-09 the web sends `value_cost_pence` and
 * `value_retail_pence` as null to staff without `view_reports`, and the app hides the tile then
 * rather than showing £0.00.
 */
import { stockValueTilePence } from '@/lib/retail/stock-words';

describe('stockValueTilePence', () => {
  it('rounds a value the server sends', () => {
    expect(stockValueTilePence(123456.4)).toBe(123456);
    expect(stockValueTilePence(0)).toBe(0);
  });

  it('is null (no tile) when the value is withheld or missing', () => {
    expect(stockValueTilePence(null)).toBeNull();
    expect(stockValueTilePence(undefined)).toBeNull();
    expect(stockValueTilePence(Number.NaN)).toBeNull();
  });
});
