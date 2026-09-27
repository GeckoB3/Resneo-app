import { Platform } from 'react-native';

/**
 * Apple's name for the feature. Its Tap to Pay on iPhone marketing guidelines
 * require it verbatim, never shortened or altered (checklist 1.9, 5.4).
 */
export const TAP_TO_PAY_ON_IPHONE = 'Tap to Pay on iPhone';

/**
 * The only symbols Apple allows on the Tap to Pay button (checklist 5.5): SF
 * Symbols `wave.3.right.circle` or its `.fill` variant.
 */
export const TAP_TO_PAY_SYMBOL = {
  ios: 'wave.3.right.circle',
  android: 'contactless',
  web: 'contactless',
} as const;

/** The Tap to Pay button's label: Apple's wording on iOS, unchanged elsewhere. */
export function tapToPayButtonLabel(platform: string = Platform.OS): string {
  return platform === 'ios' ? TAP_TO_PAY_ON_IPHONE : 'Tap to Pay on this phone';
}
