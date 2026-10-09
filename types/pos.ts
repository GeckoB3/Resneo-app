/**
 * Checkout (POS) shapes, as the web's `/api/venue/pos/*` routes return them
 * (Docs/pos-retail-plan.md Appendix E on the web; mirrors
 * `C:\Resneo\src\lib\pos\sale-read.ts` `PosSaleDto`). Amounts are integer pence.
 *
 * Only venues with `feature_flags.resolved.pos_enabled` ever load these: see
 * `lib/pos/pos-enabled.ts`.
 */

export type PosSaleStatus = 'open' | 'pending_payment' | 'part_paid' | 'completed' | 'voided' | 'expired';

export interface PosPersonRef {
  calendar_id: string | null;
  staff_id: string | null;
  name: string | null;
}

export interface PosSaleLine {
  id: string;
  line_no: number;
  line_type: string;
  parent_line_id: string | null;
  booking_id: string | null;
  service_item_id: string | null;
  service_variant_id: string | null;
  product_id: string | null;
  variant_id: string | null;
  name: string;
  option_name: string | null;
  reporting_group: 'services' | 'retail' | 'other';
  quantity: number;
  list_unit_price_pence: number;
  unit_price_pence: number;
  price_change_reason: string | null;
  paid_by_credit: boolean;
  line_discount_pence: number;
  sale_discount_share_pence: number;
  total_pence: number;
  tax_rate_bps: number;
  tax_code: string;
  tax_pence: number;
  tip_eligible: boolean;
  walkin_booking: boolean;
  refunded_quantity: number;
  refunded_pence: number;
  performer: PosPersonRef | null;
  seller: PosPersonRef | null;
  attributions: {
    role: 'performer' | 'seller';
    calendar_id: string | null;
    staff_id: string | null;
    name: string;
    share_bps: number;
  }[];
  booking: { booking_date: string; booking_time: string; status: string } | null;
  /**
   * Gift voucher lines only (Pass V, UX spec §20.2): who it is for and how it goes out, and once
   * the sale completes the voucher it made. Never the code. Optional: a server before Pass V
   * leaves it out.
   */
  voucher?: PosLineVoucher | null;
  /**
   * Product lines only (Pass 4, UX spec §3.7): whether the option counts stock, what is on hand and
   * available now, and its restriction ('age_18' shows the 18+ chip). Optional: a server before
   * Pass 4 leaves it out.
   */
  product?: PosLineProduct | null;
}

/** A product line's stock facts (web `PosLineProductDto`). */
export interface PosLineProduct {
  track_stock: boolean;
  on_hand: number;
  /** On hand less what is held for payments in progress and online orders. */
  available: number;
  restriction: string;
}

/** What a gift voucher line may show (web `PosLineVoucherDto`). Last four characters only. */
export interface PosLineVoucher {
  /** Null until the sale completes and the voucher exists. */
  account_id: string | null;
  code_last4: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  message: string | null;
  send_at: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  status: string | null;
  balance_pence: number | null;
}

/** Which voucher a gift voucher payment drew on (web `PosPaymentVoucherDto`). */
export interface PosPaymentVoucher {
  account_id: string;
  code_last4: string | null;
  status: string | null;
  expires_at: string | null;
}

export type PosPaymentStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled';

export interface PosPayment {
  id: string;
  method: string;
  is_money: boolean;
  status: PosPaymentStatus;
  amount_pence: number;
  tip_pence: number;
  refunded_pence: number;
  refunded_tip_pence: number;
  refundable_pence: number;
  refundable_tip_pence: number;
  cash_tendered_pence: number | null;
  change_given_pence: number | null;
  payment_type_id: string | null;
  payment_type_name: string | null;
  reference: string | null;
  applied_booking_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  reader_label: string | null;
  operator_name: string | null;
  failure_code: string | null;
  failure_message: string | null;
  stripe_payment_intent_id: string | null;
  business_date: string | null;
  created_at: string;
  succeeded_at: string | null;
  /** Gift voucher payments only (Pass V). Optional: a server before Pass V leaves it out. */
  voucher?: PosPaymentVoucher | null;
  /** A sale sent to a phone (Pass 2, plan §4.36): its claim state; null or missing for every other payment. */
  collect_state?: string | null;
}

