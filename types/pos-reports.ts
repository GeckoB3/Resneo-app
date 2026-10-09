import type { PosReportPreset, SalesPersonRow, TakingsAmounts } from '@/types/pos';

/**
 * Reports' POS tabs as the web routes return them (the full payloads; `types/pos.ts` keeps the
 * smaller shapes app step 1 read). Field for field with the web's own types:
 * src/lib/reports/pos-reports.ts, src/lib/reports/sales-products.ts,
 * src/lib/pos/commission/report.ts and the voucher routes.
 */

export type ReportGrain = 'day' | 'week' | 'month';

/** A preset, or dates chosen by hand (web `PosRangeChoice`). */
export type PosRangeChoice = { kind: 'preset'; preset: PosReportPreset } | { kind: 'custom'; from: string; to: string };

// ─── Takings (GET /api/venue/reports/takings) ─────────────────────────────────

export interface VatReport {
  from: string;
  to: string;
  by_rate: {
    tax_code: string;
    tax_rate_bps: number;
    sales_pence: number;
    sales_vat_pence: number;
    refunds_pence: number;
    refunds_vat_pence: number;
    net_pence: number;
    net_vat_pence: number;
    net_ex_vat_pence: number;
  }[];
  totals: {
    sales_pence: number;
    sales_vat_pence: number;
    refunds_pence: number;
    refunds_vat_pence: number;
    net_pence: number;
    net_vat_pence: number;
  };
  deposits_and_fees: {
    deposits_taken_pence: number;
    deposits_refunded_pence: number;
    fees_charged_pence: number;
    fees_refunded_pence: number;
    deposits_kept_on_cancellation_pence: number;
  };
}

export interface TipsRecipientRow {
  calendar_id: string | null;
  staff_id: string | null;
  name: string;
  allocation_kind: string;
  net_pence: number;
  paid_pence: number;
  due_pence: number;
}

export interface TipsSummaryFull {
  totals: { allocated_pence: number; reversed_pence: number; net_pence: number; paid_pence: number; due_pence: number };
  by_recipient: TipsRecipientRow[];
}

export interface TakingsDispute {
  id: string;
  status: string;
  reason: string | null;
  amount_pence: number;
  evidence_due_by: string | null;
  opened_at: string;
  movement_pence: number;
}

export interface TakingsPayload {
  from: string;
  to: string;
  grain: ReportGrain;
  today: string;
  currency: string;
  currency_symbol: string;
  totals: TakingsAmounts & { net_with_tips_pence: number; row_count: number };
  by_method: (TakingsAmounts & { method: string; external_type_name: string | null; row_count: number })[];
  by_source: (TakingsAmounts & { source: string; row_count: number })[];
  by_period: (TakingsAmounts & { period_start: string; period_end: string })[];
  by_person: {
    staff_id: string | null;
    name: string | null;
    payments_pence: number;
    refunds_pence: number;
    tips_pence: number;
    net_pence: number;
  }[];
  refunds: { source_type: string; reason: string; refund_count: number; amount_pence: number; tip_pence: number }[];
  disputes: TakingsDispute[];
  estimated: { first_exact_date: string | null; estimated_rows: number; note: string | null };
  vat: VatReport;
  tips: TipsSummaryFull;
  can_export: boolean;
}

// ─── Cash-ups (GET /api/venue/reports/cash-ups) ───────────────────────────────

export interface CashUpRow {
  id: string;
  till_name: string;
  business_date: string;
  closed_by_name: string | null;
  opening_float_pence: number;
  expected_cash_pence?: number;
  counted_cash_pence: number;
  variance_pence: number;
  variance_reason: string | null;
}

export interface CashUpsPayload {
  currency: string;
  can_see_expected: boolean;
  sessions: CashUpRow[];
  totals: { sessions: number; variance_pence: number; over_pence: number; short_pence: number };
  outside: {
    total_pence: number;
    count: number;
    rows: { id: string; business_date: string; amount_pence: number; handled_by_name: string | null }[];
  };
}

// ─── Sales (GET /api/venue/reports/sales) ─────────────────────────────────────

export interface SalesAmounts {
  quantity: number;
  gross_pence: number;
  discount_pence: number;
  sales_pence: number;
  tax_pence: number;
  refunds_pence: number;
}

export interface SalesProductFigures {
  quantity: number;
  discount_pence: number;
  sales_pence: number;
  tax_pence: number;
  refunds_pence: number;
  revenue_ex_vat_pence: number;
  costed_revenue_ex_vat_pence: number;
  cost_of_goods_pence: number;
  margin_pence: number;
  margin_bps: number | null;
  units_restocked: number;
  lines_without_cost: number;
}

export interface SalesProductsReport {
  totals: SalesProductFigures;
  by_product: (SalesProductFigures & { key: string; product_id: string | null; name: string; brand_name: string | null })[];
  by_brand: (SalesProductFigures & { brand_id: string | null; name: string | null })[];
  by_category: (SalesProductFigures & { category_id: string | null; name: string | null })[];
  stock: {
    value_cost_pence: number;
    value_retail_pence: number;
    units: number;
    tracked: number;
    dead_count: number;
    dead: {
      variant_id: string;
      product_name: string;
      option_name: string | null;
      on_hand: number;
      value_cost_pence: number;
      last_sold_at: string | null;
    }[];
    sell_through_count: number;
    sell_through: { variant_id: string; product_name: string; option_name: string | null; sold: number; received: number }[];
  };
}

