import type { PurchaseOrderStatus, StockTiles } from '@/types/retail';

/**
 * The stock and purchasing reports (`view_reports`), as `GET /api/venue/retail/reports/stock` and
 * `/reports/purchasing` return them (web `src/components/retail/stock/stock-types.ts` `StockReport`
 * and `src/lib/retail/purchasing.ts` `PurchasingReport`).
 */

export interface StockReport {
  from: string;
  to: string;
  /** The date asked for, or null. */
  as_of: string | null;
  /** Stock and its value at cost on `as_of`, or null without one. */
  as_of_stock: { date: string; units: number; value_cost_pence: number } | null;
  currency?: string;
  tiles: StockTiles | null;
  movements: { reason: string; units: number; value_pence: number; movements: number }[];
  dead: {
    count: number;
    items: {
      variant_id: string;
      product_name: string;
      option_name: string | null;
      on_hand: number;
      value_cost_pence: number;
      last_sold_at: string | null;
    }[];
  };
  sell_through: {
    count: number;
    items: { variant_id: string; product_name: string; option_name: string | null; sold: number; received: number }[];
  };
  variances: { id: string; number: number; name: string; committed_at: string; variance_value_pence: number | null; changed: number }[];
}

export interface PurchasingReport {
  from: string;
  to: string;
  open: {
    count: number;
    outstanding_value_pence: number;
    items: {
      id: string;
      number: number;
      status: PurchaseOrderStatus;
      supplier_name: string;
      supplier_id: string;
      sent_at: string | null;
      expected_on: string | null;
      total_cost_pence: number;
      outstanding_units: number;
      outstanding_value_pence: number;
      overdue: boolean;
    }[];
  };
  received: {
    units: number;
    value_pence: number;
    items: { supplier_id: string; supplier_name: string; orders: number; deliveries: number; units: number; value_pence: number }[];
  };
}
