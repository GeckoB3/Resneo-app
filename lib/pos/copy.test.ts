/**
 * Checkout's words follow the house rules (CLAUDE.md, UX spec §18): no em-dash anywhere, straight
 * apostrophes only, and the venue's client word is filled in.
 */
import { capitalise, fillCopy, POS_COPY, posCopy, posCopyFor } from '@/lib/pos/copy';

describe('POS copy', () => {
  const entries = Object.entries(POS_COPY);

  it('never uses an em-dash', () => {
    const EM_DASH = String.fromCharCode(0x2014);
    const offenders = entries.filter(([, text]) => text.includes(EM_DASH)).map(([id]) => id);
    expect(offenders).toEqual([]);
  });

  it('uses straight apostrophes and quotes', () => {
    const curly = [0x2018, 0x2019, 0x201c, 0x201d].map((c) => String.fromCharCode(c));
    const offenders = entries.filter(([, text]) => curly.some((c) => text.includes(c))).map(([id]) => id);
    expect(offenders).toEqual([]);
  });

  it('never writes a currency symbol next to a money placeholder', () => {
    const offenders = entries.filter(([, text]) => /£\{/.test(text)).map(([id]) => id);
    expect(offenders).toEqual([]);
  });

  it('keeps the web ids the spec names for app step 1', () => {
    const ids = ['app.tile.checkout', 'till.newSale', 'bk.checkout', 'app.mine.title', 'app.receipt.notSent.pos', 'app.charge.timedOut'] as const;
    for (const id of ids) expect(POS_COPY[id]).toBeTruthy();
  });

  it('keeps the web ids the spec names for the Pass V app step', () => {
    const ids = [
      'add.tab.vouchers',
      'vsell.title',
      'vsell.add',
      'line.voucher',
      'pay.method.voucher',
      'pay.method.credit',
      'vpay.code.invalid',
      'vpay.confirm',
      'vpay.notForVouchers',
      'cpay.confirm',
      'cpay.clientLocked',
      'refund.dest.voucher',
      'refund.needsClient',
      'done.voucher.issued',
      'client.sv.title',
    ] as const;
    for (const id of ids) expect(POS_COPY[id]).toBeTruthy();
    expect(posCopy('vpay.notForVouchers', { amount: '£25.00' })).toBe(
      "Gift vouchers and account credit can't pay for another gift voucher. Take £25.00 another way.",
    );
  });

  it('keeps the web ids the spec names for app step 2 (UX spec §13.4, §18.35)', () => {
    const ids = [
      'app.tapToPay',
      'app.tapToPay.iphone',
      'app.howToTap.title',
      'app.bluetoothReader',
      'app.sendToReader',
      'app.collect.list.title',
      'app.collect.row',
      'app.collect.title',
      'app.collect.for',
      'app.collect.processing',
      'app.collect.done',
      'app.collect.declined',
      'app.collect.insertCard',
      'app.collect.sendLink',
      'app.collect.useCounter',
      'app.collect.timeout',
      'app.collect.cancelledByDesk',
      'app.collect.accountLimit',
      'err.POS_PAYMENT_CLAIMED',
      'app.saveCard.handTo',
      'app.saveCard.title',
      'app.saveCard.agree',
      'app.saveCard.decline',
      'app.saveCard.handBack',
      'reader.consent.text',
      'reader.saved',
      'reader.notSaved',
      'reader.notSaved.wallet',
      'pay.method.link',
      'link.scan',
      'link.text',
      'link.email',
      'done.tipLink',
      'link.tipOnly.title',
      'saved.confirm.title',
      'client.cards.remove',
      'rep.t.payouts',
      'rep.payout.arrives',
      'rep.payout.fees',
    ] as const;
    for (const id of ids) expect(POS_COPY[id]).toBeTruthy();
    expect(posCopy('app.collect.row', { amount: '£45.00', saleNo: 'R-1042', staffName: 'Sam' })).toBe(
      '£45.00 for Sale R-1042, from Sam',
    );
    // Apple's exact name, never shortened (plan §4.36 "Apple's rules").
    expect(POS_COPY['app.tapToPay.iphone']).toBe('Tap to Pay on iPhone');
  });

  it('keeps the web ids the spec names for app step 4 and the Pass LC app step (UX spec §13.6, §13.13)', () => {
    const ids = [
      'app.tile.stock',
      'app.tile.stock.hint',
      'app.photo.library',
      'app.photo.camera',
      'app.stocktake.offline',
      'add.tab.products',
      'add.stock.warnOver',
      'scan.unknown',
      'age.reminder',
      'line.chip.age18',
      'refund.restock',
      'prod.readOnly',
      'var.barcode.invalid',
      'adj.preview',
      'mov.reason.refund_restock',
      'take.commit.body',
      'client.purchases.title',
      'client.stats.none',
      'loyalty.ready',
      'loyalty.apply.confirm',
      'loyalty.card.progress',
      'loyalty.adjust.tooMany',
      'comm.mine.commission',
      'comm.mine.note',
      'app.web.stockSetup',
      'app.web.loyalty',
      'app.web.commission',
    ] as const;
    for (const id of ids) expect(POS_COPY[id]).toBeTruthy();
    // Word for word from the web decks.
    expect(posCopy('add.stock.warnOver', { count: 2 })).toBe(
      'The stock count says 2 left. You can still sell it, and the count will go below zero.',
    );
    expect(posCopyFor('client')('age.reminder', { product: 'Straight razor' })).toBe(
      'Check the client is 18 or over before you sell Straight razor.',
    );
    expect(posCopy('loyalty.card.progress', { count: 4, needed: 6 })).toBe('4 of 6 visits');
    expect(posCopy('app.tile.stock')).toBe('Products and stock');
  });

  it('keeps the camera scanning ids word for word (UX spec §13.6, §18.28)', () => {
    expect(posCopy('app.scan.title')).toBe('Scan a barcode');
    expect(posCopy('app.scan.hint')).toBe('Point the camera at the barcode.');
    expect(posCopy('app.scan.torch')).toBe('Torch');
    expect(posCopy('app.scan.permission')).toBe('ResNeo needs your camera to scan barcodes.');
    expect(posCopy('app.scan.denied')).toBe(
      "Camera access is off. Turn it on in your phone's settings to scan, or type the code instead.",
    );
  });

  it('keeps the web ids the spec names for app step 3 (UX spec §13.5, §18.21)', () => {
    const ids = [
      'session.open',
      'session.openSince',
      'session.leftOpen',
      'session.open.refundOnly',
      'move.in.title',
      'move.out.petty',
      'move.photo',
      'move.tips.confirm',
      'close.blind',
      'close.needsReason',
      'close.mismatch',
      'z.xWatermark',
      'z.email',
      'eod.cashOutside.help',
      'denom.bagged',
      'err.POS_TILL_SESSION_REQUIRED',
      'err.POS_SESSION_ALREADY_OPEN',
      'err.POS_VARIANCE_REASON_REQUIRED',
      'push.pref.pos_cash_up_reminder',
      'app.receipt.share',
      'app.photo.library',
      'app.photo.camera',
      'app.photo.denied',
    ] as const;
    for (const id of ids) expect(POS_COPY[id]).toBeTruthy();
    expect(posCopy('session.openSince', { staffName: 'Jess', time: '08:52', amount: '£100.00' })).toBe(
      'Opened by Jess at 08:52 with a £100.00 float',
    );
    expect(posCopy('close.mismatch', { counted: '£180.00' })).toBe('These need to add up to the £180.00 you counted.');
  });

  it('fills placeholders and leaves unknown ones for a test to spot', () => {
    expect(fillCopy('{amount} to pay', { amount: '£5.00' })).toBe('£5.00 to pay');
    expect(fillCopy('{missing} here')).toBe('{missing} here');
    expect(posCopy('sale.title', { saleNo: 'R-12' })).toBe('Sale R-12');
  });

  it("fills the venue's own client word, in both cases", () => {
    const t = posCopyFor('Patient');
    expect(t('client.add')).toBe('Add patient');
    expect(t('app.sale.client')).toBe('Patient');
    expect(capitalise('guest')).toBe('Guest');
  });
});
