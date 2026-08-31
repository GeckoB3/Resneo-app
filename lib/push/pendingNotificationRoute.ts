/**
 * One-shot hand-off for "a notification tap wants us on booking X".
 *
 * Notification taps arrive at PushNotificationsProvider, which sits ABOVE the
 * navigator (it has to — the listener must be attached before any screen
 * mounts). Navigating from up there is what produced the 2026-08-16 crash loop:
 * on a cold start its effect fires while the root layout is still resolving the
 * session, so there is no navigator to receive the action. expo-router resolves
 * the divergence at its INTERNAL `__root` navigator and pushes a *second*
 * `__root` route, which mounts a whole fresh copy of the provider tree, whose
 * PushNotificationsProvider reads the SAME launch response and pushes again —
 * ~50x/second until the process died (the loop also reset AuthProvider's
 * isLoading every iteration, so the session could never finish loading and the
 * app sat on "Loading session…" forever).
 *
 * So the provider no longer navigates. It parks the booking id here, and
 * `PendingPushRouteHandler` — which renders INSIDE the (app) navigator, so it
 * cannot run unless a navigator exists — takes it and routes exactly once.
 *
 * `take` clears as it reads: even if two handlers mount, only one can navigate,
 * so no arrangement of remounts can re-fire the same tap.
 */

/**
 * What a notification tap wants to open.
 *
 * A union rather than two parked values, because one tap parks ONE intent.
 * Separate slots would model a tap that could want two things at once, which is
 * not a state that exists, and would leave the consumer deciding which wins.
 *
 * `url` arrived with the customer waitlist offer. That notification precedes
 * any booking, so it carries no booking id to route on, and the destination is
 * the venue's public booking page: the same place the offer email's button
 * already points. `customerHome` is the fallback for an offer whose venue has
 * no slug, where there is nothing to open but the customer should still land
 * somewhere that shows the offer.
 */
export type PendingPushRoute =
  | { kind: 'booking'; bookingId: string }
  | { kind: 'url'; url: string }
  | { kind: 'customerHome' };

let pendingRoute: PendingPushRoute | null = null;
const subscribers = new Set<() => void>();

/** Park a tap for the navigator to pick up. Overwrites any earlier pending id. */
export function setPendingPushRoute(route: PendingPushRoute): void {
  pendingRoute = route;
  // Copy first — a subscriber may unsubscribe while we iterate.
  for (const notify of [...subscribers]) {
    notify();
  }
}

/** Read AND clear the parked booking id. Returns null when there is nothing to do. */
export function takePendingPushRoute(): PendingPushRoute | null {
  const route = pendingRoute;
  pendingRoute = null;
  return route;
}

/** Notified when a tap is parked. Returns an unsubscribe function. */
export function subscribePendingPushRoute(notify: () => void): () => void {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

/**
 * Test seam — drops any parked id AND every subscriber.
 *
 * Subscribers are cleared too because a test renderer tears components down
 * asynchronously: a handler from a previous test can still be subscribed when
 * the next one parks an id, and would swallow it. Real components always
 * re-subscribe on mount, so this is inert outside tests.
 */
export function resetPendingPushRoute(): void {
  pendingRoute = null;
  subscribers.clear();
}
