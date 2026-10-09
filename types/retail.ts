/**
 * Products and stock shapes, as the web's `/api/venue/retail/*` routes return them (POS plan
 * Appendix E #26 to #30 on the web; mirrors `C:\Resneo\src\lib\retail\products.ts`,
 * `src\lib\retail\movements.ts` and `src\components\retail\stock\stock-types.ts`). Amounts are
 * integer pence; a cost is pence to four decimal places (the weighted average).
 *
 * Only venues with `feature_flags.resolved.pos_enabled` ever load these, and the stock routes
 * answer only while the venue's Track stock is on.
 */

export type NetUnit = 'ml' | 'l' | 'g' | 'kg' | 'item';
export type TaxCategory = 'standard' | 'reduced' | 'zero' | 'exempt';
export type ProductUsage = 'retail' | 'professional' | 'both';
export type Symbology = 'ean13' | 'upca' | 'code128';

export interface ProductPhoto {
  path: string;
  url: string;
}

/** One option of a product (web `VariantDto`). */
export interface RetailVariant {
  id: string;
  option_name: string | null;
  sku: string | null;
  price_pence: number;
  cost_pence: number | null;
  net_quantity: number | null;
  net_unit: NetUnit | null;
  track_stock: boolean;
  reorder_level: number | null;
  reorder_quantity: number | null;
  order_up_to_level: number | null;
  pack_size: number | null;
  sort_order: number;
  archived_at: string | null;
  on_hand: number;
  reserved: number;
  barcodes: { barcode: string; symbology: Symbology }[];
}

/** One product with every option (web `ProductDto`, `GET /api/venue/retail/products/[id]`). */
export interface RetailProduct {
  id: string;
  name: string;
  slug: string;
  brand_id: string | null;
  brand_name: string | null;
  category_id: string | null;
  category_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  description: string | null;
  photos: ProductPhoto[];
  usage: ProductUsage;
  sold_in_store: boolean;
  sold_online: boolean;
  hygiene_sealed: boolean;
  tax_category: TaxCategory | null;
  restriction: 'none' | 'age_18' | 'reportable' | 'not_for_sale';
  unit_price_basis: 'standard' | 'makeup';
  manufacturer_name: string | null;
  manufacturer_address: string | null;
  manufacturer_contact: string | null;
  archived_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  variants: RetailVariant[];
  /** False once it has been sold, counted, received or held: then it can only be archived. */
  can_delete: boolean;
}

export interface RetailProductResponse {
  product: RetailProduct;
  can_edit?: boolean;
  track_stock_enabled?: boolean;
}

/** One live option in a list (web `ListVariant`). */
export interface RetailListVariant {
  id: string;
  option_name: string | null;
  sku: string | null;
  price_pence: number;
  cost_pence: number | null;
  net_quantity: number | null;
  net_unit: NetUnit | null;
  track_stock: boolean;
  reorder_level: number | null;
  on_hand: number;
  reserved: number;
  barcodes: string[];
}

/** One row of the products list (web `ProductListItem`). */
export interface RetailListProduct {
  id: string;
  name: string;
  slug: string;
  brand_id: string | null;
  brand_name: string | null;
  category_id: string | null;
  category_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  usage: ProductUsage;
  sold_in_store: boolean;
  sold_online: boolean;
  hygiene_sealed: boolean;
  restriction: RetailProduct['restriction'];
  tax_category: TaxCategory | null;
  unit_price_basis: RetailProduct['unit_price_basis'];
  main_photo_url: string | null;
  archived_at: string | null;
  version: number;
  variants: RetailListVariant[];
}

/** `GET /api/venue/retail/products` (#26). */
export interface RetailProductSearch {
  total: number;
  items: RetailListProduct[];
  can_edit?: boolean;
  can_import?: boolean;
  track_stock_enabled?: boolean;
}

/** A brand or category (`GET /api/venue/retail/{brands|categories|suppliers}`). */
export interface RetailNamedItem {
  id: string;
  name: string;
}

