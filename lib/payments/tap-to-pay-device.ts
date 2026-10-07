import * as Device from 'expo-device';
import { Platform } from 'react-native';

/**
 * Can THIS DEVICE use Tap to Pay on iPhone at all?
 *
 * Apple: iPhone XS or later. Never an iPad, which has no Tap to Pay on iPhone.
 * The app is universal (and App Review often tests on an iPad), so this has to
 * be answered before anything about Tap to Pay is shown.
 *
 * Why not just ask the Stripe SDK: on iOS its support probe never answers a
 * plain "no". The pinned bridge (`0.0.1-beta.33`) resolves every failure as
 * `{ readerSupportResult: false, error }`, and the hook reads any error other
 * than "update iOS" as "unknown" so a passing glitch never hides the option on
 * a capable phone. Unknown counts as supported, so an iPad or an iPhone X was
 * offered a button that could only fail. The model is known for certain, so it
 * is checked here first and the SDK only ever sees eligible phones.
 *
 * `modelId` is Apple's hardware identifier: "iPhone11,2" is the XS, "iPhone11,8"
 * the XR, "iPhone10,6" the X. Every iPhone from the XS on has a major of 11 or
 * more. An identifier that is not an iPhone's (the simulator says "arm64" or
 * "x86_64") is left to the SDK, which simulates the reader there.
 *
 * Android is not decided here: the SDK's probe answers it properly.
 */
export const FIRST_TAP_TO_PAY_IPHONE_MAJOR = 11;

export type DeviceFacts = {
  platform: string;
  isPad: boolean;
  modelId: string | null;
};

export function currentDeviceFacts(): DeviceFacts {
  let modelId: string | null = null;
  try {
    modelId = typeof Device.modelId === 'string' ? Device.modelId : null;
  } catch {
    modelId = null;
  }
  return {
    platform: Platform.OS,
    isPad: Platform.OS === 'ios' && Boolean((Platform as { isPad?: boolean }).isPad),
    modelId,
  };
}

export function deviceCanUseTapToPay(facts: DeviceFacts = currentDeviceFacts()): boolean {
  if (facts.platform !== 'ios') return true;
  if (facts.isPad) return false;
  const model = /^(iPhone|iPad|iPod)(\d+),\d+$/.exec(facts.modelId ?? '');
  if (!model) return true;
  if (model[1] !== 'iPhone') return false;
  return Number.parseInt(model[2], 10) >= FIRST_TAP_TO_PAY_IPHONE_MAJOR;
}