export interface PosRefund {
  id: string;
  payment_id: string;
  return_id: string | null;
  destination: string;
  payment_type_name: string | null;
  status: 'pending' | 'succeeded' | 'failed';
  amount_pence: number;
  tip_pence: number;
  source: 'resneo' | 'stripe_dashboard';
  reason: string;
  note: string | null;
  refunded_by_name: string | null;
  failure_code: string | null;
  created_at: string;
  succeeded_at: string | null;
}

export interface PosTipShare {
  payment_id: string | null;
  calendar_id: string | null;
  staff_id: string | null;
  name: string;
  amount_pence: number;
}

export interface PosSaleDiscount {
  id: string;
  line_id: string | null;
  kind: string;
  percent_bps: number | null;
  amount_pence: number | null;
  applied_pence: number;
  applies_to: string;
  is_manual: boolean;
  reason: string | null;
  created_by_name: string | null;
}

export interface PosSale {
  id: string;
  number: number;
  number_label: string;
  channel: 'till' | 'app' | 'online';
  status: PosSaleStatus;
  version: number;
  currency: string;
  guest: { id: string; name: string; email: string | null; phone: string | null } | null;
  subtotal_pence: number;
  discount_pence: number;
  tax_pence: number;
  total_pence: number;
  paid_pence: number;
  applied_pence: number;
  tip_pence: number;
  refunded_pence: number;
  returned_pence: number;
  pending_pence: number;
  reserved_pence: number;
  balance_due_pence: number;
  refund_status: 'none' | 'partial' | 'full';
  opened_business_date: string;
  business_date: string | null;
  created_at: string;
  completed_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  cancel_requested_at: string | null;
  till_id: string | null;
  notes: string | null;
  created_by_name: string | null;
  operator: PosPersonRef;
  parked: { at: string; by_staff_id: string | null; note: string | null; device: string | null } | null;
  payment_lock_payment_id: string | null;
  lines: PosSaleLine[];
  discounts: PosSaleDiscount[];
  payments: PosPayment[];
  refunds: PosRefund[];
  returns: {
    id: string;
    reason: string;
    created_at: string;
    lines: { line_id: string; quantity: number; amount_pence: number; restock: boolean }[];
  }[];
  tips: PosTipShare[];
}

/** Every sale write answers with the whole sale (Appendix E). */
export interface PosSaleResponse {
  sale: PosSale;
}

/** The capability map (web `src/lib/pos/capabilities.ts`); a key the server omits reads as not allowed. */
export type PosCapability =
  | 'take_payment'
  | 'create_sale'
  | 'park_sale'
  | 'apply_discount'
  | 'override_price'
  | 'custom_line'
  | 'void_open_sale'
  | 'refund'
  | 'charge_saved_card'
  | 'edit_tips'
  | 'edit_credit'
  | 'view_reports'
  | 'export'
  | 'manage_vouchers'
  // Pass 4: products and stock.
  | 'manage_products'
  | 'adjust_stock'
  | 'count_stock'
  | 'commit_stocktake'
  // Pass LC: loyalty cards and commission.
  | 'adjust_loyalty'
  | 'see_own_commission';

export type PosCapabilityMap = Partial<Record<PosCapability, boolean>> & Record<string, boolean | undefined>;

export interface PosOperator {
  kind: 'calendar' | 'login';
  calendar_id: string | null;
  staff_id: string | null;
  name: string;
}

export interface PosPaymentType {
  id: string;
  name: string;
  requires_reference: boolean;
  is_active: boolean;
}

export interface PosDiscountPreset {
  id: string;
  name: string;
  kind: string;
  percent_bps: number | null;
  amount_pence: number | null;
  applies_to: string;
  reason_required: boolean;
  max_amount_pence?: number | null;
}

export interface PosTipSettings {
  tipping_enabled?: boolean;
  tip_percent_presets?: number[];
  tip_amount_presets?: number[];
  smart_tip_threshold_pence?: number;
  tip_custom_allowed?: boolean;
  tip_base?: 'services' | 'total';
  tip_allocation_rule?: 'pro_rata_services' | 'equal_performers' | 'operator' | 'manual';
  tipping_policy?: string | null;
  /** Pass 2: the client may add a tip on a pay link (with tipping on). Missing reads as on, as on the web. */
  tip_on_links?: boolean;
}

