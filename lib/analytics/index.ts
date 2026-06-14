/**
 * Analytics seam — the single choke point for product-funnel instrumentation.
 *
 * Mirrors the observability seam (lib/observability): today it logs to the
 * console in dev and is otherwise a no-op, so call sites can be instrumented
 * now and a backend (PostHog/Amplitude/Segment/Sentry) wired later as a
 * one-file change, gated on a configured key so dev/local stays console-only.
 *
 * Activation checklist (needs an account + a dev/EAS build to verify):
 *   1. pick a backend SDK and `npx expo install` it
 *   2. set EXPO_PUBLIC_ANALYTICS_KEY (and host if self-hosted)
 *   3. implement the `track` / `screen` / `identify` / `reset` bodies
 *
 * Event names are centralized in ANALYTICS_EVENTS so the funnel is greppable
 * and typo-proof. Instrument the core funnels: login → calendar → create
 * booking → detail actions.
 */
import { captureMessage } from '@/lib/observability';

type AnalyticsScalar = string | number | boolean | null | undefined;
export type AnalyticsProps = Record<string, AnalyticsScalar>;

/** Canonical funnel event names. Add new events here, never inline a string. */
export const ANALYTICS_EVENTS = {
  // Auth funnel
  signInStarted: 'sign_in_started',
  signInSucceeded: 'sign_in_succeeded',
  signInFailed: 'sign_in_failed',
  signedOut: 'signed_out',
  sessionExpired: 'session_expired',
  // Core booking funnel
  calendarViewed: 'calendar_viewed',
  createBookingStarted: 'create_booking_started',
  createBookingCompleted: 'create_booking_completed',
  walkInCreated: 'walk_in_created',
  bookingDetailOpened: 'booking_detail_opened',
  bookingStatusChanged: 'booking_status_changed',
  bookingRescheduledByDrag: 'booking_rescheduled_drag',
  bookingResizedByDrag: 'booking_resized_drag',
  rebookStarted: 'rebook_started',
  // Clients
  clientMerged: 'client_merged',
  contactsExported: 'contacts_exported',
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

let installed = false;
let currentUserId: string | null = null;

/** True once an analytics backend key is configured (currently always false). */
export function isAnalyticsConfigured(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_ANALYTICS_KEY);
}

/** Initialise the analytics backend. Idempotent; call once at app launch. */
export function initAnalytics(): void {
  if (installed) return;
  installed = true;
  // When a backend is wired: init the SDK here, gated on isAnalyticsConfigured().
  captureMessage(
    `analytics ready (backend=${isAnalyticsConfigured() ? 'on' : 'noop'})`,
    'info',
  );
}

/** Record a product event. Never throws — instrumentation must not break a flow. */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  try {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[analytics]', event, props ?? '');
    }
    // When a backend is wired: backend.capture(event, { ...props, userId: currentUserId }).
  } catch {
    // swallow — analytics is best-effort
  }
}

/** Record a screen view. */
export function trackScreen(name: string, props?: AnalyticsProps): void {
  try {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[analytics:screen]', name, props ?? '');
    }
    // When a backend is wired: backend.screen(name, props).
  } catch {
    // swallow
  }
}

/** Associate subsequent events with a user (or null to clear on sign-out). */
export function identify(userId: string | null, traits?: AnalyticsProps): void {
  currentUserId = userId;
  try {
    // When a backend is wired: userId ? backend.identify(userId, traits) : backend.reset().
    void traits;
  } catch {
    // swallow
  }
}

/** Clear the identified user + queued state on sign-out. */
export function resetAnalytics(): void {
  identify(null);
}
