import type { StripeError } from '@stripe/stripe-terminal-react-native';
import { Platform } from 'react-native';

import { LOCATION_REFUSED_MESSAGE } from '@/lib/payments/card-present-permissions';
import { TAP_TO_PAY_ON_IPHONE } from '@/lib/payments/tap-to-pay-copy';

/**
 * Why a Tap to Pay connect failed, where the reason changes what staff are told.
 *
 * The pinned SDK (`0.0.1-beta.33`) folds every Apple terms-of-service failure into
 * generic codes on iOS — `READER_SOFTWARE_UPDATE_FAILED` for "not yet accepted",
 * "needs iCloud" and "acceptance failed", `CANCELED` for "staff dismissed Apple's
 * sheet" — so the code alone cannot tell them apart. The native `SCPError` number
 * survives in `nativeErrorCode`, and that is what is matched here (values from
 * `StripeTerminal.framework/Headers/SCPErrors.h`).
 *
 *  - `terms_not_accepted` (3930): the Tap to Pay on iPhone terms have not been
 *    accepted for this merchant, and this connect was not allowed to show them
 *    (`tosAcceptancePermitted: false` — the launch warm-up, or a non-admin).
 *  - `terms_cancelled` (2970): Apple's terms sheet was dismissed.
 *  - `icloud_required` (2960): no Apple Account is signed in on the phone.
 *  - `terms_failed` (3940): Apple refused the signed-in Apple Account.
 *  - `permission_needed`: location permission is missing and this connect was not
 *    allowed to ask for it (the silent warm-up). Set by the hook, not the SDK.
 *  - `os_update_required`: Apple's `PaymentCardReaderError.osVersionNotSupported`
 *    — this iOS is too old for Tap to Pay on iPhone here. Apple requires the app
 *    to tell the merchant to update iOS (checklist 1.4). See
 *    `isOsVersionNotSupported` for how it arrives.
 */
export type TapToPayFailureReason =
  | 'terms_not_accepted'
  | 'terms_cancelled'
  | 'icloud_required'
  | 'terms_failed'
  | 'permission_needed'
  | 'os_update_required';

const NATIVE_REASONS: Record<string, TapToPayFailureReason> = {
  '3930': 'terms_not_accepted',
  '2970': 'terms_cancelled',
  '2960': 'icloud_required',
  '3940': 'terms_failed',
};

/**
 * Stripe's `TapToPayReaderErrorCode.osVersionNotSupported` (7), its superset of
 * Apple's ProximityReader errors, in Stripe's own error domain
 * (`SCPTapToPayReaderErrorDomain`). How it reaches JS depends on how Stripe
 * wrapped it, so all three shapes are accepted:
 *  - wrapped in an SCPError: the bridge surfaces it as `underlyingError`;
 *  - unwrapped: a non-Stripe error whose `nativeErrorCode` is "domain:code";
 *  - Stripe's own wording, as a last resort.
 */
const TAP_TO_PAY_OS_VERSION_CODE = '7';
const TAP_TO_PAY_DOMAIN = /TapToPayReaderError/i;

export function isOsVersionNotSupported(
  error:
    | (Partial<Pick<StripeError, 'nativeErrorCode' | 'message'>> & {
        underlyingError?: { code?: string; iosDomain?: string } | null;
      })
    | null
    | undefined,
): boolean {
  if (!error) return false;
  const underlying = error.underlyingError;
  if (
    underlying &&
    String(underlying.code) === TAP_TO_PAY_OS_VERSION_CODE &&
    TAP_TO_PAY_DOMAIN.test(underlying.iosDomain ?? '')
  ) {
    return true;
  }
  const native = String(error.nativeErrorCode ?? '');
  if (TAP_TO_PAY_DOMAIN.test(native) && native.endsWith(`:${TAP_TO_PAY_OS_VERSION_CODE}`)) {
    return true;
  }
  return /\bOS version\b[^.]*\bnot supported\b/i.test(error.message ?? '');
}

/** The reason behind a Tap to Pay connect error, or null for anything else. */
export function classifyTapToPayError(
  error:
    | (Pick<StripeError, 'nativeErrorCode'> &
        Partial<Pick<StripeError, 'message'>> & {
          underlyingError?: { code?: string; iosDomain?: string } | null;
        })
    | null
    | undefined,
): TapToPayFailureReason | null {
  if (isOsVersionNotSupported(error)) return 'os_update_required';
  const native = error?.nativeErrorCode;
  if (typeof native !== 'string' && typeof native !== 'number') return null;
  return NATIVE_REASONS[String(native).trim()] ?? null;
}

/**
 * Apple: before iOS 17.6, Tap to Pay on iPhone can answer "OS version not
 * supported" (checklist 1.4). Stripe's support probe may then just say "no",
 * which on its own would hide the option with no explanation — so below this
 * version a "no" is read as "update iOS" rather than "this iPhone can't".
 */
export const TAP_TO_PAY_UPDATE_BELOW_IOS: readonly [number, number] = [17, 6];

/** True on iOS earlier than `TAP_TO_PAY_UPDATE_BELOW_IOS`. */
export function iosOlderThanTapToPayFloor(
  platform: string = Platform.OS,
  version: string | number = Platform.Version,
): boolean {
  if (platform !== 'ios') return false;
  const [major = 0, minor = 0] = String(version)
    .split('.')
    .map((p) => Number.parseInt(p, 10) || 0);
  const [floorMajor, floorMinor] = TAP_TO_PAY_UPDATE_BELOW_IOS;
  return major < floorMajor || (major === floorMajor && minor < floorMinor);
}

/**
 * What staff are told for each reason. `isAdmin` matters only for "not yet
 * accepted": Apple requires that only an admin can accept the terms, and that
 * everyone else is told to ask one (checklist 3.8 / 3.8.1).
 */
export function tapToPayFailureMessage(reason: TapToPayFailureReason, isAdmin: boolean): string {
  switch (reason) {
    case 'terms_not_accepted':
      return isAdmin
        ? `${TAP_TO_PAY_ON_IPHONE} is not turned on yet. Turn it on to accept Apple's terms and take the payment.`
        : `${TAP_TO_PAY_ON_IPHONE} is not turned on for your venue yet. Ask an admin to turn it on in Settings. Only an admin can accept Apple's terms.`;
    case 'terms_cancelled':
      return `${TAP_TO_PAY_ON_IPHONE} was not turned on, because Apple's terms were not accepted.`;
    case 'icloud_required':
      return `Sign in with your Apple Account in the iPhone Settings app, then try again. Apple needs it to turn on ${TAP_TO_PAY_ON_IPHONE}.`;
    case 'terms_failed':
      return `Apple could not accept the ${TAP_TO_PAY_ON_IPHONE} terms with the Apple Account on this iPhone. Check the account in the Settings app, then try again.`;
    case 'permission_needed':
      return LOCATION_REFUSED_MESSAGE;
    case 'os_update_required':
      return TAP_TO_PAY_UPDATE_IOS_MESSAGE;
  }
}

/** Apple 1.4 / HIG: recommend updating to the latest iOS, and say where. */
export const TAP_TO_PAY_UPDATE_IOS_MESSAGE = `${TAP_TO_PAY_ON_IPHONE} needs a newer version of iOS. Update this iPhone to the latest iOS in Settings → General → Software Update, then try again.`;