export interface PosTillSettings {
  receipt_prefix?: string | null;
  receipt_auto_send?: string;
  staff_max_discount_percent?: number;
  discount_reason_required?: boolean;
  discount_reasons?: string[];
  discount_free_text_allowed?: boolean;
  refund_reasons?: string[];
  void_reasons?: string[];
  max_payment_pence?: number;
  /** Pass 2 (plan §4.4.5): cards on file, off by default. */
  card_on_file_enabled?: boolean;
  /** Pass 2: how long a pay link works, in hours. */
  pay_link_hours?: number;
  /** Pass 4: the venue's Track stock switch (simple mode, plan §4.37). Missing reads as off. */
  track_stock_enabled?: boolean;
}

/** `GET /api/venue/pos/bootstrap` (#1). */
export interface PosBootstrap {
  settings: PosTillSettings;
  capabilities: PosCapabilityMap;
  role?: 'admin' | 'staff' | null;
  tills: { id: string; name: string; is_active?: boolean }[];
  payment_types: PosPaymentType[];
  discount_presets: PosDiscountPreset[];
  tip_settings?: PosTipSettings | null;
  tax_settings?: {
    vat_registered?: boolean;
    /** Pass 4: the VAT category a product without its own uses ('standard', 'reduced', ...). */
    default_product_tax_category?: string | null;
    jurisdiction?: string | null;
  } | null;
  operators: PosOperator[];
  /**
   * Which card methods the venue can use (Appendix E #1). `card_app` since Pass 1; Pass 2 adds
   * `card_reader` (a counter reader is registered), `send_to_phone` and `pay_link`. A key the
   * server leaves out reads as off.
   */
  card_methods?: { card_app?: boolean; card_reader?: boolean; send_to_phone?: boolean; pay_link?: boolean } | null;
  /** Pass 2: the venue's active counter readers. */
  readers?: PosReader[] | null;
  venue: { name: string; currency: string; timezone: string };
  /** The signed-in person (web Pass V and later). */
  me?: { staff_id: string; name: string | null; calendar_ids: string[] } | null;
  /**
   * Gift vouchers (Pass V, plan §4.33.1): `selling` while the voucher switch is on; `redeemable`
   * while it is on or a voucher sold earlier is still active (switching off stops selling, never
   * redeeming). Missing on a server before Pass V, which reads as both off.
   */
  vouchers?: { selling: boolean; redeemable: boolean } | null;
}

// ─── Gift vouchers and account credit (Pass V, UX spec §20) ─────────────────

/** `GET /api/venue/pos/voucher-settings`: what the Vouchers tab offers. */
export interface PosVoucherSettings {
  preset_pence: number[];
  custom_allowed: boolean;
  min_pence: number;
  max_pence: number;
  expiry_months: number | null;
  terms?: string | null;
  online_sale_enabled?: boolean;
  version?: number;
  set_up: boolean;
}

export interface PosVoucherSettingsResponse {
  settings: PosVoucherSettings;
  can?: { edit: boolean };
  venue?: { name: string; currency: string };
}

/**
 * A voucher as the look-up and the client's stored value return it: status in words the screens
 * map (`active`, `used_up`, `expired`, `frozen`, `cancelled`), the balance and the last four only.
 */
export interface PosVoucherSummary {
  id: string;
  code_last4: string | null;
  status: string;
  balance_pence: number;
  initial_pence: number;
  currency?: string;
  source?: string;
  issued_at?: string | null;
  expires_at: string | null;
  recipient_name?: string | null;
}

/** `GET /api/venue/guests/[guestId]/stored-value`: the client's credit and their vouchers. */
export interface PosClientStoredValue {
  credit: {
    account_id: string | null;
    balance_pence: number;
    currency?: string;
    history?: {
      id: string;
      kind: string;
      delta_pence: number;
      sale_id: string | null;
      staff_name: string | null;
      reason: string | null;
      business_date: string;
      created_at: string;
    }[];
  };
  vouchers: PosVoucherSummary[];
  can?: { manage_vouchers: boolean };
}

