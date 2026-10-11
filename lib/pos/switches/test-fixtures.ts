import type {
  PosFeatureSwitchesResponse,
  PosSwitchInUse,
  PosSwitchKey,
  PosSwitchView,
} from '@/types/pos-switches';

/**
 * Test fixtures for the switch screens: a `GET /api/venue/feature-switches` answer built from small
 * overrides. Test code only (imported by `*.test.ts(x)` files).
 */

export function view(key: PosSwitchKey, over: Partial<PosSwitchView> = {}): PosSwitchView {
  return {
    key,
    effective: false,
    venue_choice: false,
    platform_state: 'invited',
    public_reason: null,
    offered: true,
    can_switch_on: true,
    unavailable_reason: null,
    set_at: null,
    set_by_name: null,
    version: 1,
    ...over,
  };
}

export const NOTHING_IN_USE: PosSwitchInUse = {
  blocking: [],
  till_open: false,
  open_sales: 0,
  part_paid_sales: 0,
  unpaid_pay_links: 0,
  pay_links_last_expires_at: null,
  unfinished_orders: 0,
  stored_value_count: 0,
  stored_value_outstanding_pence: 0,
  rewards_waiting: 0,
};

export function switchesResponse(
  over: {
    switches?: Partial<Record<PosSwitchKey, Partial<PosSwitchView>>>;
    in_use?: Partial<PosSwitchInUse>;
  } & Partial<Omit<PosFeatureSwitchesResponse, 'switches' | 'in_use'>> = {},
): PosFeatureSwitchesResponse {
  const { switches, in_use, ...rest } = over;
  return {
    venue: { name: 'Bloom Hair Studio', currency: 'GBP', collective_name: null },
    terms_version: '2026-10-11',
    terms_accepted: false,
    environment_off: false,
    prerequisites: { stripe_connected: false, stripe_charges_enabled: false, in_person_payments_enabled: false },
    history: [],
    ...rest,
    switches: {
      pos_enabled: view('pos_enabled', switches?.pos_enabled),
      pos_gift_vouchers_enabled: view('pos_gift_vouchers_enabled', switches?.pos_gift_vouchers_enabled),
      pos_loyalty_enabled: view('pos_loyalty_enabled', switches?.pos_loyalty_enabled),
      pos_online_shop_enabled: view('pos_online_shop_enabled', { offered: false, can_switch_on: false, unavailable_reason: 'not_offered', ...switches?.pos_online_shop_enabled }),
    },
    in_use: { ...NOTHING_IN_USE, ...in_use },
  };
}

/** The same venue with Checkout on (and its extras as given). */
export function onResponse(over: Parameters<typeof switchesResponse>[0] = {}): PosFeatureSwitchesResponse {
  return switchesResponse({
    terms_accepted: true,
    ...over,
    switches: {
      ...over.switches,
      pos_enabled: {
        effective: true,
        venue_choice: true,
        can_switch_on: false,
        set_by_name: 'Sam Taylor',
        set_at: '2026-10-11T09:04:00Z',
        version: 2,
        ...over.switches?.pos_enabled,
      },
    },
  });
}
