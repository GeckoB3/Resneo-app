/**
 * What a phone tells the web it can do with a card (POS plan §4.36 "Who is told", E.5; test plan
 * TTP-01, APP-03). The web only sends a sale from its till to a registration with Tap to Pay and
 * the terms accepted, or a Bluetooth reader; everything else must read as "none".
 */
import { cardCapabilityFor, NO_CARD, sameCardReport, type CardCapabilityInput } from '@/lib/pos/card-capability';

function input(over: Partial<CardCapabilityInput> = {}): CardCapabilityInput {
  return {
    cardAppAvailable: true,
    platform: 'ios',
    tapToPayBuild: true,
    tapToPaySupported: true,
    termsAccepted: true,
    wisepadRemembered: false,
    ...over,
  };
}

describe('cardCapabilityFor', () => {
  it('says none where card in the app is not available (no POS, no in-person cards, no take_payment)', () => {
    expect(cardCapabilityFor(input({ cardAppAvailable: false, wisepadRemembered: true }))).toEqual(NO_CARD);
  });

  it('reports Tap to Pay with the terms accepted on a capable iPhone', () => {
    expect(cardCapabilityFor(input())).toEqual({ card_capability: 'tap_to_pay', tap_to_pay_terms_accepted: true });
  });

  it('reports Apple terms not yet accepted, so the web does not send it a sale', () => {
    expect(cardCapabilityFor(input({ termsAccepted: null }))).toEqual({
      card_capability: 'tap_to_pay',
      tap_to_pay_terms_accepted: false,
    });
  });

  it('never reports Tap to Pay where the build says no (an iPad, an iPhone before the XS)', () => {
    expect(cardCapabilityFor(input({ tapToPayBuild: false }))).toEqual(NO_CARD);
    expect(cardCapabilityFor(input({ tapToPayBuild: false, wisepadRemembered: true }))).toEqual({
      card_capability: 'wisepad',
      tap_to_pay_terms_accepted: null,
    });
  });

  it('prefers a paired WisePad 3 when Tap to Pay cannot take it yet', () => {
    expect(cardCapabilityFor(input({ termsAccepted: false, wisepadRemembered: true }))).toEqual({
      card_capability: 'wisepad',
      tap_to_pay_terms_accepted: false,
    });
  });

  it('counts Android as accepted: it has no terms step', () => {
    expect(cardCapabilityFor(input({ platform: 'android', termsAccepted: null, tapToPaySupported: null }))).toEqual({
      card_capability: 'tap_to_pay',
      tap_to_pay_terms_accepted: true,
    });
  });

  it('says none when the phone said it cannot do Tap to Pay and has no reader', () => {
    expect(cardCapabilityFor(input({ tapToPaySupported: false }))).toEqual(NO_CARD);
  });

  it('never reports a card on the web build', () => {
    expect(cardCapabilityFor(input({ platform: 'web' }))).toEqual(NO_CARD);
  });
});

describe('sameCardReport', () => {
  it('compares both fields', () => {
    expect(sameCardReport(NO_CARD, { card_capability: 'none', tap_to_pay_terms_accepted: null })).toBe(true);
    expect(sameCardReport(NO_CARD, { card_capability: 'wisepad', tap_to_pay_terms_accepted: null })).toBe(false);
    expect(sameCardReport(null, NO_CARD)).toBe(false);
  });
});
