/**
 * Commission splits: the shapes the web and the app share, field for field from the web's
 * `src/lib/commission/types.ts` (reports/Commission splits across linked venues.md, decisions agreed
 * 2026-10-14). ResNeo only counts: it works out what each calendar earned and the share one party
 * owes another. It never takes or moves money.
 *
 * Two kinds of split:
 *   * Team commission, on the venue's own calendars (and logins without one): the venue owes the
 *     person a share. Rates are the dated `commission_rates` rows the Checkout commission feature
 *     introduced; they now work with or without Checkout.
 *   * Business splits, on one calendar at a business you work with through a "Work as one team" link
 *     or a live collective: the calendar's business (the payer) owes the other business (the payee) a
 *     share. Both businesses' admins agree every version of the terms.
 *
 * Money is in pence, rates in basis points (100 = 1%), dates are YYYY-MM-DD in the venue's time zone.
 *
 * The rate shapes the web imports from `src/lib/pos/commission/rates.ts` are written out here.
 */

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
  created_by_name: string | null;
  created_at: string;
}

export interface CommissionCategory {
  id: string;
  name: string;
  item_type: 'service' | 'product';
}

/** Where a calendar's service revenue comes from. Products and vouchers always come from Checkout. */
export type CommissionSource = 'checkout' | 'bookings';
/** The venue's setting: `auto` means Checkout when Checkout is on, otherwise completed bookings. */
export type CommissionSourceSetting = 'auto' | CommissionSource;
export type CommissionBasis = 'net_ex_vat' | 'net_inc_vat';

/** How a team member's share is described. Display only. */
export type CommissionPersonLabel = 'commission' | 'their_share';
/** How a business split is described. Display only. */
export type SplitLabel = 'rent' | 'fee' | 'commission' | 'their_share';
export type SettlementPeriod = 'weekly' | 'monthly';
export type SplitStatus = 'proposed' | 'active' | 'declined' | 'withdrawn' | 'ended';
export type SplitTermsStatus = 'proposed' | 'accepted' | 'declined' | 'withdrawn';
export type SplitEndReason = 'ended' | 'link_ended';

// ---------------------------------------------------------------------------------------------
// Team commission settings: GET/PATCH /api/venue/commission/settings, POST /api/venue/commission/rates,
// PUT /api/venue/commission/people, POST /api/venue/commission/share
// ---------------------------------------------------------------------------------------------

export interface CommissionSettingsPerson {
  calendar_id: string | null;
  staff_id: string | null;
  name: string;
  label: CommissionPersonLabel;
}

export interface CommissionSettingsResponse {
  rates: CommissionRate[];
  people: CommissionSettingsPerson[];
  categories: CommissionCategory[];
  basis: {
    value: CommissionBasis;
    /** False when the venue has never set up Checkout: there is no VAT set-up to work prices back from. */
    editable: boolean;
    vat_registered: boolean;
  };
  source: {
    /** What the report uses now. */
    value: CommissionSource;
    setting: CommissionSourceSetting;
    /** Checkout sales can be chosen only where Checkout has been set up. */
    checkout_available: boolean;
  };
  /** Optimistic concurrency for PATCH; null when the venue has no Checkout settings row. */
  settings_version: number | null;
  today: string;
  currency: string;
}

export interface CommissionSettingsPatch {
  version: number;
  commission_basis?: CommissionBasis;
  commission_source?: CommissionSourceSetting;
}

export interface CommissionPeoplePut {
  person_key: string;
  label: CommissionPersonLabel;
}

/**
 * POST /api/venue/commission/share: one person's share in one step. A rate is their own rate from
 * `effective_from`; null puts them back on your standard rate from then; left out, it is unchanged.
 */
export interface TeamShareBody {
  person_key: string;
  label: CommissionPersonLabel;
  effective_from: string;
  service_rate_percent?: number | null;
  product_rate_percent?: number | null;
}

/** The settings, plus how many rates the change added (0 when only the label changed, or nothing did). */
export interface TeamShareResponse extends CommissionSettingsResponse {
  added: number;
}

/** POST /api/venue/commission/rates: the same body as POST /api/venue/pos/commission/rates. */
export interface CommissionRatePostBody {
  item_type: CommissionItemType;
  category_id: string | null;
  calendar_id: string | null;
  staff_id: string | null;
  /** Null stops a person's or a category's own rate from `effective_from`. */
  rate_percent: number | null;
  effective_from: string;
}