/** One row of `GET /api/venue/pos/sales` (#3). */
export interface PosSaleListRow {
  id: string;
  number: number;
  number_label: string;
  channel: string;
  status: PosSaleStatus;
  total_pence: number;
  balance_due_pence: number;
  refund_status: 'none' | 'partial' | 'full' | null;
  tip_pence: number;
  client_name: string | null;
  operator_name: string | null;
  created_by_name: string | null;
  created_at: string;
  completed_at: string | null;
  business_date: string | null;
  parked: { at: string; note: string | null; device: string | null } | null;
  card_waiting: boolean;
  summary: string;
  line_count: number;
}

export interface PosSaleListResponse {
  sales: PosSaleListRow[];
  next_cursor: string | null;
}

/** One visit in "Ready to check out" (`GET /api/venue/pos/queue`, #20). */
export interface PosQueueRow {
  booking_id: string;
  booking_ids: string[];
  group_booking_id: string | null;
  guest_id: string | null;
  client_name: string | null;
  booking_date: string;
  start_time: string;
  end_time: string | null;
  status: 'arrived' | 'started' | 'completed';
  services: {
    booking_id: string;
    name: string;
    option_name: string | null;
    calendar_id: string | null;
    calendar_name: string | null;
    start_time: string;
    end_time: string | null;
    status: 'arrived' | 'started' | 'completed';
    price_pence: number | null;
    model: 'appointment' | 'class' | 'event' | 'resource';
  }[];
  price_pence: number | null;
  price_unknown: boolean;
  deposit_paid_pence: number;
  paid_pence: number;
  balance_due_pence: number;
  open_sale_id: string | null;
  open_sale_number_label: string | null;
}

export interface PosQueueResponse {
  date: string;
  bookings: PosQueueRow[];
}

/** `GET /api/venue/pos/catalogue` (#19). Products arrive with Pass 4. */
export interface PosCatalogueService {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  colour: string | null;
  price_pence: number | null;
  price_type: string | null;
  duration_minutes: number;
  options: { id: string; name: string; price_pence: number | null; duration_minutes: number }[];
  calendars: { calendar_id: string; name: string; price_pence: number | null; duration_minutes: number }[];
}

/** One option the till can sell (web `CatalogueProductOption`), with its stock hints. */
export interface PosCatalogueProductOption {
  id: string;
  name: string | null;
  sku: string | null;
  price_pence: number;
  track_stock: boolean;
  on_hand: number;
  /** In stock less what is held for online orders. */
  available: number;
  barcodes?: string[];
}

/** A product the till may sell (web `CatalogueProduct`): live, sold in store, not backbar-only. */
export interface PosCatalogueProduct {
  id: string;
  name: string;
  brand_name: string | null;
  category_id?: string | null;
  category_name?: string | null;
  /** 'age_18' shows the till's age reminder (plan §4.12, UX spec §3.26). */
  restriction: string;
  tax_category?: string | null;
  photo_url?: string | null;
  options: PosCatalogueProductOption[];
}

/** The till's stock rules (D15): Track stock, and selling beyond the count (on by default). */
export interface PosStockRules {
  track_stock: boolean;
  sell_beyond_stock: boolean;
}

export interface PosCatalogue {
  services: PosCatalogueService[];
  favourites: { id: string; item_type: 'service' | 'variant'; item_id: string; sort_order: number }[];
  /** Pass 4 (P4-4). Optional: a server before Pass 4 sends none of these. */
  products?: PosCatalogueProduct[];
  /** The products behind product favourites and suggestions, with only those options. */
  favourite_products?: PosCatalogueProduct[];
  /** Until the venue chooses favourites: its best sellers of the last 30 days, in order. */
  suggested?: { item_type: 'service' | 'variant'; item_id: string }[];
  stock?: PosStockRules;
}

/** `GET /api/venue/pos/catalogue?barcode=`: the product and option a scanned barcode belongs to. */
export interface PosBarcodeHit {
  product: PosCatalogueProduct;
  option_id: string;
}

// ─── Loyalty cards and commission (Pass LC, UX spec §21, §22) ───────────────

export type PosRewardKind = 'free_service' | 'amount' | 'percent';