/** One counted option (web `StockLevelRow`, `GET /api/venue/retail/stock`). */
export interface StockLevelRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  option_name: string | null;
  sku: string | null;
  price_pence: number;
  cost_pence: number | null;
  reorder_level: number | null;
  reorder_quantity: number | null;
  brand_name: string | null;
  supplier_name: string | null;
  on_hand: number;
  reserved: number;
  available: number;
}

export interface StockTiles {
  value_cost_pence: number;
  value_retail_pence: number;
  units: number;
  low: number;
  out: number;
  negative: number;
  tracked: number;
}

export interface StockLevelsResponse {
  total: number;
  items: StockLevelRow[];
  tiles: StockTiles | null;
  can_adjust: boolean;
}

export type StockFilter = 'all' | 'low' | 'out' | 'negative';

export type MovementReason =
  | 'opening'
  | 'receive'
  | 'sale'
  | 'refund_restock'
  | 'adjustment'
  | 'stocktake'
  | 'wastage'
  | 'damaged'
  | 'expired'
  | 'theft'
  | 'professional_use'
  | 'professional_use_reversal'
  | 'transfer_out'
  | 'transfer_in'
  | 'import';

/** One stock change (web `MovementDto`). */
export interface StockMovement {
  id: string;
  variant_id: string;
  product_id: string;
  product_name: string | null;
  option_name: string | null;
  delta: number;
  reason: MovementReason;
  on_hand_after: number;
  unit_cost_pence: number | null;
  value_pence: number | null;
  sale_id: string | null;
  sale_number: number | null;
  return_id: string | null;
  stocktake_id: string | null;
  stocktake_number: number | null;
  booking_id: string | null;
  purchase_order_id: string | null;
  purchase_order_number: number | null;
  note: string | null;
  staff_name: string | null;
  occurred_at: string;
  business_date: string;
}

export interface StockMovementsResponse {
  total: number;
  items: StockMovement[];
}

/** `adj.*` (UX spec §6.9). */
export type AdjustmentReason = 'adjustment' | 'wastage' | 'damaged' | 'expired' | 'theft';

export type StocktakeStatus = 'counting' | 'review' | 'committed' | 'cancelled';

export interface StocktakeScope {
  type: 'full' | 'partial';
  category_ids?: string[];
  brand_ids?: string[];
  supplier_ids?: string[];
}

export interface StocktakeRow {
  id: string;
  number: number;
  name: string;
  scope: StocktakeScope | null;
  status: StocktakeStatus;
  started_by_name: string | null;
  started_at: string;
  committed_by_name: string | null;
  committed_at: string | null;
  cancelled_at: string | null;
  variance_value_pence: number | null;
  zero_uncounted: boolean;
  version: number;
}

export interface StocktakesResponse {
  total: number;
  stocktakes: StocktakeRow[];
  can_count: boolean;
  can_commit: boolean;
}

export interface StocktakeLine {
  variant_id: string;
  product_id: string;
  product_name: string;
  option_name: string | null;
  sku: string | null;
  barcodes: string[];
  in_scope: boolean;
  expected_at_start: number;
  counted: number | null;
  counted_at: string | null;
  last_counted_by_name: string | null;
  moved_since: number;
  on_hand_now: number;
  reserved: number;
  tracked: boolean;
  change: number | null;
  value_pence: number | null;
  zeroed: boolean | null;
  flagged_for_review: boolean | null;
}

/** `GET /api/venue/retail/stocktakes/[id]`. */
export interface StocktakeDetail {
  stocktake: StocktakeRow;
  lines: StocktakeLine[];
  counters: string[];
  uncounted_held: number;
  can_count: boolean;
  can_commit: boolean;
}

/** `POST .../counts`: the line's count after this event. */
export interface StocktakeCountResult {
  variant_id: string;
  counted: number | null;
  counted_at: string | null;
  replayed?: boolean;
}
