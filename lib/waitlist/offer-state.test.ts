/**
 * The waitlist offer tri-state — a CROSS-REPO invariant.
 *
 * Web degrades `/api/venue/waitlist` per entry rather than returning a 503 for
 * the whole list, and that fix works on already-shipped app builds only because
 * an UNSET `can_offer` has always failed safe here. If this rule is ever
 * loosened to a falsy check, every failed read silently starts disabling the
 * Offer button again and telling staff there is no availability.
 *
 * @see Docs/R20-1_APP_REPLY_2.md
 */
import { waitlistOfferState } from '@/lib/waitlist/offer-state';

describe('waitlistOfferState', () => {
  it('offers when a slot resolved', () => {
    expect(waitlistOfferState({ can_offer: true }, true)).toBe('offerable');
  });

  it('blocks ONLY on an explicit false', () => {
    expect(waitlistOfferState({ can_offer: false }, true)).toBe('blocked');
  });

  it('does not block when the flag is unset — the check never ran', () => {
    // The whole per-entry degradation rests on this line.
    expect(waitlistOfferState({}, true)).toBe('offerable');
    expect(waitlistOfferState({ can_offer: undefined }, true)).toBe('offerable');
  });

  it('reports unchecked when the server says the read failed', () => {
    expect(waitlistOfferState({ offer_check_failed: true }, true)).toBe('unchecked');
  });

  it('lets a failed check win over a stale false, rather than disabling', () => {
    // The server should never send both; if it does, the read failed and the
    // `false` cannot be trusted. Erring toward enabled is safe — the offer path
    // re-validates and answers 409.
    expect(waitlistOfferState({ can_offer: false, offer_check_failed: true }, true)).toBe(
      'unchecked',
    );
  });

  it('never disables an entry that is not waiting', () => {
    expect(waitlistOfferState({ can_offer: false }, false)).toBe('offerable');
    expect(waitlistOfferState({ offer_check_failed: true }, false)).toBe('offerable');
  });

  it('ignores an unknown truthy shape rather than treating it as a block', () => {
    // Old builds see fields they do not know; new fields must not flip the gate.
    expect(
      waitlistOfferState({ can_offer: true, offer_check_failed: false }, true),
    ).toBe('offerable');
  });
});
