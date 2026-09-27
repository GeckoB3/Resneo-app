import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';

import { buildSupportsTapToPay } from '@/lib/payments/tap-to-pay-build-support';
import {
  useTapToPayReader,
  type TapToPayConnectResult,
} from '@/lib/payments/terminal';
import { getTerminalSdk } from '@/lib/payments/terminal-sdk';
import { showAppleTapToPayEducation } from '@/modules/tap-to-pay-education';
import { useVenueContext } from '@/providers/VenueProvider';

/**
 * Tap to Pay on iPhone, app-wide (Apple's Tap to Pay on iPhone checklist).
 *
 * Owns what Apple requires to happen OUTSIDE a payment:
 *  - preparing ("warming up") the phone's reader at launch and whenever the app
 *    returns to the foreground (1.5), so the Tap to Pay screen can appear within
 *    a second of the button being pressed (5.6);
 *  - knowing, from Apple rather than a stored flag (1.6), whether the terms have
 *    been accepted, so Settings can offer to turn it on (3.5, 3.6) and tell a
 *    non-admin to ask an admin (3.8.1);
 *  - the configuration progress Settings shows while it sets up (3.9.1).
 *
 * The warm-up is connect-with-no-side-effects: `tosAcceptancePermitted: false`
 * and `promptForPermissions: false`, so launching the app can never put Apple's
 * terms or a permission dialog on screen. It skips when any reader is already
 * connected — the phone's own (already warm) or a Bluetooth reader in use.
 *
 * iOS only, mounted inside `TerminalProvider`'s enabled branch. Everywhere else
 * the default value below applies: nothing to show, nothing to do.
 */

export type TapToPayContextValue = {
  /** Tap to Pay on iPhone applies here: iOS, an entitled build, and a venue ready for card payments. */
  applies: boolean;
  /** Only an admin may accept Apple's terms (3.8). */
  isAdmin: boolean;
  /** This iPhone can do Tap to Pay (XS or later); null = not known yet. */
  supported: boolean | null;
  /** iOS must be updated before Tap to Pay on iPhone can work here (1.4). */
  updateRequired: boolean;
  /** Apple's terms accepted for this merchant; null = not known yet. */
  termsAccepted: boolean | null;
  /** A connect (warm-up or turn-on) is running. */
  preparing: boolean;
  /** Configuration progress 0–1 while preparing, else null. */
  progress: number | null;
  /** The last failure worth showing, else null. */
  error: string | null;
  /**
   * Turn Tap to Pay on iPhone on: prepare the reader, showing Apple's terms when
   * they have not been accepted and this user is an admin. `acceptedTerms` in the
   * result tells the caller to show the merchant education next (4.2).
   */
  enable: () => Promise<TapToPayConnectResult>;
  /** Present Apple's education (iOS 18+). False = show the app's own instead. */
  showEducation: () => Promise<boolean>;
  /** Record a connect made elsewhere (the payment sheet) so status stays true. */
  recordConnect: (result: TapToPayConnectResult) => void;
};

const NOT_APPLICABLE: TapToPayContextValue = {
  applies: false,
  isAdmin: false,
  supported: null,
  updateRequired: false,
  termsAccepted: null,
  preparing: false,
  progress: null,
  error: null,
  enable: async () => ({ ok: false, error: 'Tap to Pay on iPhone is not available here.' }),
  showEducation: async () => false,
  recordConnect: () => {},
};

const TapToPayContext = createContext<TapToPayContextValue>(NOT_APPLICABLE);

/** Tap to Pay on iPhone state, or the not-applicable default outside iOS. */
export function useTapToPay(): TapToPayContextValue {
  return useContext(TapToPayContext);
}

/**
 * Coming back to the foreground re-runs the warm-up, but a phone flicked between
 * apps should not re-run a failing one (terms not accepted, no permission) every
 * few seconds. A reader that is already connected costs nothing to check.
 */
export const WARM_UP_MIN_INTERVAL_MS = 60_000;

export function TapToPayProvider({ children }: { children: ReactNode }) {
  // Android keeps the on-demand behaviour it ships with: nothing here applies.
  if (Platform.OS !== 'ios') return <>{children}</>;
  return <TapToPayProviderIos>{children}</TapToPayProviderIos>;
}

function TapToPayProviderIos({ children }: { children: ReactNode }) {
  const { venue } = useVenueContext();
  const reader = useTapToPayReader();
  // Read-only: which reader (if any) the SDK has connected right now.
  const terminal = getTerminalSdk()!.useStripeTerminal();

  const applies = buildSupportsTapToPay() && venue?.card_present_ready === true;
  const isAdmin = venue?.current_user_role === 'admin';

  const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastWarmUpRef = useRef(0);
  const readerRef = useRef(reader);
  const terminalRef = useRef(terminal);
  useEffect(() => {
    readerRef.current = reader;
    terminalRef.current = terminal;
  });

  const recordConnect = useCallback((result: TapToPayConnectResult) => {
    if (result.ok) {
      setTermsAccepted(true);
      setError(null);
      return;
    }
    if (result.reason === 'terms_not_accepted') {
      setTermsAccepted(false);
      setError(null);
      return;
    }
    // Missing permission on the silent warm-up is not a failure to report: the
    // first real use asks for it.
    if (result.reason !== 'permission_needed') setError(result.error);
  }, []);

  const warmUp = useCallback(
    async (force: boolean) => {
      const now = Date.now();
      if (!force && now - lastWarmUpRef.current < WARM_UP_MIN_INTERVAL_MS) return;
      if (terminalRef.current.connectedReader) return;
      lastWarmUpRef.current = now;
      // `checkSupport` answers false for "unknown" too — either way, no warm-up.
      if (!(await readerRef.current.checkSupport())) return;
      const result = await readerRef.current.connect({
        tosAcceptancePermitted: false,
        promptForPermissions: false,
      });
      recordConnect(result);
    },
    [recordConnect],
  );

  useEffect(() => {
    if (!applies) return;
    void warmUp(true);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void warmUp(false);
    });
    return () => subscription.remove();
  }, [applies, warmUp]);

  const enable = useCallback(async (): Promise<TapToPayConnectResult> => {
    const result = await readerRef.current.connect({
      tosAcceptancePermitted: isAdmin,
      promptForPermissions: true,
    });
    recordConnect(result);
    return result;
  }, [isAdmin, recordConnect]);

  const phoneReaderConnected = terminal.connectedReader?.deviceType === 'tapToPay';
  const preparing =
    reader.status === 'initializing' ||
    reader.status === 'discovering' ||
    reader.status === 'connecting' ||
    reader.progress != null;

  const value = useMemo<TapToPayContextValue>(
    () => ({
      applies,
      isAdmin,
      supported: reader.supported,
      updateRequired: reader.updateRequired,
      // A connected phone reader proves the terms were accepted, whoever connected it.
      termsAccepted: phoneReaderConnected ? true : termsAccepted,
      preparing,
      progress: reader.progress,
      error,
      enable,
      showEducation: showAppleTapToPayEducation,
      recordConnect,
    }),
    [
      applies,
      isAdmin,
      reader.supported,
      reader.updateRequired,
      phoneReaderConnected,
      termsAccepted,
      preparing,
      reader.progress,
      error,
      enable,
      recordConnect,
    ],
  );

  return <TapToPayContext.Provider value={value}>{children}</TapToPayContext.Provider>;
}
