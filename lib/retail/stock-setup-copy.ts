import { useMemo } from 'react';

import { capitalise, fillCopy, POS_COPY, type CopyVars, type PosCopyId } from '@/lib/pos/copy';
import { useVenueContext } from '@/providers/VenueProvider';

/**
 * The words the products and stock set-up screens need that `lib/pos/copy.ts` does not carry
 * (suppliers, the product import, bulk changes, the editor's extra fields, the Movements,
 * Professional use and Reports tabs). Each id and sentence is copied word for word from the web:
 * `src/components/retail/copy.ts`, `src/components/retail/products/products-copy.ts`,
 * `src/components/retail/stock/stock-copy.ts` and `purchasing-copy.ts`. The app's own words, where
 * the web has none, follow under `ss.*` and are marked (added).
 *
 * Rules `stock-setup-copy.test.ts` enforces: no em-dash anywhere, no wording that singles out one
 * country, and every placeholder a caller can fill.
 */
export const STOCK_SETUP_COPY = {
  // Products list (web copy.ts §18.19, products-copy.ts).
  'prod.subtitle': 'What you sell, and what you use in treatments.',
  'prod.import': 'Import',
  'prod.export': 'Export CSV',
  'prod.filter.category': 'Category',
  'prod.filter.brand': 'Brand',
  'prod.filter.supplier': 'Supplier',
  'prod.filter.use': 'Use',
  'prod.filter.online': 'Sold online',
  'prod.filter.button': 'Filters',
  'prod.select': 'Select',
  'prod.bulk.selected': '{count} selected',
  'prod.bulk.price': 'Change prices',
  'prod.bulk.category': 'Change category',
  'prod.bulk.archive': 'Archive',
  'x.all': 'All',
  'x.more': 'More',
  'x.close': 'Close',
  'x.back': 'Back',
  'x.products': 'Products',
  'x.selectRow': 'Select {product}',
  'x.selectDone': 'Done',
  'x.clearSelection': 'Clear',
  'x.howChange': 'How to change it',
  'x.percentOrAmount': 'Percent or amount',
  'x.percent': 'Percent',
  'x.amount': 'Amount',
  'x.changeBy': 'By how much',
  'x.newPrice': 'New price',
  'x.example': '{product} from {from} to {to}',
  'x.bulk.priceDone': 'Prices changed.',
  'x.bulk.categoryDone': 'Products moved.',
  'x.bulk.archiveDone': 'Products archived.',
  'x.bulk.unarchiveDone': 'Products unarchived.',
  'x.bulk.noPrices': 'None of these products has a cost yet, so nothing will change.',
  'x.applyFilters': 'Show products',
  'x.page': 'Showing {from} to {to} of {total}',
  'bulk.price.title': 'Change prices for {count} products',
  'bulk.price.which': 'Which price',
  'bulk.price.retail': 'Selling price',
  'bulk.price.cost': 'Cost',
  'bulk.price.increase': 'Increase by',
  'bulk.price.decrease': 'Decrease by',
  'bulk.price.set': 'Set to',
  'bulk.price.preview': '{count} prices will change. For example, {example}.',
  'bulk.price.confirm': 'Change prices',
  'bulk.category.title': 'Move {count} products to a category',
  'bulk.category.confirm': 'Move products',
  'bulk.archive.title': 'Archive {count} products?',
  'bulk.archive.body': 'They disappear from the till and your shop, and stay in your records. You can unarchive them at any time.',

  // The product import (web copy.ts §6.5, products-copy.ts).
  'import.step': 'Step {n} of 4',
  'import.title': 'Import products',
  'import.body': 'Upload a CSV file, then tell us which column holds what. You can start from our template.',
  'import.template': 'Download our template',
  'import.error.type': "That isn't a CSV file. Save your spreadsheet as CSV and try again.",
  'import.error.size': 'That file is over 5 MB. Split it into smaller files.',
  'import.error.empty': 'That file has no rows to import.',
  'import.skipColumn': "Don't import",
  'import.required': 'Required',
  'import.row.new': 'New product',
  'import.row.exists': 'Already in your products, so skipped',
  'import.summary': '{new} new products, {skipped} skipped, {problems} with problems',
  'import.filter.problems': 'Show problems only',
  'import.commit': 'Import {count} products',
  'import.progress': 'Importing {done} of {count}…',
  'import.done': 'Imported {count} products and their opening stock.',
  'import.viewProducts': 'See your products',
  'x.notAllowed': 'You need permission to import products. An admin can give it to you in Settings.',
  'x.import.next': 'Check the file',
  'x.import.field': 'ResNeo field',
  'x.import.column': 'Column in your file',
  'x.import.row': 'Row {row}',
  'x.import.again': 'Import another file',
  'x.import.choose': 'Choose a file',
  'x.import.nothing': 'There is nothing new to import in this file.',
  'x.import.notSaved': "These rows couldn't be saved. Fix them in your file, then import it again.",

  // The product editor's other fields (web copy.ts, products-copy.ts).
  'prod.f.brand.add': 'Add "{name}" as a new brand',
  'prod.f.category.add': 'Add "{name}" as a new category',
  'prod.f.description.help': "Shown in your online shop. Keep it to the useful facts: what it does and who it's for.",
  'prod.f.hygiene': 'Sealed for hygiene reasons',
  'prod.f.hygiene.help':
    "For sealed things like cosmetics. Once a customer opens one, they can only return it if it's faulty, and your returns information says so.",
  'prod.f.makeUp': 'This is make-up',
  'prod.f.makeUp.help': 'Make-up shows its price per 10 ml or 10 g, and other cosmetics per 100 ml or 100 g.',
  'prod.safety.manufacturer': 'Manufacturer',
  'prod.safety.manufacturerAddress': "Manufacturer's postal address",
  'prod.safety.manufacturerContact': "Manufacturer's email address or website",
  'prod.f.supplier': 'Supplier',
  'prod.f.supplier.add': 'Add a supplier',
  'prod.f.soldOnline.flagged': "Products marked Not sold online or Age restricted can't be sold in your online shop.",
  'prod.maker.title': 'Manufacturer details (optional)',
  'prod.maker.help': "Shown on the product's page in your online shop.",
  'prod.maker.ni': 'EU product safety rules expect these details on products you sell online.',
  'x.photoAlt': 'Photo of {product}',
  'x.supplier': 'Supplier',
  'x.noSupplier': 'No supplier',
  'x.option.archived': 'Archived',
  'x.option.restore': 'Keep option',
  'x.size.invalid': 'Enter the size as a number above zero.',
  'x.size.unit': 'Choose the unit for the size.',
  'x.promptFailed': "We couldn't turn on Track stock. Please try again.",
  'var.netQty': 'Size',
  'var.netUnit': 'Unit',
  'var.unit.ml': 'ml',
  'var.unit.l': 'litres',
  'var.unit.g': 'g',
  'var.unit.kg': 'kg',
  'var.unit.item': 'items',
  'var.netQty.help':
    'How much is in it, like 250 ml. We use it to show the unit price, like the price per litre, in the units used where your business is.',
  'var.unitPrice.preview': 'Shows as {unitPrice}',
  'var.orderUpTo': 'Order up to',
  'var.orderUpTo.help': 'Instead of a fixed quantity, suggested orders top stock back up to this level.',
  'var.packSize': 'Pack size',
  'var.packSize.help': 'Suggested orders round up to whole packs.',
  'feat.stock.prompt.title': 'Want ResNeo to count your stock?',
  'feat.stock.prompt.body': "We can keep count of how many you have, take them off as you sell, and tell you when you're running low.",
  'feat.stock.prompt.yes': 'Yes, count my stock',
  'feat.stock.prompt.no': 'Not now',

  // The Stock tabs (web copy.ts §18.20, stock-copy.ts, purchasing-copy.ts).
  'stock.tab.orders': 'Purchase orders',
  'stock.tab.suppliers': 'Suppliers',
  'stock.tab.use': 'Professional use',
  'stock.tab.reports': 'Reports',
  'stock.tile.valueRetail': 'At selling price',
  'stock.col.product': 'Product',
  'stock.suggestOrder': 'Suggest an order',
  'stock.suggestOrder.from': 'Suggest an order from {supplier}',
  'mov.filter.product': 'Product',
  'mov.filter.reason': 'Reason',
  'mov.filter.dates': 'Dates',
  'mov.delta': '{signedCount}',
  'mov.export': 'Export CSV',
  'mov.col.time': 'When',
  'mov.col.change': 'Change',
  'mov.col.value': 'Value at cost',
  'mov.col.ref': 'Reference',
  'mov.col.who': 'Who',
  'mov.filter.allReasons': 'All reasons',
  'mov.filter.from': 'From',
  'mov.filter.to': 'To',
  'mov.filter.productSearch': 'Search for a product',
  'mov.filter.clear': 'Clear filters',
  'mov.filter.showing': 'Showing {product}',
  'use.recent': 'Recently used',
  'use.recent.empty': 'Nothing recorded yet.',
  'use.recent.error': "We couldn't load what was used.",
  'take.col.scope': 'What it counts',
  'take.col.difference': 'Difference at cost',
  'po.download': 'Download PDF',
  'po.new.choose': 'Choose a supplier',
  'po.new.noSuppliers': 'Add a supplier first, on the Suppliers tab.',
  'po.supplier.required': 'Choose a supplier.',
  'po.col.product': 'Product',
  'po.col.ordered': 'Ordered',
  'po.col.received': 'Received',
  'po.col.inStock': 'In stock',

  // Suppliers (web copy.ts §18.20, purchasing-copy.ts).
  'sup.add': 'Add supplier',
  'sup.f.name': 'Name',
  'sup.f.leadTime': 'Delivery time in days',
  'sup.f.notes': 'Notes',
  'sup.archive': 'Archive supplier',
  'sup.archive.title': 'Archive {supplier}?',
  'sup.archive.body': 'They disappear from your lists, and their orders stay in your records.',
  'sup.col.name': 'Name',
  'sup.col.contact': 'Contact',
  'sup.col.email': 'Email',
  'sup.col.open': 'Open orders',
  'sup.edit': 'Edit',
  'sup.edit.title': 'Edit supplier',
  'sup.add.title': 'Add supplier',
  'sup.saved': 'Supplier saved.',
  'sup.archived': 'Supplier archived.',
  'sup.readOnly': 'An admin can let you add and edit suppliers.',
  'sup.name.required': 'Give the supplier a name.',
  'sup.minOrder.invalid': 'Enter an amount like 100 or 100.00.',
  'sup.leadTime.invalid': 'Enter a whole number of days, from 0 to 365.',

  // Stock reports (web copy.ts §6.16, stock-copy.ts, purchasing-copy.ts).
  'srep.onHand': 'Stock on hand and value',
  'srep.asAt': 'Value on',
  'srep.movements': 'Stock changes',
  'srep.dead': 'Not sold in 90 days',
  'srep.sellThrough': 'Sell-through',
  'srep.variances': 'Stocktake differences',
  'srep.poOpen': 'Open purchase orders',
  'srep.received': 'Received by supplier',
  'srep.export': 'Export CSV',
  'srep.empty': 'Nothing to show for this period.',
  'srep.period': 'Period',
  'srep.from': 'From',
  'srep.to': 'To',
  'srep.units': 'Units in stock',
  'srep.col.reason': 'Reason',
  'srep.col.units': 'Units',
  'srep.col.value': 'Value at cost',
  'srep.col.inStock': 'In stock',
  'srep.col.lastSold': 'Last sold',
  'srep.col.sold': 'Sold',
  'srep.col.received': 'Received',
  'srep.col.changed': 'Options changed',
  'srep.col.finished': 'Finished',
  'srep.never': 'Never',
  'srep.error': "We couldn't load your stock reports.",
  'srep.col.order': 'Order',
  'srep.col.supplier': 'Supplier',
  'srep.col.expected': 'Expected',
  'srep.col.toCome': 'Still to come',
  'srep.col.toComeValue': 'Value to come',
  'srep.col.orders': 'Orders',
  'srep.col.deliveries': 'Deliveries',
  'srep.overdue': 'Overdue',

  // The app's own words, where the web has none.
  'ss.fileFailed': "We couldn't get that file. Check your connection and try again.", // (added) a CSV or PDF download
  'ss.anyDate': 'Any date', // (added) a date filter not set
  'ss.clearDate': 'Clear', // (added) clears one date filter
  'ss.setDate': 'Choose a date', // (added) sets a date filter
  'ss.templateFailed': "We couldn't share the template. Please try again.", // (added)
  'ss.import.readFailed': "We couldn't read that file. Please try again.", // (added)
  'ss.import.file': 'File: {name}', // (added) the file chosen for the import
  'ss.import.headers': 'Match each ResNeo field to a column in your file.', // (added)
  'ss.option.n.archived': '{name} (Archived)', // (added) an option archived in this save
  'ss.addNamed': 'Add a new one', // (added) the brand or category picker's add field
  'ss.addNamed.label': 'New name', // (added)
  'ss.supplier.details': 'Contact details', // (added) the supplier sheet's second group
  'ss.selected.none': 'Tap products to select them.', // (added) select mode with nothing chosen
} as const;

