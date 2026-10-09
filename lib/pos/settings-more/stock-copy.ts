import { fillText, type CopyVars } from './copy';

/**
 * Settings, Stock and the Track stock switch, word for word from the web: settings/checkout/copy.ts
 * (`feat.stock`, `feat.on.done`, `feat.off.*`) and components/retail/copy.ts (`set.stock.*`,
 * `feat.stock.on.*`), UX spec §9.11 and §9.16.
 */
export const STOCK_COPY = {
  'screen.title': 'Stock',
  'feat.stock': 'Track stock',
  'feat.stock.help':
    'Count how many of each product you have, take them off as you sell, get low-stock alerts and do stocktakes.',
  'feat.on.done': '{feature} is on.',
  'feat.off.done': '{feature} is off.',
  'feat.off.title': 'Turn off {feature}?',
  'feat.off.body': 'Nothing is deleted. If you turn it back on later, everything will be as you left it.',
  'feat.off.confirm': 'Turn off',
  'feat.stock.on.title': 'Start tracking stock?',
  'feat.stock.on.body':
    "Your products don't have stock counts yet. Choose where to start. A stocktake is the quickest way to get your counts right.",
  'feat.stock.on.all': 'Track all my products, starting at zero',
  'feat.stock.on.new': 'Only products I add from now on',
  'set.stock.title': 'Stock',
  'set.stock.negative': 'Let the till sell more than the stock count says',
  'set.stock.negative.help':
    'Useful when the product is on the shelf but the count is wrong. Online orders can never take more than you have.',
  'set.stock.digest': 'Email admins a daily list of low stock',
  'set.stock.digest.help': 'Sent each morning, only when something is low.',
  'set.stock.saved': 'Stock settings saved.',
  'set.stock.offNote': 'Turn on Track stock to choose how the till handles stock counts.', // (app)
  'common.cancel': 'Cancel',
} as const;

export type StockCopyId = keyof typeof STOCK_COPY;

export function stockT(id: StockCopyId, vars: CopyVars = {}): string {
  return fillText(STOCK_COPY[id], vars);
}
