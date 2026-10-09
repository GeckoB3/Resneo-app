/**
 * Importing products from a CSV in the app (UX spec §6.5; web `ProductImport.tsx`): needs
 * `import_products`; a file that is not a CSV is refused; the headers are matched (first guesses
 * from their names); the check is a dry run whose rows show new, skipped or the problem in the
 * server's words; the import sends the same file for real and lists any row the save refused.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}));
const mockPick = jest.fn();
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...args: unknown[]) => mockPick(...args) }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }) }));
let mockCaps: Record<string, boolean> = { import_products: true };
jest.mock('@/lib/queries/usePos', () => ({
  usePosEnabled: () => true,
  usePosBootstrap: () => ({
    data: { capabilities: mockCaps, settings: { track_stock_enabled: true }, venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' } },
    isLoading: false,
  }),
}));
const mockText = jest.fn();
jest.mock('@/lib/retail/read-picked-file', () => ({ readPickedFileText: (...args: unknown[]) => mockText(...args) }));
const mockImport = jest.fn();
jest.mock('@/lib/queries/useStockSetup', () => ({
  useImportProducts: () => ({ mutateAsync: mockImport, isPending: false }),
}));

import ImportProductsScreen from '@/app/(app)/stock/import';

const CSV = 'Product Name,RRP,Qty\r\nOil,12.50,3\r\nWax,oops,1\r\n';

beforeEach(() => {
  mockCaps = { import_products: true };
  mockPick.mockReset();
  mockText.mockReset();
  mockImport.mockReset();
});

describe('importing products', () => {
  it('needs import_products', async () => {
    mockCaps = { import_products: false };
    await render(<ImportProductsScreen />);
    expect(screen.getByText('You need permission to import products. An admin can give it to you in Settings.')).toBeTruthy();
  });

  it('refuses a file that is not a CSV', async () => {
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///a.xlsx', name: 'a.xlsx', mimeType: 'application/zip', size: 10 }] });
    await render(<ImportProductsScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('Choose a file'));
    });
    expect(screen.getByText("That isn't a CSV file. Save your spreadsheet as CSV and try again.")).toBeTruthy();
    expect(mockText).not.toHaveBeenCalled();
  });

  it('matches the columns, checks the file, then imports it and lists any row the save refused', async () => {
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///p.csv', name: 'p.csv', mimeType: 'text/csv', size: 60 }] });
    mockText.mockResolvedValue(CSV);
    const checked = {
      rows: [
        { row: 2, status: 'new', problem: null, name: 'Oil', option_name: null, sku: null },
        { row: 3, status: 'error', problem: 'Price: Enter a price, like 12.50.', name: 'Wax', option_name: null, sku: null },
      ],
      summary: { new: 1, skipped: 0, problems: 1 },
      imported: 0,
      dry_run: true,
    };
    mockImport.mockResolvedValueOnce(checked);
    await render(<ImportProductsScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('Choose a file'));
    });
    expect(screen.getByText('Step 2 of 4')).toBeTruthy();
    expect(screen.getByText('File: p.csv')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Check the file'));
    });
    expect(mockImport).toHaveBeenCalledWith({ csv: CSV, dry_run: true, columns: { name: 'Product Name', price: 'RRP', stock_on_hand: 'Qty' } });
    expect(screen.getByText('1 new products, 0 skipped, 1 with problems')).toBeTruthy();
    expect(screen.getByText('Price: Enter a price, like 12.50.')).toBeTruthy();

    mockImport.mockResolvedValueOnce({
      ...checked,
      rows: [{ ...checked.rows[0], status: 'error', problem: 'Oil already uses the SKU X.' }, checked.rows[1]],
      imported: 0,
      dry_run: false,
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Import 1 product'));
    });
    expect(mockImport).toHaveBeenLastCalledWith(expect.objectContaining({ dry_run: false }));
    expect(screen.getByText('Imported 0 products and their opening stock.')).toBeTruthy();
    expect(screen.getByText(/Row 2: Oil\. Oil already uses the SKU X\./)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('See your products'));
    });
    expect(mockReplace).toHaveBeenCalledWith('/stock');
  });
});
