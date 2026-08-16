/**
 * Observability seam — the single choke point for error/event reporting.
 *
 * When EXPO_PUBLIC_SENTRY_DSN is set it lazily loads @sentry/react-native and
 * forwards reports to it; otherwise it logs to the console (dev/local). The
 * lazy require is GATED on the DSN so a build without the native module linked
 * never touches the SDK. It also installs a global uncaught-error handler and an
 * unhandled-promise-rejection handler so crashes are reported rather than
 * silently vanishing in production. Every SDK call is wrapped in try/catch so a
 * missing native module can never crash the app.
 *
 * Activation checklist for Sentry (needs a dev/EAS build to verify):
 *   1. `npx expo install @sentry/react-native` (done)
 *   2. add the Sentry Expo config plugin in app.json
 *   3. set EXPO_PUBLIC_SENTRY_DSN — init + forwarding below light up automatically
 */
import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';

import { getBuildChannel } from '@/lib/build-channel';

export type ObservabilityLevel = 'fatal' | 'error' | 'warning' | 'info';
type ContextValue = string | number | boolean | null | undefined;
export type ObservabilityContext = Record<string, ContextValue>;

// Minimal shape of the bits of @sentry/react-native we use. Kept local so the
// SDK's types are never required at build time (the require is runtime + gated).
type SentryNavigationIntegration = {
  registerNavigationContainer: (ref: unknown) => void;
};

type SentrySdk = {
  init: (options: Record<string, unknown>) => void;
  captureException: (error: unknown, context?: Record<string, unknown>) => void;
  captureMessage: (message: string, level?: ObservabilityLevel) => void;
  setUser: (user: { id: string } | null) => void;
  reactNavigationIntegration?: (options?: Record<string, unknown>) => SentryNavigationIntegration;
};

let currentUserId: string | null = null;
let installed = false;
let sentry: SentrySdk | null = null;
/** Held from init so the root layout can hand it the navigation container. */
let navigationIntegration: SentryNavigationIntegration | null = null;

/** True once a reporting backend DSN is configured. */
export function isObservabilityConfigured(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN);
}

/** Report an error. Safe to call with anything thrown (Error or not). */
export function captureException(error: unknown, context?: ObservabilityContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  if (sentry) {
    try {
      sentry.captureException(err, { extra: { userId: currentUserId, ...context } });
      return;
    } catch {
      // fall through to console if the SDK throws (e.g. native module missing)
    }
  }
  // eslint-disable-next-line no-console
  console.error('[observability]', err.message, { userId: currentUserId, ...context });
}

