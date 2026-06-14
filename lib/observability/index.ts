/**
 * Observability seam — the single choke point for error/event reporting.
 *
 * Today it logs to the console and installs a global uncaught-error handler so
 * crashes are reported instead of vanishing in production. Wiring a real
 * backend (e.g. Sentry) is a one-file change: implement the `capture*` bodies to
 * forward to the SDK, gated on a configured DSN so dev/local stays console-only.
 *
 * Activation checklist for Sentry (needs a dev/EAS build to verify):
 *   1. `npx expo install @sentry/react-native`
 *   2. add the Sentry Expo config plugin in app.json
 *   3. set EXPO_PUBLIC_SENTRY_DSN, then `Sentry.init({ dsn })` inside `initObservability`
 *   4. forward `captureException` / `captureMessage` / `setUser` to the SDK
 */
import { Platform } from 'react-native';

export type ObservabilityLevel = 'fatal' | 'error' | 'warning' | 'info';
type ContextValue = string | number | boolean | null | undefined;
export type ObservabilityContext = Record<string, ContextValue>;

let currentUserId: string | null = null;
let installed = false;

/** True once a reporting backend DSN is configured (currently always false). */
export function isObservabilityConfigured(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN);
}

/** Report an error. Safe to call with anything thrown (Error or not). */
export function captureException(error: unknown, context?: ObservabilityContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  // eslint-disable-next-line no-console
  console.error('[observability]', err.message, { userId: currentUserId, ...context });
  // When a backend is wired: Sentry.captureException(err, { extra: context }).
}

/** Report a non-error event / breadcrumb-level message. */
export function captureMessage(
  message: string,
  level: ObservabilityLevel = 'info',
  context?: ObservabilityContext,
): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[observability:${level}]`, message, context ?? '');
  }
  // When a backend is wired: Sentry.captureMessage(message, level).
}

/** Associate subsequent reports with a user (or null to clear on sign-out). */
export function setObservabilityUser(userId: string | null): void {
  currentUserId = userId;
  // When a backend is wired: Sentry.setUser(userId ? { id: userId } : null).
}

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsShape = {
  getGlobalHandler?: () => GlobalErrorHandler;
  setGlobalHandler?: (handler: GlobalErrorHandler) => void;
};

/**
 * Install the global uncaught-error handler and emit a startup breadcrumb.
 * Idempotent — safe to call more than once. Call once at app launch.
 */
export function initObservability(): void {
  if (installed) return;
  installed = true;

  captureMessage(
    `observability ready (backend=${isObservabilityConfigured() ? 'on' : 'console'}, platform=${Platform.OS})`,
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
}
