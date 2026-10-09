import { LOW_STOCK_SHOWN, lowStockKey, lowStockPath } from './useLowStock';

describe('useLowStock paths', () => {
  it('asks the web home card route for five rows by default', () => {
    expect(LOW_STOCK_SHOWN).toBe(5);
    expect(lowStockPath()).toBe('/api/venue/retail/stock/low?limit=5');
  });

  it('keys under the POS prefix so pull to refresh can find it', () => {
    expect(lowStockKey('token')[2]).toBe('low-stock');
  });
});
