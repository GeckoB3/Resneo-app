/**
 * App step 2's card method rules (POS plan §4.4, §4.36; UX spec §3.19, §3.29, §13.4, §23.5),
 * following the web till: which methods the payment sheet offers, the tip link, the pending
 * payments the sale shows, saved card words, and how a sale sent to a phone ends.
 */
import {
  cardBrandName,
  cardMethodsOffered,
  collectEndedCopyId,
  declinedSavedCardPayment,
  defaultReaderFor,
  isAccountLimitError,
  isPinRequired,
  payoutStatusCopyId,
  pendingCollectPayment,
  pendingReaderPayment,
  readerStatusCopyId,
  savedCardConsentLine,
  savedCardLabel,
  tipLinkOffered,
  tipsOnLinks,
} from '@/lib/pos/card-methods';
import { posCopyFor } from '@/lib/pos/copy';
import { makeLine, makePayment, makeSale } from '@/lib/pos/test-sale';
import type { PosBootstrap, PosReader } from '@/types/pos';

const t = posCopyFor('client');

function boot(over: Partial<PosBootstrap> = {}): Pick<PosBootstrap, 'card_methods' | 'capabilities' | 'settings' | 'tip_settings'> {
  return {
    card_methods: { card_app: true, card_reader: true, pay_link: true },
    capabilities: { take_payment: true, charge_saved_card: true },
    settings: { card_on_file_enabled: true },
    tip_settings: { tipping_enabled: true },
    ...over,
  };
}

const guest = { id: 'g-1', name: 'Ada Lovelace', email: 'ada@example.com', phone: '07700900123' };

describe('cardMethodsOffered', () => {
  it('offers the reader, a pay link and saved cards when the venue and login allow them', () => {
    expect(cardMethodsOffered(boot(), { guest })).toEqual({ cardReader: true, payLink: true, savedCards: true });
  });

  it('hides everything from a login without take_payment', () => {
    expect(cardMethodsOffered(boot({ capabilities: {} }), { guest })).toEqual({ cardReader: false, payLink: false, savedCards: false });
  });

  it('needs charge_saved_card, cards on file and a client for saved cards', () => {
    expect(cardMethodsOffered(boot({ capabilities: { take_payment: true } }), { guest }).savedCards).toBe(false);
    expect(cardMethodsOffered(boot({ settings: {} }), { guest }).savedCards).toBe(false);
    expect(cardMethodsOffered(boot(), { guest: null }).savedCards).toBe(false);
  });

  it('reads a server before Pass 2 (no card_reader or pay_link) as off', () => {
    expect(cardMethodsOffered(boot({ card_methods: { card_app: true } }), { guest })).toMatchObject({ cardReader: false, payLink: false });
  });
});

describe('tipLinkOffered', () => {
  const paid = makeSale({
    status: 'completed',
    tip_pence: 0,
    balance_due_pence: 0,
    lines: [makeLine({ booking_id: 'bk-1' })],
  });

  it('offers a tip link on a visit paid in full with no tip', () => {
    expect(tipLinkOffered(paid, boot())).toBe(true);
  });

  it('not when a tip was already left, the sale is open, there is no visit, or tips on links are off', () => {
    expect(tipLinkOffered({ ...paid, tip_pence: 100 }, boot())).toBe(false);
    expect(tipLinkOffered({ ...paid, status: 'open' }, boot())).toBe(false);
    expect(tipLinkOffered({ ...paid, lines: [makeLine({ booking_id: null })] }, boot())).toBe(false);
    expect(tipLinkOffered(paid, boot({ tip_settings: { tipping_enabled: true, tip_on_links: false } }))).toBe(false);
    expect(tipLinkOffered(paid, boot({ tip_settings: { tipping_enabled: false } }))).toBe(false);
    expect(tipLinkOffered(paid, boot({ card_methods: { card_app: true } }))).toBe(false);
  });

  it('reads a missing tip_on_links as on, as the web does', () => {
    expect(tipsOnLinks({ tip_settings: { tipping_enabled: true } })).toBe(true);
  });
});