export type StockSetupOwnId = keyof typeof STOCK_SETUP_COPY;
export type StockCopyId = PosCopyId | StockSetupOwnId;
export type StockT = (id: StockCopyId, vars?: CopyVars) => string;

/**
 * The deck shows the plural form and says the helper picks the singular (web `products-copy.ts`
 * `singular`): "1 products" becomes "1 product", "1 prices will change" becomes "1 price will change".
 */
export function singular(text: string): string {
  return text.replace(/(^|[^\d.,])1 (product|price|option)s\b/g, '$11 $2');
}

/** One string, from this file or the till's deck, filled. */
export function stockCopy(id: StockCopyId, vars: CopyVars = {}): string {
  const own = (STOCK_SETUP_COPY as Record<string, string>)[id];
  const template = own ?? (POS_COPY as Record<string, string>)[id] ?? id;
  return singular(fillCopy(template, vars));
}

/** A copy function with the venue's client word filled in (`{client}`, `{Client}`). */
export function stockCopyFor(clientWord: string): StockT {
  const lower = (clientWord || 'client').toLowerCase();
  return (id, vars = {}) => stockCopy(id, { client: lower, Client: capitalise(lower), ...vars });
}

export function useStockT(): StockT {
  const { terminology } = useVenueContext();
  return useMemo(() => stockCopyFor(terminology.client), [terminology.client]);
}