/** Report a non-error event / breadcrumb-level message. */
export function captureMessage(
  message: string,
  level: ObservabilityLevel = 'info',
  context?: ObservabilityContext,
): void {
  if (sentry) {
    try {
      sentry.captureMessage(message, level);
      return;
    } catch {
      // fall through to console
    }
  }
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[observability:${level}]`, message, context ?? '');
  }
}

/**
 * Hand Sentry the root navigation container so events carry the current screen.
 *
 * Call once from the root layout with expo-router's `useNavigationContainerRef()`.
 * Safe (and a no-op) when Sentry is not configured, when the native module is
 * missing, or when the ref has not resolved yet.
 */
export function registerNavigationContainer(ref: unknown): void {
  if (!navigationIntegration || !ref) return;
  try {
    navigationIntegration.registerNavigationContainer(ref);
  } catch {
    // Never let observability wiring break navigation.
  }
}

/** Associate subsequent reports with a user (or null to clear on sign-out). */
export function setObservabilityUser(userId: string | null): void {
  currentUserId = userId;
  if (sentry) {
    try {
      sentry.setUser(userId ? { id: userId } : null);
    } catch {
      // swallow — never let user tagging crash a sign-in/out
    }
  }
}

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsShape = {
  getGlobalHandler?: () => GlobalErrorHandler;
  setGlobalHandler?: (handler: GlobalErrorHandler) => void;
};

/**
 * Which build this is, for Sentry's `environment` tag. Without it every non-dev
 * build reports as the SDK's default and preview crashes are indistinguishable
 * from real customer ones in the same Sentry project.
 */
function resolveSentryEnvironment(): string {
  if (__DEV__) return 'development';
  return getBuildChannel() ?? 'unknown';
}

/**
 * Stop the SDK's per-navigation native time-to-display probe.
 *
 * `reactNavigationIntegration` calls the native `getNewScreenTimeToDisplay()` on
 * EVERY navigation state change, ungated — `enableTimeToInitialDisplay: false`
 * below does NOT prevent it (see the call in the SDK's
 * tracing/reactnavigation.js). The iOS implementation keeps the promise resolver
 * in a single instance variable and installs a fresh CADisplayLink per call
 * WITHOUT invalidating the previous one, so a burst of navigations leaves a pile
 * of live display links firing against a clobbered resolver. That is the
 * `EXC_BAD_ACCESS ... getNewScreenTimeToDisplay` that killed the app on
 * 2026-08-16 the moment it was backgrounded.
 *
 * We already ask for no time-to-display data, so resolving null is exactly what
 * the configuration requests — this just skips the leaky native round-trip to
 * get there. Revisit if the SDK fixes the native lifecycle and we ever want TTID.
 */
function disableNativeTimeToDisplayProbe(): void {
  if (Platform.OS === 'web') return;
  try {
    // The SDK resolves RNSentry as a TurboModule under the new architecture and
    // falls back to NativeModules otherwise; patch whichever object it will hold.
    const registry = TurboModuleRegistry as unknown as
      | { get?: (name: string) => Record<string, unknown> | null }
      | undefined;
    const native =
      registry?.get?.('RNSentry') ??
      (NativeModules?.RNSentry as Record<string, unknown> | undefined);
    if (native && typeof native.getNewScreenTimeToDisplay === 'function') {
      native.getNewScreenTimeToDisplay = () => Promise.resolve(null);
    }
  } catch {
    // Best-effort hardening — never let it block Sentry from starting.
  }
}

/**
 * Lazily load and init @sentry/react-native — only ever called when a DSN is
 * configured, so a build without the native module linked never requires it.
 */
function initSentry(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const sdk = require('@sentry/react-native') as SentrySdk;
    // Before anything can navigate (see the function's comment for why).
    disableNativeTimeToDisplayProbe();
    // Screen names on every event. Without this a report carries only UIKit
    // view-controller breadcrumbs (_UICursorAccessoryViewController and friends),
    // which say a text field was focused but never which of our screens it was
    // on — the gap that made an App Hang report unactionable on 2026-08-09.
    // expo-router runs on React Navigation, so this is the right integration;
    // it stays inert until `registerNavigationContainer` gets the root ref.
    const integrations: unknown[] = [];
    if (typeof sdk.reactNavigationIntegration === 'function') {
      navigationIntegration = sdk.reactNavigationIntegration({
        // Route-change spans are for tracing; the value here is the screen tag.
        // NOTE: this flag does not stop the per-navigation NATIVE time-to-display
        // call — disableNativeTimeToDisplayProbe() above is what does that.
        enableTimeToInitialDisplay: false,
      });
      integrations.push(navigationIntegration);
    }
    sdk.init({
      dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
      environment: resolveSentryEnvironment(),
      enableAutoSessionTracking: true,
      tracesSampleRate: 0.2,
      ...(integrations.length > 0 ? { integrations } : {}),
      // Sampled JS-THREAD stacks. iOS App Hang detection samples the MAIN thread,
      // which in React Native is parked in the run loop while the JS thread does
      // the blocking work — so those reports arrive with a stack of
      // `UIApplicationDelegate.main` and nothing else. Profiles are the only way
      // to see what was actually running. Fraction OF sampled traces, so the
      // effective rate is tracesSampleRate x this.
      profilesSampleRate: 0.2,
    });
    sentry = sdk;
    // Tag any user already known before init ran.
    if (currentUserId) {
      sentry.setUser({ id: currentUserId });
    }
  } catch (error) {
    // Native module not linked / SDK failed to load — stay console-only.
    // eslint-disable-next-line no-console
    console.warn('[observability] Sentry init failed, falling back to console:', error);
  }
}

type RejectionTracking = {
  enable: (options: {
    allRejections?: boolean;
    onUnhandled?: (id: unknown, error: unknown) => void;
  }) => void;
};
type GlobalWithRejection = {
  HermesInternal?: object;
  addEventListener?: (type: string, listener: (event: unknown) => void) => void;
};

/**
 * Report otherwise-unhandled promise rejections. Engine-aware:
 *  - Web / any DOM-style runtime: listen for the `unhandledrejection` event.
 *  - Non-Hermes JS engine (JSC): RN's `promise` polyfill is live, so enabling
 *    its rejection tracker actually fires.
 *  - Hermes (the SDK 56 default): the native Promise is used and the `promise`
 *    polyfill tracker is a NO-OP, so we don't install it (that was the bug).
 *    There, unhandled rejections are captured by Sentry's own native
 *    integration when a DSN is configured, and surfaced via RN LogBox in dev.
 * Defensive: any failure here must not break startup.
 */
function installUnhandledRejectionHandler(): void {
  const g = globalThis as unknown as GlobalWithRejection;
  try {
    if (typeof g.addEventListener === 'function') {
      g.addEventListener('unhandledrejection', (event) => {
        const reason = (event as { reason?: unknown })?.reason ?? event;
        captureException(reason, { scope: 'unhandledrejection' });
      });
      return;
    }
    if (!g.HermesInternal) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const tracking = require('promise/setimmediate/rejection-tracking') as RejectionTracking;
      tracking.enable({
        allRejections: true,
        onUnhandled: (_id, err) => captureException(err, { scope: 'unhandledrejection' }),
      });
    }
    // Hermes: handled by Sentry's native integration (when active) + LogBox.
  } catch {
    // swallow — best-effort; the global error handler below still catches sync crashes
  }
}

/**
 * Init the backend (when a DSN is set), install the global uncaught-error +
 * unhandled-rejection handlers, and emit a startup breadcrumb. Idempotent —
 * safe to call more than once. Call once at app launch.
 */
export function initObservability(): void {
  if (installed) return;
  installed = true;

  // Only ever require the SDK when a DSN is configured (see file doc-comment).
  if (isObservabilityConfigured()) {
    initSentry();
  }

  captureMessage(
    `observability ready (backend=${sentry ? 'sentry' : 'console'}, platform=${Platform.OS})`,
    'info',
  );

  // Catch otherwise-unhandled JS errors so they're reported rather than
  // silently crashing in production. Preserve the previous handler so the dev
  // RedBox / error overlay still works.
  const errorUtils = (globalThis as unknown as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
  const previous = errorUtils?.getGlobalHandler?.();
  errorUtils?.setGlobalHandler?.((error, isFatal) => {
    captureException(error, { isFatal: Boolean(isFatal), scope: 'uncaught' });
    previous?.(error, isFatal);
  });

  installUnhandledRejectionHandler();
}
