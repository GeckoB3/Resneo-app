/**
 * Checkout settings (web: Settings, Checkout; `src/app/dashboard/settings/checkout/types.ts`). What
 * `GET /api/venue/pos/settings` answers, and the venue's tills, other payment types and preset
 * discounts as their own routes list them. Field for field with the web's types.
 */

export interface PosAddress {
  line1: string | null;
  line2: string | null;
  town: string | null;
  postcode: string | null;
}

export type PosTaxCategory = 'standard' | 'reduced' | 'zero' | 'exempt';
export type PosTipRule = 'pro_rata_services' | 'equal_performers' | 'operator' | 'manual';
export type PosCompanyRegisteredIn = 'england_wales' | 'scotland' | 'northern_ireland';

export interface PosCheckoutSettings {
  legal_name: string | null;
  trading_name: string | null;
  company_number: string | null;
  vat_registered: boolean;
  vat_number: string | null;
  business_address: PosAddress | null;
  registered_office_address: PosAddress | null;
  company_registered_in: PosCompanyRegisteredIn | null;
  public_contact_email: string | null;
  public_contact_phone: string | null;
  business_country: 'GB' | 'IE';
  jurisdiction: 'gb' | 'ni' | 'ie';
  default_service_tax_category: PosTaxCategory;
  default_product_tax_category: PosTaxCategory;
  receipt_prefix: string | null;
  receipt_footer: string | null;
  receipt_auto_send: 'ask' | 'email_if_known' | 'never';
  tipping_enabled: boolean;
  tip_percent_presets: number[];
  tip_amount_presets: number[];
  smart_tip_threshold_pence: number;
  tip_custom_allowed: boolean;
  tip_base: 'services' | 'total';
  tip_allocation_rule: PosTipRule;
  tipping_policy: string | null;
  tips_mode: 'gb' | 'ni_best_practice' | 'ie';
  staff_max_discount_percent: number;
  discount_reason_required: boolean;
  discount_reasons: string[];
  discount_free_text_allowed: boolean;
  refund_reasons: string[];
  void_reasons: string[];
  cash_management_enabled: boolean;
  track_stock_enabled: boolean;
  multiple_tills_enabled: boolean;
  card_on_file_enabled?: boolean;
  allow_negative_stock_at_till?: boolean;
  low_stock_digest?: boolean;
  max_payment_pence: number;
  blind_close?: boolean;
  variance_reason_threshold_pence?: number;
  default_float_pence?: number;
  legacy_cash_till_id?: string | null;
  eod_email_enabled?: boolean;
  eod_email_staff_ids?: string[];
  staff_capabilities: Record<string, boolean | undefined>;
  version: number;
}

export type PosSettingsKey = Exclude<keyof PosCheckoutSettings, 'version'>;

/** A capability map: every key the server knows, true or false. */
export type PosSettingsCapabilityMap = Record<string, boolean | undefined>;

export interface PosSettingsResponse {
  settings: PosCheckoutSettings;
  staff_capability_map: PosSettingsCapabilityMap;
  capability_defaults: PosSettingsCapabilityMap;
  can: { is_admin: boolean; manage_settings: boolean; edit_capabilities: boolean };
  venue: { name: string; currency: string; timezone: string };
}

export interface PosSettingsPaymentType {
  id: string;
  name: string;
  requires_reference: boolean;
  is_active: boolean;
  sort_order: number;
  version: number;
}

export interface PosSettingsTill {
  id: string;
  name: string;
  has_cash_drawer: boolean;
  is_active: boolean;
  sort_order: number;
  version: number;
}

export interface PosSettingsDiscountPreset {
  id: string;
  name: string;
  kind: 'percent' | 'amount';
  percent_bps: number | null;
  amount_pence: number | null;
  applies_to: 'all' | 'services' | 'products';
  max_amount_pence: number | null;
  reason_required: boolean;
  is_active: boolean;
  sort_order: number;
  version: number;
}

export interface PosFieldError {
  path: string;
  message: string;
}