export interface SalesPayload {
  from: string;
  to: string;
  grain: ReportGrain;
  today: string;
  currency: string;
  currency_symbol: string;
  can_export: boolean;
  totals: {
    sales_count: number;
    visit_count: number;
    gross_pence: number;
    discount_pence: number;
    sales_pence: number;
    tax_pence: number;
    services_pence: number;
    retail_pence: number;
    applied_pence: number;
    refunds_pence: number;
    refund_tax_pence?: number;
    refund_count: number;
    net_after_refunds_pence: number;
    average_sale_pence: number;
    retail_per_visit_pence: number;
  };
  by_period: {
    period_start: string;
    period_end: string;
    sales_count: number;
    sales_pence: number;
    discount_pence: number;
    refunds_pence: number;
  }[];
  by_reporting_group: (SalesAmounts & { key: string })[];
  by_line_type: (SalesAmounts & { key: string })[];
  by_service: (SalesAmounts & { key: string; service_item_id: string | null; name: string; line_type: string })[];
  by_category: { category_id: string | null; name: string | null; quantity: number; sales_pence: number; tax_pence: number; refunds_pence: number }[];
  by_performer: SalesPersonRow[];
  by_seller: SalesPersonRow[];
  discounts_by_reason: { reason: string; discount_count: number; amount_pence: number }[];
  discounts_by_person: { staff_id: string | null; name: string | null; discount_count: number; amount_pence: number }[];
  /** Pass 4: the product sections, absent from older servers. */
  products?: SalesProductsReport;
}

// ─── Commission (GET /api/venue/pos/commission/report) ────────────────────────

export interface CommissionPersonRow {
  person_key: string;
  calendar_id: string | null;
  staff_id: string | null;
  person_name: string;
  service_base_pence: number;
  service_commission_pence: number;
  product_base_pence: number;
  product_commission_pence: number;
  voucher_base_pence: number;
  voucher_commission_pence: number;
  total_commission_pence: number;
  tips_pence: number;
  sales_pence: number;
}

export interface CommissionLineRow {
  row_kind: 'sale' | 'refund';
  business_date: string;
  sale_id: string;
  sale_number: number;
  refund_id: string | null;
  line_id: string;
  item_type: 'service' | 'product' | 'voucher';
  item_name: string;
  person_key: string;
  person_name: string;
  share_bps: number;
  base_pence: number;
  rate_bps: number;
  commission_pence: number;
}

export interface CommissionReport {
  from: string;
  to: string;
  rows: CommissionPersonRow[];
  totals: Omit<CommissionPersonRow, 'person_key' | 'calendar_id' | 'staff_id' | 'person_name'>;
  lines: CommissionLineRow[] | null;
  changed: { exported_at: string; persons: string[]; lines: string[] } | null;
  has_rates: boolean;
  currency: string;
  receipt_prefix: string | null;
  can_export: boolean;
}

// ─── Vouchers (GET /api/venue/pos/vouchers/report, /vouchers/[id]) ────────────

export interface VoucherReportPayload {
  report: {
    from: string;
    to: string;
    as_at: string;
    vouchers: Record<string, number | string>;
    credit: Record<string, number | string>;
  };
  currency: string;
}

export interface VoucherListRow {
  id: string;
  code_last4: string | null;
  source: string;
  status: string;
  initial_pence: number;
  balance_pence: number;
  issued_at: string | null;
  expires_at: string | null;
  buyer_name: string | null;
  recipient_name: string | null;
}

export interface VoucherListPage {
  vouchers: VoucherListRow[];
  total: number;
  offset: number;
  limit: number;
  currency?: string;
}

export interface VoucherMovement {
  id: string;
  kind: string;
  delta_pence: number;
  sale_id: string | null;
  sale_number: number | null;
  staff_name: string | null;
  reason: string | null;
  business_date: string;
  created_at: string;
}

/** The voucher sheet, as GET and PATCH /api/venue/pos/vouchers/[id] return it. */
export interface VoucherDetail {
  account: {
    id: string;
    kind: 'voucher' | 'credit';
    code_last4: string | null;
    status: string;
    balance_pence: number;
    initial_pence: number;
    currency: string;
    source: string;
    guest_id: string | null;
    issued_at: string;
    expires_at: string | null;
    sale_id: string | null;
    buyer_name: string | null;
    buyer_email: string | null;
    recipient_name: string | null;
    recipient_email: string | null;
    message: string | null;
    send_at: string | null;
    sent_at: string | null;
    frozen_reason: string | null;
  };
  movements: VoucherMovement[];
}

/** POST /api/venue/pos/vouchers `{ kind: 'existing_voucher' }`. */
export interface AddedVoucher {
  voucher: { id: string; code_last4: string | null; balance_pence: number };
  code: string | null;
}

/** POST /api/venue/pos/vouchers/import. */
export interface VoucherImportResult {
  dry_run: boolean;
  rows: { row: number; status: 'new' | 'exists' | 'error'; problem: string | null; balance_pence: number }[];
  summary: { count: number; amount_pence: number; exists: number; problems: number };
  codes: { row: number; code: string; last4: string }[];
}