/** 201 from POST /api/venue/commission/rates: the new rate and the settings as they now stand. */
export type CommissionRatePostResponse = CommissionSettingsResponse & { rate: CommissionRate };

// ---------------------------------------------------------------------------------------------
// Team commission report: GET /api/venue/commission/report
// ---------------------------------------------------------------------------------------------

export interface TeamCommissionRow {
  person_key: string;
  calendar_id: string | null;
  staff_id: string | null;
  person_name: string;
  label: CommissionPersonLabel;
  service_base_pence: number;
  service_commission_pence: number;
  product_base_pence: number;
  product_commission_pence: number;
  voucher_base_pence: number;
  voucher_commission_pence: number;
  total_commission_pence: number;
  tips_pence: number;
  /** What clients paid for this person's work (VAT included): till sales, or bookings as priced. */
  sales_pence: number;
}

export interface TeamCommissionLine {
  /** `booking` when services come from completed bookings. */
  row_kind: 'sale' | 'refund' | 'booking';
  business_date: string;
  sale_id: string | null;
  sale_number: number | null;
  refund_id: string | null;
  line_id: string | null;
  booking_id: string | null;
  booking_time: string | null;
  client_name: string | null;
  item_type: CommissionItemType;
  item_name: string;
  person_key: string;
  calendar_id: string | null;
  staff_id: string | null;
  person_name: string;
  share_bps: number;
  base_pence: number;
  rate_bps: number;
  commission_pence: number;
  sales_pence: number;
}

export interface TeamCommissionReport {
  from: string;
  to: string;
  preset: string | null;
  today: string;
  calendar: { id: string; name: string } | null;
  source: CommissionSource;
  basis: CommissionBasis;
  /** True when booking figures use prices as booked because the venue has no VAT set-up in ResNeo. */
  vat_note: boolean;
  rows: TeamCommissionRow[];
  totals: Omit<TeamCommissionRow, 'person_key' | 'calendar_id' | 'staff_id' | 'person_name' | 'label'>;
  lines: TeamCommissionLine[] | null;
  changed: {
    exported_at: string;
    persons: string[];
    lines: string[];
  } | null;
  has_rates: boolean;
  currency: string;
  receipt_prefix: string;
  can_export: boolean;
}

/** `?mine=1&period=` (any team member): the same shape the Checkout route has always returned. */
export interface MyCommissionResponse {
  mine: {
    period: 'today' | 'week' | 'month';
    from: string;
    to: string;
    sales_pence: number;
    tips_pence: number;
    commission_pence: number | null;
  };
  can: { see_commission: boolean };
  venue: { name: string; currency: string };
}

// ---------------------------------------------------------------------------------------------
// Business splits: /api/venue/commission/splits/**
// ---------------------------------------------------------------------------------------------

export interface SplitParty {
  venue_id: string;
  name: string;
}

export interface SplitTermsView {
  id: string;
  version: number;
  effective_from: string;
  services_rate_bps: number;
  /** Null when products are not part of the split. */
  products_rate_bps: number | null;
  vat_basis: CommissionBasis;
  status: SplitTermsStatus;
  proposed_by_you: boolean;
  proposed_at: string;
  decided_at: string | null;
}

export interface SplitView {
  id: string;
  status: SplitStatus;
  label: SplitLabel;
  settlement_period: SettlementPeriod;
  /** `payer`: the calendar is yours and you owe the share. `payee`: the calendar is theirs and they owe you. */
  role: 'payer' | 'payee';
  payer: SplitParty;
  payee: SplitParty;
  /** The other business. */
  partner: SplitParty;
  calendar: { id: string; name: string };
  proposed_by_you: boolean;
  created_at: string;
  /** The accepted terms in force today (or the latest accepted, once ended); null until accepted. */
  terms: SplitTermsView | null;
  /** A version waiting for an answer, if any. */
  pending: SplitTermsView | null;
  /** Every version, newest first. */
  history: SplitTermsView[];
  /** The last day the split counts, once ended or ending. */
  ended_on: string | null;
  end_reason: SplitEndReason | null;
  ended_by_you: boolean | null;
  can: {
    /** Accept or decline the pending version (the other side proposed it). */
    respond: boolean;
    /** Withdraw the pending version (you proposed it). */
    withdraw: boolean;
    propose_change: boolean;
    end: boolean;
  };
}

export interface SplitPartnerOption {
  venue_id: string;
  name: string;
  access: 'link' | 'collective';
  /** Their calendars you may propose a split on (they would pay you). */
  their_calendars: { id: string; name: string }[];
  /** Your calendars they can see (you would pay them). */
  your_calendars: { id: string; name: string }[];
}

