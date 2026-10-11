import type { PosSetupStatus, PosSetupStepId, PosSetupStepView } from '@/types/pos-setup';
import type { PosCheckoutSettings, PosSettingsResponse } from '@/types/pos-settings';

/**
 * Test fixtures for the set-up screens: a `GET /api/venue/pos/setup-status` answer, Checkout's
 * settings and the venue, each built from small overrides. Test code only (imported by
 * `*.test.ts(x)` files).
 */

const STEP_IDS: PosSetupStepId[] = ['cards', 'tips', 'details', 'team', 'products', 'vouchers', 'loyalty', 'shop', 'practice'];

/** Every step to do; a team and the extras do not apply unless said. */
export function setupSteps(over: Partial<Record<PosSetupStepId, Partial<PosSetupStepView>>> = {}): PosSetupStepView[] {
  return STEP_IDS.map((id) => ({
    id,
    applies: !['team', 'vouchers', 'loyalty', 'shop'].includes(id),
    state: 'todo',
    ...over[id],
  }));
}

export function setupStatus(over: Partial<PosSetupStatus> = {}): PosSetupStatus {
  const steps = over.steps ?? setupSteps();
  const applying = steps.filter((s) => s.applies);
  return {
    started_at: '2026-10-11T09:00:00Z',
    finished_at: null,
    steps,
    done: applying.filter((s) => s.state === 'done').length,
    total: applying.length,
    answers: {},
    next_screen: 'use',
    phones: { ready: [], needs_update: [] },
    card_hidden: false,
    show_card: true,
    version: 3,
    ...over,
  };
}

export function setupSettings(
  over: Partial<PosCheckoutSettings> = {},
  can: PosSettingsResponse['can'] = { is_admin: true, manage_settings: true, edit_capabilities: true },
): PosSettingsResponse {
  return {
    settings: {
      legal_name: null,
      trading_name: null,
      company_number: null,
      vat_registered: false,
      vat_number: null,
      business_address: null,
      registered_office_address: null,
      company_registered_in: null,
      public_contact_email: null,
      public_contact_phone: null,
      business_country: 'GB',
      jurisdiction: 'gb',
      default_service_tax_category: 'standard',
      default_product_tax_category: 'standard',
      receipt_prefix: null,
      receipt_footer: null,
      receipt_auto_send: 'ask',
      tipping_enabled: false,
      tip_percent_presets: [10, 15, 20],
      tip_amount_presets: [100, 200, 300],
      smart_tip_threshold_pence: 1000,
      tip_custom_allowed: true,
      tip_base: 'services',
      tip_allocation_rule: 'pro_rata_services',
      tipping_policy: null,
      tips_mode: 'gb',
      staff_max_discount_percent: 10,
      discount_reason_required: true,
      discount_reasons: ['Staff'],
      discount_free_text_allowed: false,
      refund_reasons: ['Goodwill'],
      void_reasons: ['Duplicate'],
      cash_management_enabled: false,
      track_stock_enabled: false,
      multiple_tills_enabled: false,
      sell_products_enabled: true,
      max_payment_pence: 1_000_000,
      default_float_pence: 0,
      staff_capabilities: {},
      version: 7,
      ...over,
    },
    staff_capability_map: { create_sale: true, take_payment: true, refund: false, override_price: false },
    capability_defaults: { create_sale: true, take_payment: true, refund: false, override_price: false },
    can,
    venue: { name: 'Bloom Hair Studio', currency: 'GBP', timezone: 'Europe/London' },
  };
}

export function setupVenue(over: Record<string, unknown> = {}) {
  const { resolved, ...rest } = over as { resolved?: Record<string, boolean> };
  return {
    id: 'venue-1',
    name: 'Bloom Hair Studio',
    address: 'Bloom Hair Studio, 12 Market Street, Newtown, NT1 2AB',
    email: 'hello@bloom.example',
    phone: '+441632960123',
    currency: 'GBP',
    timezone: 'Europe/London',
    current_user_role: 'admin',
    in_person_payments_enabled: false,
    stripe_connected_account_id: 'acct_1',
    feature_flags: { raw: { pos_enabled: true }, resolved: { pos_enabled: true, ...resolved } },
    ...rest,
  };
}
