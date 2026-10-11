import { useLocalSearchParams } from 'expo-router';

import { SetupWizardScreen } from '@/components/pos/setup/SetupWizard';
import { isSetupScreen } from '@/lib/pos/setup/flow';
import { parseMissedExtras } from '@/lib/pos/switches/model';

/**
 * One screen of the Checkout set-up wizard (POS Part 4): `/checkout-setup/<screen>`, the app's
 * `/dashboard/checkout/setup?step=<screen>`. Opened by switching Checkout on (W0, with `?missed=`
 * naming an extra that did not come on), from the set-up card on Today and in Checkout settings,
 * and by each screen's Continue. An unknown screen opens the welcome.
 */
export default function CheckoutSetupStepRoute() {
  const params = useLocalSearchParams<{ step?: string; missed?: string }>();
  const screen = isSetupScreen(params.step) ? params.step : 'welcome';
  return <SetupWizardScreen screen={screen} missed={parseMissedExtras(params.missed)} />;
}
