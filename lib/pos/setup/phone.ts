/**
 * "Get this phone ready" (design 6.6, drawn as C4): whether this phone can take cards, and whether
 * the server has seen it register as ready. Pure, so the rules are tested without a device.
 *
 * The device check follows the requirements the plan checked against Stripe (Docs/pos-retail-plan.md
 * §4.22 and the design's `setup.cards.phone.devices`): Tap to Pay on iPhone needs an iPhone XS or
 * newer, never an iPad, on an iOS new enough for it; Tap to Pay on Android needs Android 13 or
 * newer and contactless (NFC). The app cannot see the NFC chip itself, so an Android phone on 13 or
 * newer is told it can take cards "if it has contactless (NFC)".
 */

/** Android 13 is API level 33. */
export const ANDROID_TAP_TO_PAY_MIN_API = 33;

export type PhoneCheck =
  | 'iphone_ok'
  | 'android_ok'
  /** An iPhone older than the XS. */
  | 'iphone_old'
  | 'ipad'
  /** Android 12 or older. */
  | 'android_old'
  /** iOS must be updated first (the Tap to Pay probe said so). */
  | 'ios_update'
  /** Web, or anything that is not a phone. */
  | 'other';

export interface PhoneFacts {
  platform: string;
  isPad: boolean;
  /** `buildSupportsTapToPay()`: the entitled build on an iPhone XS or later (always true off iOS). */
  buildSupports: boolean;
  /** The Tap to Pay probe on iOS (`useTapToPay().supported`); null when not known. */
  probeSupported: boolean | null;
  /** The probe said iOS is too old (`useTapToPay().updateRequired`). */
  updateRequired: boolean;
  /** Android's API level (`Platform.Version` there); null elsewhere. */
  androidApiLevel: number | null;
}

export function phoneCheck(facts: PhoneFacts): PhoneCheck {
  if (facts.platform === 'ios') {
    if (facts.isPad) return 'ipad';
    if (facts.updateRequired) return 'ios_update';
    if (!facts.buildSupports || facts.probeSupported === false) return 'iphone_old';
    return 'iphone_ok';
  }
  if (facts.platform === 'android') {
    if (facts.androidApiLevel !== null && facts.androidApiLevel < ANDROID_TAP_TO_PAY_MIN_API) return 'android_old';
    return 'android_ok';
  }
  return 'other';
}

export function phoneCanTakeCards(check: PhoneCheck): boolean {
  return check === 'iphone_ok' || check === 'android_ok';
}

/** Android's API level from `Platform.Version` (a number there); null on any other platform. */
export function androidApiLevel(platform: string, version: string | number): number | null {
  if (platform !== 'android') return null;
  const n = typeof version === 'number' ? version : Number.parseInt(String(version), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * `GET /api/venue/pos/collect-phones`: the team members who can take a card on a phone right now
 * (their latest registration carries the POS app step and can take cards: Tap to Pay with Apple's
 * terms accepted, or a Bluetooth reader), with `can_take_cards` false until Stripe and card
 * payments in person are on.
 */
export type CollectDeviceKind = 'iphone' | 'android' | 'wisepad';

export interface PosCollectPhone {
  staff_id: string;
  name: string;
  devices: CollectDeviceKind[];
  last_seen_at?: string | null;
}

export interface PosCollectPhonesResponse {
  phones: PosCollectPhone[];
  can_take_cards: boolean;
}

/** This phone's kind in that list. */
export function thisPhoneKind(platform: string): CollectDeviceKind | null {
  return platform === 'ios' ? 'iphone' : platform === 'android' ? 'android' : null;
}

/**
 * The tick: the server lists this person with a device of this phone's kind (a phone of the same
 * kind they own counts too; the list carries nothing that tells two of them apart).
 */
export function thisPhoneRegistered(
  res: PosCollectPhonesResponse | null | undefined,
  staffId: string | null | undefined,
  platform: string,
): boolean {
  const kind = thisPhoneKind(platform);
  if (!res?.can_take_cards || !staffId || !kind) return false;
  return res.phones.some((p) => p.staff_id === staffId && p.devices.includes(kind));
}
