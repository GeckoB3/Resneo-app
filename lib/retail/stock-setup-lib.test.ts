/**
 * The pure parts of the products and stock set-up screens (2026-10-09 parity with the web): the
 * copy (no em-dash, no country singled out, the singular), the bulk price change and its preview,
 * the import's CSV reading, guesses, template and body, the unit price, the supplier form and the
 * report dates.
 */
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));

import { applyPriceChange, bulkPreview, bulkPriceBody, filterCount, hasFilters, EMPTY_FILTERS, percentToBps } from '@/lib/retail/product-list';
import {
  guessImportColumns,
  importBody,
  importFields,
  importTemplateCsv,
  looksLikeCsv,
  parseCsvRecords,
  readCsvHeaders,
  rowsNotSaved,
  type ImportResult,
} from '@/lib/retail/product-import';
import { minusDays, todayInZone } from '@/lib/retail/report-dates';
import { STOCK_SETUP_COPY, singular, stockCopyFor } from '@/lib/retail/stock-setup-copy';
import { stockSetupPaths } from '@/lib/retail/stock-setup-paths';
import { supplierBody } from '@/lib/retail/supplier-form';
import { asJurisdiction, formatUnitPrice, unitPrice } from '@/lib/retail/unit-price';
import type { RetailListProduct } from '@/types/retail';

const t = stockCopyFor('client');
const money = (p: number) => `£${(p / 100).toFixed(2)}`;

describe('the copy', () => {
  it('has no em-dash and names no one country', () => {
    for (const [id, text] of Object.entries(STOCK_SETUP_COPY)) {
      expect({ id, dash: text.includes('—') }).toEqual({ id, dash: false });
      expect({ id, region: /Northern Ireland|Great Britain|\bNI\b|\bGB\b/.test(text) }).toEqual({ id, region: false });
    }
  });

  it('fills placeholders and says one in the singular', () => {
    expect(t('bulk.price.title', { count: 1 })).toBe('Change prices for 1 product');
    expect(t('bulk.price.title', { count: 3 })).toBe('Change prices for 3 products');
    expect(singular('1 prices will change.')).toBe('1 price will change.');
    expect(t('sup.archive.title', { supplier: 'Wella' })).toBe('Archive Wella?');
    // The till's deck still answers for its own ids.
    expect(t('prod.title')).toBe('Products');
  });
});

function product(over: Partial<RetailListProduct> = {}): RetailListProduct {
  return {
    id: 'p1',
    name: 'Shampoo',
    slug: 'shampoo',
    brand_id: null,
    brand_name: null,
    category_id: null,
    category_name: null,
    supplier_id: null,
    supplier_name: null,
    usage: 'retail',
    sold_in_store: true,
    sold_online: true,
    hygiene_sealed: false,
    restriction: 'none',
    tax_category: null,
    unit_price_basis: 'standard',
    main_photo_url: null,
    archived_at: null,
    version: 1,
    variants: [
      {
        id: 'v1',
        option_name: '250 ml',
        sku: null,
        price_pence: 1000,
        cost_pence: null,
        net_quantity: null,
        net_unit: null,
        track_stock: true,
        reorder_level: null,
        on_hand: 3,
        reserved: 0,
        barcodes: [],
      },
    ],
    ...over,
  };
}

describe('the products list', () => {
  it('counts filters, with the supplier and low ones only while Track stock is on', () => {
    expect(hasFilters(EMPTY_FILTERS)).toBe(false);
    const f = { ...EMPTY_FILTERS, supplier_id: 's1', low: true, online: true };
    expect(filterCount(f, true)).toBe(3);
    expect(filterCount(f, false)).toBe(1);
    expect(stockSetupPaths.productList(f, 50, false)).toBe('/api/venue/retail/products?online=1&limit=50&offset=50');
    expect(stockSetupPaths.productList({ ...f, q: ' oil ', archived: true }, 0, true)).toBe(
      '/api/venue/retail/products?q=oil&supplier_id=s1&online=1&low=1&archived=archived&limit=50&offset=0',
    );
  });

  it('builds the bulk price body the server takes, and previews it', () => {
    expect(percentToBps('10')).toBe(1000);
    expect(percentToBps('12.5%')).toBe(1250);
    expect(percentToBps('0')).toBeNull();
    const body = bulkPriceBody(['p1'], { which: 'retail', mode: 'increase', kind: 'percent', value: '10' });
    expect(body).toEqual({ op: 'price', product_ids: ['p1'], which: 'retail', mode: 'increase', percent_bps: 1000 });
    expect(applyPriceChange(1000, body!)).toBe(1100);
    expect(bulkPreview([product()], body, money, t)).toBe('1 price will change. For example, Shampoo 250 ml from £10.00 to £11.00.');
    const set = bulkPriceBody(['p1'], { which: 'cost', mode: 'set', kind: 'percent', value: '4.50' });
    expect(set).toMatchObject({ mode: 'set', amount_pence: 450 });
    const costUp = bulkPriceBody(['p1'], { which: 'cost', mode: 'increase', kind: 'amount', value: '1' });
    expect(bulkPreview([product()], costUp, money, t)).toBe('None of these products has a cost yet, so nothing will change.');
    expect(bulkPriceBody(['p1'], { which: 'retail', mode: 'decrease', kind: 'amount', value: 'abc' })).toBeNull();
  });
});

