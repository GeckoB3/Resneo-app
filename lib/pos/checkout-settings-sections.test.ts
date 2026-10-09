/**
 * The Checkout settings hub's rows are gated exactly as the web shows its cards
 * (`CheckoutSettingsSection.tsx`), in the web's order.
 */
import {
  CHECKOUT_SETTINGS_SECTIONS,
  canOpenCheckoutSettings,
  checkoutSettingsHref,
  visibleCheckoutSettingsSections,
  type CheckoutSettingsGateInput,
} from '@/lib/pos/checkout-settings-sections';

function input(over: Partial<CheckoutSettingsGateInput> = {}): CheckoutSettingsGateInput {
  return {
    can: { is_admin: false, manage_settings: true, edit_capabilities: false },
    staffCapabilityMap: {},
    trackStockEnabled: false,
    vouchersEnabled: false,
    loyaltyEnabled: false,
    shopEnabled: false,
    ...over,
  };
}

const slugs = (i: CheckoutSettingsGateInput) => visibleCheckoutSettingsSections(i).map((s) => s.slug);

describe('visibleCheckoutSettingsSections', () => {
  it('shows a team member with manage_settings the cards every login sees', () => {
    expect(slugs(input())).toEqual(['features', 'business', 'receipts', 'tips', 'discounts', 'payment-types', 'cards-on-file', 'tills', 'cash']);
  });

  it('shows an admin with every switch on every card, in the web order', () => {
    const admin = input({
      can: { is_admin: true, manage_settings: true, edit_capabilities: true },
      trackStockEnabled: true,
      vouchersEnabled: true,
      loyaltyEnabled: true,
      shopEnabled: true,
    });
    expect(slugs(admin)).toEqual([
      'features',
      'business',
      'receipts',
      'tips',
      'discounts',
      'payment-types',
      'cards-on-file',
      'gift-vouchers',
      'loyalty',
      'commission',
      'permissions',
      'tills',
      'card-readers',
      'cash',
      'stock',
      'shop',
    ]);
  });

  it('keeps vouchers, loyalty, commission, permissions and the shop to admins', () => {
    const shown = slugs(input({ vouchersEnabled: true, loyaltyEnabled: true, shopEnabled: true }));
    for (const slug of ['gift-vouchers', 'loyalty', 'shop', 'commission', 'permissions']) expect(shown).not.toContain(slug);
  });

  it('hides switched-off features from admins', () => {
    const shown = slugs(input({ can: { is_admin: true, manage_settings: true, edit_capabilities: true } }));
    for (const slug of ['gift-vouchers', 'loyalty', 'shop', 'stock']) expect(shown).not.toContain(slug);
    expect(shown).toContain('commission');
  });

  it('shows card readers to staff only when the team may manage readers', () => {
    expect(slugs(input({ staffCapabilityMap: { manage_readers: true } }))).toContain('card-readers');
    expect(slugs(input({ staffCapabilityMap: { manage_readers: false } }))).not.toContain('card-readers');
  });

  it('shows Stock to anyone while Track stock is on', () => {
    expect(slugs(input({ trackStockEnabled: true }))).toContain('stock');
  });

  it('gives every row a route under /checkout-settings', () => {
    for (const s of CHECKOUT_SETTINGS_SECTIONS) expect(checkoutSettingsHref(s.slug)).toBe(`/checkout-settings/${s.slug}`);
  });
});

describe('canOpenCheckoutSettings', () => {
  it('lets admins and manage_settings in, and nobody else', () => {
    expect(canOpenCheckoutSettings({ is_admin: true, manage_settings: false })).toBe(true);
    expect(canOpenCheckoutSettings({ is_admin: false, manage_settings: true })).toBe(true);
    expect(canOpenCheckoutSettings({ is_admin: false, manage_settings: false })).toBe(false);
    expect(canOpenCheckoutSettings(null)).toBe(false);
  });
});
