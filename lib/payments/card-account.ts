/**
 * Which business's Stripe account the card reader must act on, when it is not the signed-in one.
 *
 * A card payment on another business's booking (a linked partner, or a collective member) is a
 * PaymentIntent on THAT business's connected account, because the money is theirs. The Terminal
 * reader must be connected through a token for the same account, or the reader cannot find the
 * payment ("No such payment_intent", Aura taking Light 16's Root Tint, 2026-11-07).
 *
 * The SDK's token provider lives at the app root, above any screen, so a screen that takes such a
 * payment names the account here for as long as it needs the reader (`CardAccountScope`). Null means
 * the app's own scope: the linked venue chosen in the app, or the signed-in business.
 */
let owner: string | null = null;

export function setCardAccountOwner(venueId: string | null): void {
  owner = venueId;
}

export function getCardAccountOwner(): string | null {
  return owner;
}