describe('pending payments on a sale', () => {
  it('finds a waiting reader payment, a declined card on file and a sale sent to a phone', () => {
    const reader = makePayment({ id: 'p-r', method: 'card_reader', status: 'pending' });
    const saved = makePayment({ id: 'p-s', method: 'saved_card', status: 'pending', failure_code: 'card_declined' });
    const phone = makePayment({ id: 'p-c', method: 'card_app', status: 'pending', collect_state: 'claimed' });
    const sale = makeSale({ payments: [reader, saved, phone], payment_lock_payment_id: 'p-s' });
    expect(pendingReaderPayment(sale)?.id).toBe('p-r');
    expect(declinedSavedCardPayment(sale)?.id).toBe('p-s');
    expect(pendingCollectPayment(sale)?.id).toBe('p-c');
    expect(pendingCollectPayment(makeSale({ payments: [makePayment({ method: 'card_app', status: 'pending' })] }))).toBeNull();
  });
});

describe('readers', () => {
  const r = (over: Partial<PosReader>): PosReader => ({ id: 'r', label: 'Desk', status: 'online', is_active: true, busy: false, ...over });

  it('says busy, offline or ready', () => {
    expect(readerStatusCopyId(r({ busy: true }))).toBe('reader.status.busy');
    expect(readerStatusCopyId(r({ status: 'offline' }))).toBe('reader.status.offline');
    expect(readerStatusCopyId(r({}))).toBe('reader.status.online');
  });

  it("starts with the till's default reader, else the first free one", () => {
    const readers = [r({ id: 'a', busy: true }), r({ id: 'b' }), r({ id: 'c', default_for_till_ids: ['till-1'] })];
    expect(defaultReaderFor(readers, 'till-1')?.id).toBe('c');
    expect(defaultReaderFor(readers, null)?.id).toBe('b');
    expect(defaultReaderFor([], null)).toBeNull();
  });
});

describe('saved cards', () => {
  it('names the card as the web does', () => {
    expect(savedCardLabel({ brand: 'visa', last4: '4242', exp_month: 4, exp_year: 2029 }, t)).toBe('Visa ending 4242, expires 04/29');
    expect(savedCardLabel({ brand: 'amex', last4: '0005', exp_month: null, exp_year: null }, t)).toBe('American Express ending 0005');
    expect(cardBrandName(null)).toBe('Card');
  });

  it('says when and where the client agreed', () => {
    expect(savedCardConsentLine({ consent_at: '2026-10-09T10:00:00Z', consent_channel: 'app' }, t, 'Europe/London')).toBe(
      'Saved with permission on 9 October 2026, on the phone at the desk',
    );
  });
});

describe('a sale sent to this phone', () => {
  it('knows a card that wants chip and PIN', () => {
    expect(isPinRequired('offline_pin_required')).toBe(true);
    expect(isPinRequired('TAP_TO_PAY_PIN_UNAVAILABLE')).toBe(true);
    expect(isPinRequired('card_declined')).toBe(false);
    expect(isPinRequired(null)).toBe(false);
  });

  it("reads Stripe's three-businesses limit from its words", () => {
    expect(isAccountLimitError('This device has been used with too many accounts in the last 24 hours.')).toBe(true);
    expect(isAccountLimitError('Could not connect the card reader.')).toBe(false);
  });

  it('says how a request ended', () => {
    expect(t(collectEndedCopyId('expired', false))).toBe('Nobody took this payment in time, so it was cancelled. Nothing was taken.');
    expect(t(collectEndedCopyId('cancelled', true))).toBe('The desk cancelled this payment. Nothing was taken.');
    expect(t(collectEndedCopyId('timed_out', true))).toBe(
      "The card wasn't tapped within 5 minutes, so this stopped. Nothing was taken.",
    );
    expect(t(collectEndedCopyId('paid', false))).toBe('Paid. The desk can see it.');
  });
});

describe('payouts', () => {
  it('words each status', () => {
    expect(t(payoutStatusCopyId('on_its_way'))).toBe('On its way');
    expect(t(payoutStatusCopyId('paid'))).toBe('Paid');
  });
});
