/**
 * What this phone tells the web it can do with a card, on every push registration
 * (`POST /api/v1/me/devices`; POS plan §4.36 "Who is told", E.5; UX spec §23.2).
 *
 * The web sends a sale from its till only to devices whose latest registration carries a
 * `client_build` with app step 2 and:
 * - `card_capability: 'tap_to_pay'` with `tap_to_pay_terms_accepted: true`: a phone that can use
 *   Tap to Pay, with Apple's terms accepted for the business (on Android there is no terms step,
 *   so a capable Android phone counts as accepted); or
 * - `card_capability: 'wisepad'`: a phone paired with a Bluetooth WisePad 3.
 *
 * An iPad never reports `tap_to_pay` (Apple's rule, and `buildSupportsTapToPay` already says no
 * there), so a request never reaches one for Tap to Pay. A phone at a venue without POS, without
 * card payments in person, or a login without `take_payment` reports `none`: it is never offered.
 *
 * Pure, so the rules are tested without a device.
 */

export type CardCapability = 'tap_to_pay' | 'wisepad' | 'none';

export interface DeviceCardReport {
  card_capability: CardCapability;
  /** Only meaningful with `tap_to_pay`; null when unknown or not relevant. */
  tap_to_pay_terms_accepted: boolean | null;
}

export interface CardCapabilityInput {
  /**
   * Card in the app is available here: POS on, the venue takes cards in person
   * (`card_methods.card_app`), this login may take payments, and the build has the Terminal SDK.
   */
  cardAppAvailable: boolean;
  platform: string;
  /** `buildSupportsTapToPay()`: never on an iPad, iPhone XS or later on iOS. */
  tapToPayBuild: boolean;
  /** What the Tap to Pay probe said on this phone (iOS warm-up); null when not known. */
  tapToPaySupported: boolean | null;
  /** iOS: Apple's terms accepted for this business (from the warm-up); null when not known. */
  termsAccepted: boolean | null;
  /** A Bluetooth WisePad 3 is remembered for this venue on this phone. */
  wisepadRemembered: boolean;
}

export const NO_CARD: DeviceCardReport = { card_capability: 'none', tap_to_pay_terms_accepted: null };

export function cardCapabilityFor(input: CardCapabilityInput): DeviceCardReport {
  if (!input.cardAppAvailable) return NO_CARD;
  const phone = input.platform === 'ios' || input.platform === 'android';
  const tapToPay = phone && input.tapToPayBuild && input.tapToPaySupported !== false;
  // Android has no terms step for Tap to Pay; on iOS only Apple's own answer counts.
  const terms = input.platform === 'android' ? true : input.termsAccepted === true;
  if (tapToPay && terms) return { card_capability: 'tap_to_pay', tap_to_pay_terms_accepted: true };
  if (input.wisepadRemembered) return { card_capability: 'wisepad', tap_to_pay_terms_accepted: tapToPay ? terms : null };
  if (tapToPay) return { card_capability: 'tap_to_pay', tap_to_pay_terms_accepted: false };
  return NO_CARD;
}

export function sameCardReport(a: DeviceCardReport | null, b: DeviceCardReport | null): boolean {
  if (!a || !b) return a === b;
  return a.card_capability === b.card_capability && a.tap_to_pay_terms_accepted === b.tap_to_pay_terms_accepted;
}
