import { PhoneReadyScreen } from '@/components/pos/setup/PhoneReadyScreen';

/**
 * "Get this phone ready" (POS Part 4, design 6.6, drawn as C4): `/checkout-setup/phone`, from W3 and
 * from "Take cards on your phone" on the set-up card.
 */
export default function CheckoutSetupPhoneRoute() {
  return <PhoneReadyScreen />;
}
