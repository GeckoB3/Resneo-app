/**
 * Products and stock in the app (2026-10-09 parity with the web's Stock page tabs): with Track
 * stock off only Products shows; with it on, the web's tabs follow, Professional use only for
 * `record_professional_use` and Reports only for `view_reports`; `?tab=` opens one, and Low
 * stock's "Suggest an order" opens Purchase orders with that supplier.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useLocalSearchParams: () => mockParams }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
let mockBoot: Record<string, unknown>;
jest.mock('@/lib/queries/usePos', () => ({
  usePosEnabled: () => true,
  usePosBootstrap: () => ({ data: mockBoot, isLoading: false }),
}));
function mockTab(name: string) {
  const { Text, Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  function MockTab(props: Record<string, unknown>) {
    return React.createElement(
      Pressable,
      { onPress: () => (props.onSuggestOrder as ((id: string) => void) | undefined)?.('sup1') },
      React.createElement(Text, null, `${name} ${JSON.stringify(props)}`),
    );
  }
  return MockTab;
}
jest.mock('@/components/retail/ProductsTab', () => ({ ProductsTab: mockTab('PRODUCTS') }));
jest.mock('@/components/retail/LevelsTab', () => ({ LevelsTab: mockTab('LEVELS') }));
jest.mock('@/components/retail/MovementsTab', () => ({ MovementsTab: mockTab('MOVEMENTS') }));
jest.mock('@/components/retail/StocktakesTab', () => ({ StocktakesTab: mockTab('STOCKTAKES') }));
jest.mock('@/components/retail/OrdersTab', () => ({ OrdersTab: mockTab('ORDERS') }));
jest.mock('@/components/retail/SuppliersTab', () => ({ SuppliersTab: mockTab('SUPPLIERS') }));
jest.mock('@/components/retail/ProfessionalUseTab', () => ({ ProfessionalUseTab: mockTab('USE') }));
jest.mock('@/components/retail/StockReportsTab', () => ({ StockReportsTab: mockTab('REPORTS') }));

import ProductsAndStockScreen from '@/app/(app)/stock/index';

function boot(trackStock: boolean, caps: Record<string, boolean>) {
  return { capabilities: caps, settings: { track_stock_enabled: trackStock }, venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' } };
}

beforeEach(() => {
  mockParams = {};
});

describe('products and stock', () => {
  it('shows only Products with Track stock off', async () => {
    mockBoot = boot(false, { manage_products: true, import_products: true, export: true });
    await render(<ProductsAndStockScreen />);
    expect(screen.queryByText('Stock levels')).toBeNull();
    expect(screen.getByText(/PRODUCTS .*"canImport":true/)).toBeTruthy();
  });

  it("shows the web's tabs, Professional use and Reports by capability", async () => {
    mockBoot = boot(true, { manage_products: true });
    await render(<ProductsAndStockScreen />);
    for (const label of ['Products', 'Stock levels', 'Movements', 'Stocktakes', 'Purchase orders', 'Suppliers']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText('Professional use')).toBeNull();
    expect(screen.queryByText('Reports')).toBeNull();
    expect(screen.getByText(/PRODUCTS .*"canImport":false/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Suppliers'));
    });
    expect(screen.getByText(/SUPPLIERS .*"canManage":false/)).toBeTruthy();
  });

  it('opens a tab from the link, and Suggest an order on Purchase orders', async () => {
    mockBoot = boot(true, { record_professional_use: true, view_reports: true, manage_purchase_orders: true });
    mockParams = { tab: 'levels', filter: 'low' };
    await render(<ProductsAndStockScreen />);
    expect(screen.getByText('Professional use')).toBeTruthy();
    expect(screen.getByText('Reports')).toBeTruthy();
    expect(screen.getByText(/LEVELS .*"initialFilter":"low"/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(/LEVELS/));
    });
    expect(screen.getByText(/ORDERS .*"suggestSupplierId":"sup1"/)).toBeTruthy();
  });
});