/** A loyalty reward (web `LoyaltyRewardDto`). */
export interface PosLoyaltyReward {
  id: string;
  cycle: number;
  status: 'available' | 'used' | 'expired' | 'cancelled';
  reward_kind: PosRewardKind;
  reward_service_item_ids?: string[] | null;
  reward_service_name: string | null;
  reward_max_pence?: number | null;
  reward_amount_pence: number | null;
  reward_percent_bps: number | null;
  issued_at: string;
  expires_at: string | null;
  sale_id?: string | null;
  sale_number?: number | null;
}

export type PosLoyaltyHistoryKind = 'earn' | 'reverse' | 'adjust' | 'spend' | 'used' | 'expired' | 'cancelled';

export interface PosLoyaltyHistoryItem {
  id: string;
  kind: PosLoyaltyHistoryKind;
  delta: number;
  visit_date: string | null;
  staff_name: string | null;
  reason: string | null;
  sale_number: number | null;
  at: string;
}

/** A client's loyalty card (web `LoyaltyCardDto`). */
export interface PosLoyaltyCard {
  programme: {
    name: string;
    status: string;
    stamps_needed: number;
    started_on: string | null;
    reward_kind: PosRewardKind;
    reward_service_name: string | null;
    reward_amount_pence: number | null;
    reward_percent_bps: number | null;
  } | null;
  stamps: number;
  needed: number;
  rewards: PosLoyaltyReward[];
  /** Available and not past their expiry, oldest first. */
  available: PosLoyaltyReward[];
  history: PosLoyaltyHistoryItem[];
}

/** `GET /api/venue/guests/[guestId]/loyalty-card`. `card` is null until the venue sets a programme up. */
export interface PosLoyaltyCardResponse {
  card: PosLoyaltyCard | null;
  can: { adjust: boolean };
  venue?: { currency: string; timezone: string };
}

/** One reward as the sale offers it (`GET /api/venue/pos/sales/[id]/loyalty-reward`). */
export interface PosSaleReward extends PosLoyaltyReward {
  /** "a free Cut", "£5.00 off": the server's words. */
  text: string;
  discount_label: string;
  /** False for a free service whose service is not on the sale. */
  applicable: boolean;
  applied: boolean;
  /** `loyalty.apply.noService`, filled, when it cannot go on this sale. */
  blocked_reason: string | null;
}

export interface PosSaleRewardsResponse {
  rewards: PosSaleReward[];
  card: { stamps: number; needed: number; status: string | null } | null;
}

export type PosMinePeriod = 'today' | 'week' | 'month';

/** `GET /api/venue/pos/commission/report?mine=1&period=`: this person's own figures only. */
export interface PosMyCommission {
  mine: {
    period: PosMinePeriod;
    from: string;
    to: string;
    sales_pence: number;
    tips_pence: number;
    /** Null without `see_own_commission`. */
    commission_pence: number | null;
  };
  can: { see_commission: boolean };
  venue: { name: string; currency: string };
}

/** `GET /api/venue/guests/[guestId]/purchases` (P4-8; plan §4.17). */
export interface PosClientSpend {
  lifetime_pence: number;
  visits: number;
  average_pence: number | null;
}

export interface PosClientPurchase {
  line_id: string;
  sale_id: string;
  sale_number: string | number | null;
  channel: 'till' | 'app' | 'online';
  completed_at: string | null;
  business_date: string | null;
  product_id: string | null;
  variant_id: string | null;
  name: string;
  option_name: string | null;
  quantity: number;
  refunded_quantity: number | null;
  total_pence: number;
  seller_name: string | null;
}

export interface PosClientPurchasesResponse {
  spend: PosClientSpend;
  purchases: PosClientPurchase[];
}

/** `GET /api/venue/reports/pos-access`. */
export interface PosReportAccess {
  visible: boolean;
  pos_enabled: boolean;
  has_sales: boolean;
  can_view: boolean;
  can_export: boolean;
  currency?: string;
  currency_symbol?: string;
}

export type PosReportPreset = 'today' | 'yesterday' | 'this-week' | 'last-week' | 'this-month' | 'last-month';

export interface TakingsAmounts {
  payments_pence: number;
  refunds_pence: number;
  disputes_pence: number;
  tips_pence: number;
  net_pence: number;
}

