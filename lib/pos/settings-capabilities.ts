import type { PosSettingsCapabilityMap } from '@/types/pos-settings';

/**
 * Team permissions (web: `src/app/dashboard/settings/checkout/capability-groups.ts`, UX spec §9.7):
 * the full map in the spec's groups with the web's labels, and the two presets. Capabilities the
 * web leaves out of the grid keep their stored values on save, because a save sends the whole map.
 */

export interface CapabilityItem {
  key: string;
  label: string;
  help?: string;
}

export interface CapabilityGroup {
  id: string;
  title: string;
  items: CapabilityItem[];
  note?: 'alwaysAdmin';
}

export function capabilityGroups(words: { client: string }): CapabilityGroup[] {
  return [
    {
      id: 'selling',
      title: 'Selling',
      items: [
        { key: 'create_sale', label: 'Start sales and check out bookings' },
        { key: 'take_payment', label: 'Take payments' },
        { key: 'park_sale', label: 'Park sales' },
        { key: 'apply_discount', label: 'Give discounts up to the team limit' },
        { key: 'override_price', label: 'Change prices' },
        { key: 'custom_line', label: 'Add custom items and fees' },
        { key: 'void_open_sale', label: 'Void open sales they started' },
      ],
    },
    {
      id: 'money',
      title: 'Refunds and tips',
      note: 'alwaysAdmin',
      items: [
        {
          key: 'refund',
          label: 'Give refunds',
          help: 'Refunds send money back. Most venues keep this for admins. Team members without it can see what was paid, and an admin gives the refund.',
        },
        {
          key: 'charge_saved_card',
          label: `Charge a ${words.client}'s saved card when they're not here`,
          help: `The ${words.client} is sent a receipt straight away. Most venues keep this for admins.`,
        },
        { key: 'edit_tips', label: 'Change tip splits after a sale' },
        { key: 'edit_credit', label: 'Change who gets credit after a sale' },
        {
          key: 'manage_vouchers',
          label: 'Manage gift vouchers',
          help: 'Add vouchers sold before ResNeo and account credit, and extend, resend or cancel vouchers.',
        },
        { key: 'adjust_loyalty', label: 'Add or remove loyalty stamps' },
      ],
    },
    {
      id: 'cash',
      title: 'Cash',
      items: [
        { key: 'open_close_till', label: 'Open and close the till' },
        { key: 'paid_in_out', label: 'Record paid in, paid out, safe drops and tips paid out' },
        { key: 'see_expected_cash', label: 'See the expected cash when counting', help: 'Leave this off to keep cash counts blind.' },
      ],
    },
    {
      id: 'stock',
      title: 'Products and stock',
      items: [
        { key: 'manage_products', label: 'Add and edit products' },
        { key: 'import_products', label: 'Import products' },
        { key: 'adjust_stock', label: 'Adjust stock' },
        { key: 'count_stock', label: 'Count stock' },
        { key: 'commit_stocktake', label: 'Finish stocktakes' },
        { key: 'receive_stock', label: 'Receive deliveries' },
        { key: 'record_professional_use', label: 'Record products used in treatments' },
        { key: 'manage_suppliers', label: 'Manage suppliers' },
        { key: 'manage_purchase_orders', label: 'Draft and send purchase orders' },
      ],
    },
    {
      id: 'orders',
      title: 'Online orders',
      items: [{ key: 'manage_orders', label: 'Manage online orders' }],
    },
    {
      id: 'admin',
      title: 'Settings and reports',
      items: [
        { key: 'manage_readers', label: 'Manage card readers' },
        {
          key: 'manage_settings',
          label: 'Change checkout settings',
          help: 'Lets team members change these Checkout settings, apart from team permissions, the online shop and promotions.',
        },
        { key: 'view_reports', label: 'See takings and sales reports' },
        { key: 'export', label: 'Export reports' },
        {
          key: 'see_own_commission',
          label: 'See their own commission',
          help: "Shows each person their own commission in My sales. They never see anyone else's.",
        },
      ],
    },
  ];
}

/** "Team member", the default: the server's defaults (served by the settings GET). */
export function teamPreset(defaults: PosSettingsCapabilityMap): PosSettingsCapabilityMap {
  return { ...defaults };
}

/** "Front desk": the team-member preset plus the money and stock extras (UX spec §9.7). */
export function frontDeskPreset(defaults: PosSettingsCapabilityMap): PosSettingsCapabilityMap {
  return {
    ...defaults,
    custom_line: true,
    override_price: true,
    refund: true,
    charge_saved_card: true,
    edit_tips: true,
    edit_credit: true,
    see_expected_cash: true,
    adjust_stock: true,
    manage_vouchers: true,
    adjust_loyalty: true,
  };
}

export type PresetId = 'team' | 'frontDesk';

export function presetMap(id: PresetId, defaults: PosSettingsCapabilityMap): PosSettingsCapabilityMap {
  return id === 'team' ? teamPreset(defaults) : frontDeskPreset(defaults);
}

/** Which preset the stored map is, or null for the venue's own mix. */
export function matchingPreset(map: PosSettingsCapabilityMap, defaults: PosSettingsCapabilityMap): PresetId | null {
  const same = (preset: PosSettingsCapabilityMap) => Object.keys(preset).every((k) => Boolean(map[k]) === Boolean(preset[k]));
  if (same(teamPreset(defaults))) return 'team';
  if (same(frontDeskPreset(defaults))) return 'frontDesk';
  return null;
}

/** True when the draft differs from the stored map on any key. */
export function capabilityMapChanged(draft: PosSettingsCapabilityMap, stored: PosSettingsCapabilityMap): boolean {
  return Object.keys(draft).some((k) => Boolean(draft[k]) !== Boolean(stored[k]));
}