export interface SplitsListResponse {
  today: string;
  currency: string;
  venue: SplitParty;
  /** What a new split's VAT choice starts at: the payer's commission setting. */
  basis_default: CommissionBasis;
  splits: SplitView[];
  partners: SplitPartnerOption[];
}

export interface SplitProposeBody {
  calendar_id: string;
  other_venue_id: string;
  label: SplitLabel;
  settlement_period: SettlementPeriod;
  effective_from: string;
  services_rate_percent: number;
  products_rate_percent: number | null;
  vat_basis: CommissionBasis;
}

export interface SplitTermsBody {
  effective_from: string;
  services_rate_percent: number;
  products_rate_percent: number | null;
  vat_basis: CommissionBasis;
}

export interface SplitRespondBody {
  terms_id: string;
  action: 'accept' | 'decline';
}

export interface SplitWithdrawBody {
  terms_id: string;
}

export interface SplitEndBody {
  /** The last day the split counts: today or later. */
  last_day: string;
}

/** POST bodies answer with the split as it now stands. */
export interface SplitResponse {
  split: SplitView;
}

/** A worked example on last month's figures, for the propose form: GET /api/venue/commission/splits/preview. */
export interface SplitPreviewResponse {
  from: string;
  currency: string;
  to: string;
  services_pence: number;
  products_pence: number;
  services_owed_pence: number;
  products_owed_pence: number;
  owed_pence: number;
  vat_note: boolean;
}

/** The query the preview is asked with (the app's own shape for `GET .../splits/preview`). */
export interface SplitPreviewParams {
  calendar_id: string;
  other_venue_id: string;
  services_rate_percent: number;
  products_rate_percent: number | null;
  vat_basis: CommissionBasis;
}

// ---------------------------------------------------------------------------------------------
// Business split figures: GET /api/venue/commission/splits/report
// ---------------------------------------------------------------------------------------------

export interface SplitReportRow {
  split_id: string;
  label: SplitLabel;
  role: 'payer' | 'payee';
  status: SplitStatus;
  payer: SplitParty;
  payee: SplitParty;
  partner: SplitParty;
  calendar: { id: string; name: string };
  services_pence: number;
  services_owed_pence: number;
  products_pence: number;
  products_owed_pence: number;
  owed_pence: number;
  /** What the payer keeps: counted revenue less the share. */
  kept_pence: number;
  /** The accepted versions in force at some point in the range. */
  rates: { effective_from: string; services_rate_bps: number; products_rate_bps: number | null }[];
  vat_basis: CommissionBasis;
  vat_note: boolean;
}

export interface SplitLine {
  kind: 'booking' | 'sale' | 'refund';
  date: string;
  time: string | null;
  item_type: 'service' | 'product';
  item_name: string;
  sale_number: number | null;
  base_pence: number;
  rate_bps: number;
  owed_pence: number;
}

export interface SplitReportResponse {
  from: string;
  to: string;
  preset: string | null;
  today: string;
  currency: string;
  rows: SplitReportRow[];
  totals: { you_owe_pence: number; owed_to_you_pence: number };
  by_business: { venue_id: string; name: string; you_owe_pence: number; owed_to_you_pence: number }[];
  /** With `split=<id>`: that split's lines in the range. */
  lines: SplitLine[] | null;
  can_export: boolean;
}

// ---------------------------------------------------------------------------------------------
// Statements and "Mark as paid": /api/venue/commission/splits/[id]/statements, .../settlements
// ---------------------------------------------------------------------------------------------

export interface SplitSettlementView {
  id: string;
  amount_pence: number;
  note: string | null;
  marked_at: string;
  marked_by_you: boolean;
  marked_by_name: string;
  /** True when the figures for the period have changed since it was marked paid. */
  changed: boolean;
}

export interface SplitPeriodView {
  start: string;
  end: string;
  /** `current`: still running, cannot be marked paid yet. */
  status: 'current' | 'outstanding' | 'paid' | 'nothing_owed';
  services_pence: number;
  products_pence: number;
  owed_pence: number;
  settlement: SplitSettlementView | null;
}

export interface SplitStatementsResponse {
  split: SplitView;
  periods: SplitPeriodView[];
  /** Owed for closed periods not yet marked paid. */
  outstanding_pence: number;
  paid_pence: number;
  currency: string;
  vat_note: boolean;
}

export interface SplitSettlementBody {
  period_start: string;
  note?: string | null;
}
