import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { getStripePublishableKey } from '@/lib/env';
import { hasRememberedBluetoothReader } from '@/lib/payments/bluetoothReader';
import { buildSupportsTapToPay } from '@/lib/payments/tap-to-pay-build-support';
import { isTerminalSdkAvailable } from '@/lib/payments/terminal-sdk';
import { cardCapabilityFor, NO_CARD } from '@/lib/pos/card-capability';
import { cardAppAvailable } from '@/lib/pos/pos-enabled';
import { reportDeviceCardCapability } from '@/lib/push/registerDevice';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { usePosBootstrap, usePosEnabled } from '@/lib/queries/usePos';
import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';
import { useTapToPay } from '@/providers/TapToPayProvider';

/**
 * Tells the web, through the push registration, whether this phone can take a card for a sale sent
 * from the web till (POS app step 2, plan §4.36 "Who is told"; `lib/pos/card-capability.ts`).
 *
 * Renders nothing. Mounted once in the staff stack. At a venue without POS it reports `none` and
 * asks nothing of the POS API (the bootstrap query is gated on the POS switch). Re-reports when the
 * answer changes: Apple's terms accepted, a Bluetooth reader paired, the venue switched, or the app
 * coming back to the foreground (a reader may have been paired or forgotten meanwhile). The report
 * itself only sends when it differs from what the last registration carried.
 */
export function CardCapabilityReporter(): null {
  const accessToken = useAccessToken();
  const posEnabled = usePosEnabled();
  const boot = usePosBootstrap({ enabled: posEnabled });
  const tapToPay = useTapToPay();
  const { ownerVenueId } = useLinkedVenueContext();
  const [wisepad, setWisepad] = useState(false);
  const [foregrounds, setForegrounds] = useState(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForegrounds((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let alive = true;
    void hasRememberedBluetoothReader(ownerVenueId ?? null).then((found) => {
      if (alive) setWisepad(found);
    });
    return () => {
      alive = false;
    };
  }, [ownerVenueId, foregrounds]);

  const available =
    posEnabled &&
    cardAppAvailable({
      bootstrap: boot.data,
      terminalAvailable: isTerminalSdkAvailable(),
      publishableKey: Boolean(getStripePublishableKey()),
    });
  const report = available
    ? cardCapabilityFor({
        cardAppAvailable: true,
        platform: Platform.OS,
        tapToPayBuild: buildSupportsTapToPay(),
        // iOS knows from the warm-up (TapToPayProvider); Android's SDK answers only on connect.
        tapToPaySupported: Platform.OS === 'ios' ? (tapToPay.applies ? tapToPay.supported : false) : null,
        termsAccepted: Platform.OS === 'ios' ? tapToPay.termsAccepted : null,
        wisepadRemembered: wisepad,
      })
    : NO_CARD;
  const { card_capability: capability, tap_to_pay_terms_accepted: terms } = report;

  useEffect(() => {
    // Wait for the bootstrap at a POS venue, so a first "none" is never sent by mistake.
    if (posEnabled && boot.isLoading) return;
    void reportDeviceCardCapability(accessToken, { card_capability: capability, tap_to_pay_terms_accepted: terms });
  }, [accessToken, posEnabled, boot.isLoading, capability, terms, foregrounds]);

  return null;
}