describe('the product import', () => {
  it('reads quoted CSV cells, skips blank rows and counts the data rows', () => {
    const text = '﻿Name,"Price, retail",Notes\r\n"Oil ""Gold""",12.50,"two\nlines"\r\n,,\r\nWax,5,\r\n';
    expect(parseCsvRecords(text)).toEqual([
      ['Name', 'Price, retail', 'Notes'],
      ['Oil "Gold"', '12.50', 'two\nlines'],
      ['Wax', '5', ''],
    ]);
    expect(readCsvHeaders(text)).toEqual({ headers: ['Name', 'Price, retail', 'Notes'], rows: 2 });
    expect(readCsvHeaders('Name,Price\n')).toEqual({ headers: ['Name', 'Price'], rows: 0 });
  });

  it('guesses columns, leaves the stock ones out with Track stock off, and sends only matched fields', () => {
    const headers = ['Product Name', 'RRP', 'EAN', 'Qty', 'Supplier'];
    expect(guessImportColumns(headers, true)).toEqual({ name: 'Product Name', price: 'RRP', barcode: 'EAN', stock_on_hand: 'Qty', supplier: 'Supplier' });
    expect(guessImportColumns(headers, false)).not.toHaveProperty('stock_on_hand');
    expect(importFields(false)).not.toContain('reorder_level');
    expect(importBody('csv', { name: 'A', price: 'B', stock_on_hand: 'C', sku: '' }, false, true)).toEqual({
      csv: 'csv',
      dry_run: true,
      columns: { name: 'A', price: 'B' },
    });
    expect(looksLikeCsv('list.CSV', null)).toBe(true);
    expect(looksLikeCsv('list.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(false);
  });

  it('writes the template with a valid example barcode', () => {
    const csv = importTemplateCsv(false);
    expect(csv.split('\r\n')[0]).toBe('Name,Brand,Category,Option,SKU,Barcode,Price,Cost,Supplier,Description');
    expect(csv).toContain('5012345678900');
  });

  it('lists the rows the check passed that the save refused', () => {
    const checked: ImportResult = {
      rows: [
        { row: 2, status: 'new', problem: null, name: 'Oil', option_name: null, sku: null },
        { row: 3, status: 'error', problem: 'Price: enter a price.', name: 'Wax', option_name: null, sku: null },
      ],
      summary: { new: 1, skipped: 0, problems: 1 },
      imported: 0,
      dry_run: true,
    };
    const result: ImportResult = { ...checked, rows: [{ ...checked.rows[0]!, status: 'error', problem: 'Oil already uses the SKU X.' }, checked.rows[1]!], dry_run: false };
    expect(rowsNotSaved(checked, result).map((r) => r.row)).toEqual([2]);
  });
});

describe('unit prices', () => {
  it('works per litre, or per 100 ml and per 10 ml for make-up where the rules ask', () => {
    expect(formatUnitPrice(unitPrice(1450, 250, 'ml', 'gb')!, money)).toBe('£58.00 per litre');
    expect(formatUnitPrice(unitPrice(1450, 250, 'ml', 'ni')!, money)).toBe('£5.80 per 100 ml');
    expect(formatUnitPrice(unitPrice(1450, 50, 'g', 'ni', 'makeup')!, money)).toBe('£2.90 per 10 g');
    expect(unitPrice(1450, 3, 'item', 'gb')).toBeNull();
    expect(asJurisdiction('ie')).toBe('ie');
    expect(asJurisdiction(null)).toBe('gb');
  });
});

describe('the supplier form', () => {
  const words = { nameRequired: 'name', minOrderInvalid: 'min', leadTimeInvalid: 'lead' };
  const blank = { name: '', contact_name: '', email: '', phone: '', account_number: '', lead_time_days: '', min_order: '', notes: '' };
  it('asks for a name and checks the delivery time and minimum', () => {
    expect(supplierBody(blank, words).errors).toEqual({ name: 'name' });
    expect(supplierBody({ ...blank, name: 'W', lead_time_days: '400', min_order: 'x' }, words).errors).toEqual({ lead_time_days: 'lead', min_order: 'min' });
    expect(supplierBody({ ...blank, name: ' Wella ', lead_time_days: '3', min_order: '100', email: ' a@b.test ' }, words).body).toEqual({
      name: 'Wella',
      contact_name: null,
      email: 'a@b.test',
      phone: null,
      account_number: null,
      lead_time_days: 3,
      min_order_pence: 10000,
      notes: null,
    });
  });
});

describe('report dates', () => {
  it("works out today on the venue's clock and the default period", () => {
    expect(todayInZone('Europe/London', new Date('2026-10-09T23:30:00Z'))).toBe('2026-10-10');
    expect(minusDays('2026-10-10', 29)).toBe('2026-09-11');
  });
});
