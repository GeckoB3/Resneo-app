import { subscriptionPurchasesMustUseWeb } from '@/lib/billing/store-billing-policy';

/**
 * Reader-app posture: native app-store builds (iOS/Android) must route ResNeo
 * subscription purchases and plan changes to the web dashboard; web (and any
 * future non-store platform) keeps the in-app flow. This guards against
 * re-enabling in-app subscription sales on native, which would breach Apple
 * Guideline 3.1.1 / Google Play Billing.
 */
describe('subscriptionPurchasesMustUseWeb', () => {
  it('routes subscription changes to the web on native app-store platforms', () => {
    expect(subscriptionPurchasesMustUseWeb('ios')).toBe(true);
    expect(subscriptionPurchasesMustUseWeb('android')).toBe(true);
  });

  it('keeps the in-app flow where there is no app-store intermediary', () => {
    expect(subscriptionPurchasesMustUseWeb('web')).toBe(false);
    // Future desktop targets are not app-store storefronts either.
    expect(subscriptionPurchasesMustUseWeb('macos')).toBe(false);
    expect(subscriptionPurchasesMustUseWeb('windows')).toBe(false);
  });
});