/** `GET /api/venue/reports/takings` (the parts the app shows). */
export interface TakingsReport {
  from: string;
  to: string;
  totals: TakingsAmounts & { net_with_tips_pence: number; row_count: number };
  by_method: (TakingsAmounts & { method: string; external_type_name: string | null; row_count: number })[];
  by_source: (TakingsAmounts & { source: string; row_count: number })[];
  by_person: {
    staff_id: string | null;
    name: string | null;
    payments_pence: number;
    refunds_pence: number;
    tips_pence: number;
    net_pence: number;
    row_count: number;
  }[];
  refunds: { source_type: string; reason: string; refund_count: number; amount_pence: number; tip_pence: number }[];
  estimated?: { first_exact_date: string | null; estimated_rows: number; note?: string | null };
  tips?: TipsSummary;
}

export interface TipsSummary {
  totals: { allocated_pence: number; reversed_pence: number; net_pence: number; paid_pence: number; due_pence: number };
  by_recipient: {
    calendar_id: string | null;
    staff_id: string | null;
    name: string;
    allocation_kind: string;
    net_pence: number;
    paid_pence: number;
    due_pence: number;
  }[];
}

export interface SalesPersonRow {
  calendar_id: string | null;
  staff_id: string | null;
  name: string;
  services_pence: number;
  retail_pence: number;
  other_pence: number;
  total_pence: number;
  refunds_pence: number;
}

/** `GET /api/venue/reports/sales` (the parts the app shows). */
export interface SalesReport {
  from: string;
  to: string;
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
    refund_count: number;
    net_after_refunds_pence: number;
    average_sale_pence: number;
    retail_per_visit_pence: number;
  };
  by_service: { key: string; name: string; quantity: number; sales_pence: number }[];
  by_performer: SalesPersonRow[];
  by_seller: SalesPersonRow[];
  discounts_by_reason: { reason: string; discount_count: number; amount_pence: number }[];
}

// ─── Card payments (Pass 2, app step 2) ─────────────────────────────────────

/** A counter reader (web `PosReaderDto`, `GET /api/venue/pos/readers`). */
export interface PosReader {
  id: string;
  label: string;
  device_type?: string | null;
  model?: string;
  serial_last4?: string | null;
  till_id?: string | null;
  default_for_till_ids?: string[];
  status: 'online' | 'offline' | null;
  last_seen_at?: string | null;
  is_active: boolean;
  inactive_reason?: 'removed' | 'moved' | null;
  /** A payment is waiting on it now. */
  busy: boolean;
  busy_sale_id?: string | null;
}

export interface PosReaderList {
  readers: PosReader[];
  can_take_cards?: boolean;
  in_person_payments_enabled?: boolean;
}

export type PosCardSaveStatus = 'asking' | 'agreed' | 'declined' | 'saved' | 'not_saved' | 'failed';

/** A counter reader payment as the till follows it (web `ReaderPaymentState`). */
export interface PosReaderPaymentState {
  payment_id: string;
  sale_id: string;
  status: PosPaymentStatus;
  screen: 'waiting' | 'confirming' | 'declined' | 'paid' | 'cancelled' | 'failed' | 'moved_away' | 'checking';
  /** The server's sentence for a decline or failure, shown word for word. */
  message: string | null;
  pin_required: boolean;
  amount_pence: number;
  tip_pence: number;
  card_brand: string | null;
  card_last4: string | null;
  reader_id: string | null;
  reader_label: string | null;
  attempt: number;
  started_at: string;
  reader_action_at: string | null;
  card_save: PosCardSaveStatus | null;
}

export interface PosReaderPaymentResponse {
  reader_state: PosReaderPaymentState;
  sale_version: number | null;
  sale_status: string | null;
}

/** A sale sent to a phone, as the phone follows it (web `CollectPaymentState`, plan §4.36). */
export type PosCollectScreen =
  | 'waiting'
  | 'claimed'
  | 'collecting'
  | 'declined'
  | 'needs_pin'
  | 'paid'
  | 'cancelled'
  | 'expired'
  | 'timed_out'
  | 'failed'
  | 'checking';

