/**
 * The payment maths for Checkout in the app (UX spec §3.18, §3.19, §3.22): change, quick cash
 * amounts, split payments, the amount checks, tips on part of a bill, discounts, refunds and the
 * totals block. Kept in step with the web till's own tests.
 */
import { makeLine, makePayment, makeSale } from '@/lib/pos/test-sale';
import {
  cashChange,
  cashCovers,
  cashQuickAmounts,
  checkPaymentAmount,
  discountBasePence,
  discountOffPence,
  itemsRefundPence,
  lineRefundPence,
  maxRefundablePence,
  overStaffLimit,
  parseMoneyInput,
  paymentMethodName,
  pendingCardPayment,
  penceToInput,
  queueChips,
  refundableLines,
  refundEverything,
  saleIsEditable,
  saleStatusCopyId,
  splitEvenly,
  spreadRefund,
  tipBasePence,
  tipConfig,
  tipSuggestions,
  totalsRows,
} from '@/lib/pos/sale-math';

describe('"Ready to check out" chips', () => {
  const row = { price_unknown: false, deposit_paid_pence: 0, open_sale_number_label: null };

  it('shows "Reward ready" when the client has a loyalty reward waiting, as the web queue does', () => {
    expect(queueChips({ ...row, reward_ready: true })).toEqual([{ id: 'queue.chip.reward', tone: 'success' }]);
  });

  it('shows no reward chip when the row says false or an older server leaves it out', () => {
    expect(queueChips({ ...row, reward_ready: false })).toEqual([]);
    expect(queueChips(row)).toEqual([]);
  });

  it('keeps the web order: no price, deposit, open sale, then the reward', () => {
    expect(
      queueChips({ price_unknown: true, deposit_paid_pence: 1000, open_sale_number_label: 'S-12', reward_ready: true }).map((c) => c.id),
    ).toEqual(['queue.chip.noPrice', 'queue.chip.deposit', 'queue.chip.openSale', 'queue.chip.reward']);
  });
});

describe('money input', () => {
  it('reads pounds as typed', () => {
    expect(parseMoneyInput('12')).toBe(1200);
    expect(parseMoneyInput('12.5')).toBe(1250);
    expect(parseMoneyInput('£1,250.05')).toBe(125005);
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('12.345')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
    expect(penceToInput(1250)).toBe('12.50');
    expect(penceToInput(5)).toBe('0.05');
  });
});

describe('cash', () => {
  it('gives change only above what is due', () => {
    expect(cashChange(3550, 4000)).toBe(450);
    expect(cashChange(3550, 3000)).toBe(0);
    expect(cashChange(3550, null)).toBe(0);
  });

  it('offers the exact amount, then the next round notes', () => {
    expect(cashQuickAmounts(3550)).toEqual([3550, 4000, 5000]);
    expect(cashQuickAmounts(2000)).toEqual([2000, 2500, 3000, 4000, 5000]);
  });

  it('is ready once the cash handed over covers the amount and the tip', () => {
    expect(cashCovers(3000, 500, 3500)).toBe(true);
    expect(cashCovers(3000, 500, 3400)).toBe(false);
    expect(cashCovers(3000, 0, null)).toBe(true);
  });
});

describe('split payments', () => {
  it('splits evenly with the odd penny on the last share', () => {
    expect(splitEvenly(1000, 3)).toEqual([333, 333, 334]);
    expect(splitEvenly(1000, 0)).toEqual([1000]);
  });

  it('refuses nothing at all, more than the balance, and more than the ceiling with the tip', () => {
    expect(checkPaymentAmount({ amountPence: null, balancePence: 1000 })).toBe('empty');
    expect(checkPaymentAmount({ amountPence: 0, balancePence: 1000 })).toBe('zero');
    expect(checkPaymentAmount({ amountPence: 1001, balancePence: 1000 })).toBe('exceeds_balance');
    expect(checkPaymentAmount({ amountPence: 900, balancePence: 1000, maxPaymentPence: 950, tipPence: 100 })).toBe(
      'above_ceiling',
    );
    expect(checkPaymentAmount({ amountPence: 400, balancePence: 1000, maxPaymentPence: 1_000_000 })).toBeNull();
  });
});

