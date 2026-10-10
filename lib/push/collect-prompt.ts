import { extractPushRoute } from '@/lib/push/extract-push-route';

/**
 * The link between a `pos_collect_request` push that arrives while the app is open and the in-app
 * prompt that offers it (`components/pos/CollectRequestPrompt.tsx`, owner 2026-10-10).
 *
 * The notification handler (`PushNotificationsProvider`) asks `offerCollectPrompt` with the push's
 * data. The mounted prompt answers true when it will show the request itself, and the handler then
 * hides the phone's own banner so nobody sees it twice; false (nothing mounted, signed out, another
 * venue, a sheet or the collect screen already open) leaves the banner as before.
 */
export type CollectPromptOffer = (paymentId: string, venueId: string | null) => boolean;

let presenter: CollectPromptOffer | null = null;

/** Registers the prompt; returns the unregister function. Only the last one registered answers. */
export function registerCollectPrompt(offer: CollectPromptOffer): () => void {
  presenter = offer;
  return () => {
    if (presenter === offer) presenter = null;
  };
}

/** Offers a push to the in-app prompt; true when it will show it, so the banner is not needed. */
export function offerCollectPrompt(data: Record<string, unknown> | null | undefined): boolean {
  const route = extractPushRoute(data);
  if (route?.kind !== 'posCollect' || !presenter) return false;
  try {
    return presenter(route.paymentId, route.venueId ?? null);
  } catch (error) {
    console.warn('[push] collect prompt failed, showing the banner instead:', error);
    return false;
  }
}