export interface PosCollectState {
  payment_id: string;
  sale_id: string;
  status: PosPaymentStatus;
  collect_state: string;
  screen: PosCollectScreen;
  for_anyone: boolean;
  target_staff_id: string | null;
  target_name: string | null;
  claimed_by_staff_id: string | null;
  claimed_by_name: string | null;
  reader_type: 'tap_to_pay' | 'wisepad' | null;
  amount_pence: number;
  tip_pence: number;
  card_brand: string | null;
  card_last4: string | null;
  failure_code: string | null;
  failure_message: string | null;
  expires_at: string;
  seconds_left: number;
  claimed_at: string | null;
  created_at: string;
}

export interface PosCollectStateResponse {
  collect: PosCollectState;
  sale_version: number | null;
  sale_status: string | null;
}

/** `POST /api/venue/pos/payments/[id]/claim`. */
export interface PosClaimResponse {
  collect: PosCollectState | null;
  client_secret: string | null;
  payment_intent_id: string | null;
  stripe_account_id: string | null;
  terminal_location_id: string | null;
  same_device: boolean;
}

/** One row of `GET /api/venue/pos/collect-requests?mine=1` ("Waiting for you"). */
export interface PosCollectRequest {
  payment_id: string;
  sale_id: string;
  sale_no: string;
  amount_pence: number;
  for_anyone: boolean;
  target_staff_id: string | null;
  target_name: string | null;
  sent_by_name: string | null;
  client_name: string | null;
  till_name: string | null;
  expires_at: string;
  seconds_left: number;
  created_at: string;
}

export interface PosCollectRequestsResponse {
  requests: PosCollectRequest[];
}

/** A pay link (web `PayLinkDto`). */
export interface PosPayLink {
  id: string;
  sale_id: string;
  kind: 'balance' | 'tip_only';
  status: 'waiting' | 'paid' | 'cancelled' | 'expired';
  amount_pence: number;
  tip_pence: number;
  allow_tip: boolean;
  expires_at: string;
  created_at: string;
  payment_id: string | null;
  payment_status: PosPaymentStatus | null;
  last_attempt_failed: boolean;
  revoked_reason: string | null;
  url: string;
  qr_svg: string | null;
}

export interface PosPayLinksResponse {
  links: PosPayLink[];
  healed?: number;
}

/** `POST .../pay-links` and #13 with `method: 'pay_link'`. */
export interface PosPayLinkCreated {
  sale: PosSale;
  payment: PosPayment | null;
  link: PosPayLink;
  link_url: string;
  replayed: boolean;
}

/** A client's saved card (web `SavedCardDto`): never a Stripe id. */
export interface PosSavedCard {
  id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  consent_at: string;
  consent_channel: 'reader' | 'app' | 'online_booking' | 'shop' | 'account';
  created_at: string;
}

export interface PosSavedCardsResponse {
  cards: PosSavedCard[];
  card_on_file_enabled: boolean;
}

/** `GET .../payments/[paymentId]/card-consent`. */
export interface PosCardConsentInfo {
  consent_text: string;
  can_save: boolean;
  card_save_status: PosCardSaveStatus | null;
}

/** `POST .../payments/[paymentId]/card-consent`. */
export interface PosCardConsentAnswer {
  card_save_status: PosCardSaveStatus | null;
  changed: boolean;
  allow_redisplay: 'always' | null;
}

export type PosPayoutStatus = 'paid' | 'on_its_way' | 'pending' | 'failed' | 'cancelled';

/** One payout (web `PayoutSummary`). */
export interface PosPayout {
  id: string;
  amount_pence: number;
  currency: string;
  arrival_date: string;
  created_at: string;
  status: PosPayoutStatus;
  automatic: boolean;
  fees_pence: number | null;
  payments_pence: number | null;
  refunds_pence: number | null;
  other_pence: number | null;
  items_count: number | null;
}

export interface PosPayoutItem {
  id: string;
  kind: 'payment' | 'refund' | 'dispute' | 'fee' | 'other';
  created_at: string;
  gross_pence: number;
  fee_pence: number;
  net_pence: number;
  label: string;
  sale_id: string | null;
  booking_id: string | null;
  card_last4: string | null;
}

/** `GET /api/venue/reports/payouts` (admins only; instant payouts are v1.x). */
export interface PosPayoutsReport {
  from: string;
  to: string;
  currency: string;
  connected: boolean;
  payouts: PosPayout[];
  truncated: boolean;
}

export interface PosPayoutDetail {
  currency: string;
  payout: PosPayout;
  items: PosPayoutItem[];
}