describe('tips', () => {
  const sale = makeSale({
    total_pence: 6000,
    lines: [
      makeLine({ id: 'a', total_pence: 4000 }),
      makeLine({ id: 'b', reporting_group: 'retail', total_pence: 2000 }),
    ],
  });

  it('works percentages out on services only, or the whole bill', () => {
    expect(tipBasePence(sale, 'services', 6000)).toBe(4000);
    expect(tipBasePence(sale, 'total', 6000)).toBe(6000);
  });

  it('works them out on the part being paid on a split bill', () => {
    expect(tipBasePence(sale, 'services', 3000)).toBe(2000);
    expect(tipBasePence(sale, 'total', 3000)).toBe(3000);
  });

  it('suggests percentages above the threshold and fixed amounts below it', () => {
    const presets = { percents: [10, 15, 20], amounts: [100, 200, 300], thresholdPence: 1000 };
    expect(tipSuggestions({ basePence: 4000, ...presets })).toEqual([
      { kind: 'percent', percent: 10, amountPence: 400 },
      { kind: 'percent', percent: 15, amountPence: 600 },
      { kind: 'percent', percent: 20, amountPence: 800 },
    ]);
    expect(tipSuggestions({ basePence: 800, ...presets })).toEqual([
      { kind: 'amount', amountPence: 100 },
      { kind: 'amount', amountPence: 200 },
      { kind: 'amount', amountPence: 300 },
    ]);
  });

  it('fills the web defaults when the venue has not set its own', () => {
    const cfg = tipConfig(undefined);
    expect(cfg.enabled).toBe(false);
    expect(cfg.percents).toEqual([10, 15, 20]);
    expect(cfg.base).toBe('services');
    expect(tipConfig({ tipping_enabled: true, tip_base: 'total' }).base).toBe('total');
  });
});

describe('discounts', () => {
  it('previews what a discount takes off, capped at the base and a preset maximum', () => {
    expect(discountOffPence({ kind: 'percent', value: 10 }, 4000)).toBe(400);
    expect(discountOffPence({ kind: 'percent', value: 12.5 }, 4000)).toBe(500);
    expect(discountOffPence({ kind: 'amount', value: 5000 }, 4000)).toBe(4000);
    expect(discountOffPence({ kind: 'percent', value: 50 }, 4000, 1000)).toBe(1000);
    expect(discountOffPence({ kind: 'percent', value: 0 }, 4000)).toBe(0);
  });

  it('bases a line discount on what is left of the line', () => {
    const sale = makeSale({
      lines: [makeLine({ id: 'x', unit_price_pence: 2000, quantity: 2, line_discount_pence: 500 })],
    });
    expect(discountBasePence(sale, 'x')).toBe(3500);
    expect(discountBasePence(sale, null)).toBe(sale.total_pence);
  });

  it("holds staff to the venue's limit", () => {
    const sale = makeSale({ subtotal_pence: 10000 });
    expect(overStaffLimit({ sale, newOffPence: 1000, limitPercent: 10 })).toBe(false);
    expect(overStaffLimit({ sale, newOffPence: 1001, limitPercent: 10 })).toBe(true);
  });
});

describe('refunds', () => {
  const card = makePayment({
    id: 'card',
    method: 'card_app',
    tip_pence: 300,
    refundable_pence: 2000,
    refundable_tip_pence: 300,
  });
  const cash = makePayment({ id: 'cash', method: 'cash', refundable_pence: 1500 });
  const gone = makePayment({ id: 'gone', method: 'cash', refundable_pence: 0 });

  it('refunds cards first, each up to what it can still give back', () => {
    const { slices, unplaced } = spreadRefund([cash, card, gone], 2500);
    expect(slices).toEqual([
      { payment_id: 'card', method: 'card_app', amount_pence: 2000, tip_pence: 0 },
      { payment_id: 'cash', method: 'cash', amount_pence: 500, tip_pence: 0 },
    ]);
    expect(unplaced).toBe(0);
  });

  it('adds a tip only on the payment it was chosen for, and reports what cannot be placed', () => {
    const { slices, unplaced } = spreadRefund([card, cash], 4000, new Set(['card']));
    expect(slices[0]).toEqual({ payment_id: 'card', method: 'card_app', amount_pence: 2000, tip_pence: 300 });
    expect(unplaced).toBe(500);
    expect(maxRefundablePence([card, cash, gone])).toBe(3500);
  });

  it('refunds everything, cards first, for "Refund and cancel"', () => {
    expect(refundEverything([cash, card]).map((s) => s.payment_id)).toEqual(['card', 'cash']);
  });

  it('values part of a line in proportion, and the rest of it in full', () => {
    const sale = makeSale({ lines: [makeLine({ id: 'p', quantity: 3, total_pence: 1000 })] });
    const [r] = refundableLines(sale);
    expect(lineRefundPence(r!, 1)).toBe(333);
    expect(lineRefundPence(r!, 3)).toBe(1000);
    expect(itemsRefundPence([r!], { p: 2 })).toBe(667);
  });
});

