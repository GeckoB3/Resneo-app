import type { PosCapabilityMap } from '@/types/pos';

/**
 * The shapes the second half of Checkout settings reads (web Settings, Checkout tab: card readers,
 * cards on file, gift vouchers, loyalty card, commission, stock and the online shop). Each mirrors
 * the web route it comes from, field for field; a key an older server leaves out is optional.
 */

// ─── GET/PATCH /api/venue/pos/settings (web `SettingsResponse`) ─────────────

/** The settings keys these screens read or write. The rest of the row passes through untouched. */
export interface PosCheckoutSettings {
  trading_name: string | null;
  card_on_file_enabled?: boolean;
  track_stock_enabled: boolean;
  allow_negative_stock_at_till?: boolean;
  low_stock_digest?: boolean;
  version: number;
  [key: string]: unknown;
}

export interface PosSettingsResponse {
  settings: PosCheckoutSettings;
  staff_capability_map: PosCapabilityMap;
  capability_defaults?: PosCapabilityMap;
  can: { is_admin: boolean; manage_settings: boolean; edit_capabilities: boolean };
  venue: { name: string; currency: string; timezone: string };
}

/** A field a write refused, as `posValidationResponse` names it (`fields: [{ path, message }]`). */
export interface FieldError {
  path: string;
  message: string;
}

// ─── Card readers (/api/venue/pos/readers) ──────────────────────────────────

export type ReaderModel = 's700' | 's710' | 'wisepos' | 'simulated' | 'other';

export interface CardReader {
  id: string;
  label: string;
  device_type?: string | null;
  model: ReaderModel | string;
  serial_last4?: string | null;
  till_id?: string | null;
  default_for_till_ids?: string[];
  status: 'online' | 'offline' | null;
  last_seen_at?: string | null;
  is_active: boolean;
  inactive_reason?: 'removed' | 'moved' | null;
  inactive_at?: string | null;
  busy: boolean;
  busy_sale_id?: string | null;
}

export interface CardReaderList {
  readers: CardReader[];
  can_take_cards?: boolean;
  in_person_payments_enabled?: boolean;
  test_mode?: boolean;
}

export interface TillOption {
  id: string;
  name: string;
  is_active?: boolean;
}

// ─── Gift vouchers (/api/venue/pos/voucher-settings) ────────────────────────

export interface VoucherSettings {
  preset_pence: number[];
  custom_allowed: boolean;
  min_pence: number;
  max_pence: number;
  expiry_months: number | null;
  terms: string | null;
  online_sale_enabled: boolean;
  accent_colour: string | null;
  version: number;
  set_up: boolean;
}

export interface VoucherSettingsResponse {
  settings: VoucherSettings;
  can?: { edit: boolean };
  venue: { name: string; currency: string; card_payments_ready: boolean; slug?: string | null };
}

// ─── Loyalty card (/api/venue/pos/loyalty/programme) ────────────────────────

export type LoyaltyRewardKind = 'free_service' | 'amount' | 'percent';

export interface LoyaltyProgramme {
  id: string | null;
  venue_id?: string;
  name: string;
  stamps_needed: number;
  qualifying_service_item_ids: string[] | null;
  reward_kind: LoyaltyRewardKind;
  reward_service_item_ids: string[] | null;
  reward_service_name?: string | null;
  reward_max_pence?: number | null;
  reward_amount_pence: number | null;
  reward_percent_bps: number | null;
  reward_valid_days: number | null;
  started_on: string;
  status: 'active' | 'paused';
  reward_email_enabled: boolean;
  version: number;
  set_up: boolean;
}

export interface LoyaltyProgrammeResponse {
  programme: LoyaltyProgramme;
  services: { id: string; name: string; price_pence: number }[];
  can?: { edit: boolean };
  today: string;
}

// ─── Commission (/api/venue/pos/commission/rates) ───────────────────────────

export type CommissionItemType = 'service' | 'product' | 'voucher';

export interface CommissionRate {
  id: string;
  item_type: CommissionItemType;
  category_id: string | null;
  category_name: string | null;
  calendar_id: string | null;
  staff_id: string | null;
  person_name: string | null;
  /** Null: this person's or category's own rate stops from `effective_from`. */
  rate_bps: number | null;
  effective_from: string;
  created_by_name?: string | null;
  created_at?: string;
}

export interface CommissionPerson {
  calendar_id: string | null;
  staff_id: string | null;
  name: string;
}

export interface CommissionCategory {
  id: string;
  name: string;
  item_type: 'service' | 'product';
}

export interface CommissionRatesResponse {
  rates: CommissionRate[];
  people: CommissionPerson[];
  categories: CommissionCategory[];
  commission_basis: 'net_ex_vat' | 'net_inc_vat';
  settings_version: number;
  today: string;
  vat_registered: boolean;
}

// ─── Online shop (/api/venue/shop/settings, /api/venue/shop/delivery-zones) ─

export type ShopStockDisplay = 'exact' | 'low_only' | 'none';

export interface ShopSettings {
  shop_open: boolean;
  collection_enabled: boolean;
  collection_instructions: string | null;
  collection_ready_minutes: number;
  collection_hold_days: number;
  delivery_enabled: boolean;
  returns_policy: string | null;
  cancellation_policy: string | null;
  delivery_policy: string | null;
  terms_of_sale: string | null;
  policies_version: number;
  shop_min_order_pence: number;
  shop_stock_display: ShopStockDisplay;
  return_window_days: number;
  shop_return_postage: 'customer' | 'venue';
  shop_ready_sms_enabled: boolean;
  shop_delivered_email_enabled: boolean;
  jurisdiction: 'gb' | 'ni' | 'ie' | string;
  /** The shared POS settings version (the shop settings live on the same row). */
  version: number;
  [key: string]: unknown;
}

/** What a zone covers (web `ZoneArea`): the whole UK, the Republic of Ireland, or chosen UK postcodes. */
export type ShopZoneArea = 'uk' | 'ie' | 'postcodes';

export interface ShopZone {
  id: string;
  name: string;
  area: ShopZoneArea;
  country?: 'GB' | 'IE';
  /** A postcode zone's areas, districts, sectors or ranges ("LS6", "PA20-PA49"). */
  include_postcode_prefixes?: string[];
  price_pence: number;
  free_over_pence: number | null;
  estimate_text: string | null;
  sort_order?: number;
  is_active: boolean;
  version: number;
}

export interface ShopReadiness {
  checks: { legal: boolean; policies: boolean; cards: boolean; plan: boolean; products: boolean; fulfilment: boolean };
  canOpen: boolean;
  open: boolean;
  missing?: string[];
}

export interface ShopAdminView {
  settings: ShopSettings;
  zones: ShopZone[];
  readiness: ShopReadiness;
  missing_sentence: string;
  /** What builds before 2026-10-10 offered; this build reads `delivery_areas`. */
  allowed_areas: string[];
  /** The areas the zone editor offers ([] for an Irish venue until Pass 10). */
  delivery_areas?: ShopZoneArea[];
  /** Ready-made postcode lists the editor starts from. */
  zone_presets?: { highlands: string[] };
  shop_url: string | null;
  templates: Record<'returns' | 'cancellation' | 'delivery' | 'terms', string>;
  policy_updated_at: string | null;
}