describe('totals and status', () => {
  it('lists only the rows with a value, payments as negatives', () => {
    const sale = makeSale({
      subtotal_pence: 5000,
      discount_pence: 500,
      total_pence: 4500,
      tax_pence: 750,
      balance_due_pence: 2500,
      payments: [
        makePayment({ id: 'd', method: 'deposit_applied', is_money: false, amount_pence: 1000 }),
        makePayment({ id: 'c', method: 'cash', amount_pence: 1000 }),
      ],
    });
    const rows = totalsRows(sale, { vatRegistered: true }).map((r) => [r.id, r.amountPence]);
    expect(rows).toEqual([
      ['totals.subtotal', 5000],
      ['totals.discounts', -500],
      ['totals.total', 4500],
      ['totals.vatIncluded', 750],
      ['totals.depositApplied', -1000],
      ['totals.paid', -1000],
      ['totals.balance', 2500],
    ]);
    const settled = totalsRows(makeSale({ balance_due_pence: 0 }), { vatRegistered: false });
    expect(settled[settled.length - 1]?.id).toBe('totals.balanceZero');
  });

  it('reads parked, editable and a pending card from the sale', () => {
    const parked = { at: 'x', by_staff_id: null, note: null, device: null };
    expect(saleStatusCopyId(makeSale({ parked }))).toBe('sale.status.parked');
    expect(saleStatusCopyId(makeSale({ status: 'completed' }))).toBe('sale.status.completed');
    expect(saleIsEditable(makeSale({ status: 'part_paid' }))).toBe(true);
    expect(saleIsEditable(makeSale({ status: 'voided' }))).toBe(false);
    const pending = makePayment({ id: 'p1', method: 'card_app', status: 'pending' });
    expect(pendingCardPayment(makeSale({ payment_lock_payment_id: 'p1', payments: [pending] }))?.id).toBe('p1');
    expect(pendingCardPayment(makeSale())).toBeNull();
  });

  it('names payment methods for people', () => {
    const card = makePayment({ method: 'card_app', card_brand: 'visa', card_last4: '4242' });
    expect(paymentMethodName(card)).toBe('Visa ending 4242');
    expect(paymentMethodName(makePayment({ method: 'external', payment_type_name: 'Bank transfer' }))).toBe(
      'Bank transfer',
    );
    expect(paymentMethodName(makePayment({ method: 'cash' }))).toBe('cash');
  });
});

describe('gift vouchers and account credit in the sale maths (Pass V)', () => {
  const gift = makePayment({
    id: 'gv',
    method: 'gift_card',
    is_money: false,
    amount_pence: 3000,
    refundable_pence: 0,
    voucher: { account_id: 'acc-1', code_last4: '9HPA', status: 'active', expires_at: null },
  });
  const credit = makePayment({ id: 'cr', method: 'account_credit', is_money: false, amount_pence: 500, refundable_pence: 0 });
  const card = makePayment({ id: 'card', method: 'card_app', amount_pence: 1000, refundable_pence: 1000 });

  it('refunds voucher and credit payments back where they came from, after cards', () => {
    expect(maxRefundablePence([gift, credit, card])).toBe(4500);
    const { slices } = spreadRefund([gift, credit, card], 2000);
    expect(slices.map((s) => [s.payment_id, s.amount_pence])).toEqual([
      ['card', 1000],
      ['gv', 1000],
    ]);
    expect(refundEverything([gift, credit]).map((s) => s.amount_pence)).toEqual([3000, 500]);
    // A deposit applied online is not refunded from here.
    expect(maxRefundablePence([makePayment({ method: 'deposit_applied', is_money: false, refundable_pence: 0 })])).toBe(0);
  });

  it('shows applied voucher and credit as their own totals rows, not as money paid', () => {
    const sale = makeSale({ total_pence: 4500, payments: [gift, credit, card], balance_due_pence: 0 });
    const rows = totalsRows(sale, { vatRegistered: false });
    expect(rows.find((r) => r.id === 'totals.voucher')?.amountPence).toBe(-3000);
    expect(rows.find((r) => r.id === 'totals.credit')?.amountPence).toBe(-500);
    expect(rows.find((r) => r.id === 'totals.paid')?.amountPence).toBe(-1000);
  });

  it('names them for people', () => {
    expect(paymentMethodName(gift)).toBe('gift voucher ending 9HPA');
    expect(paymentMethodName({ ...gift, voucher: null })).toBe('gift voucher');
    expect(paymentMethodName(credit)).toBe('account credit');
  });
});
