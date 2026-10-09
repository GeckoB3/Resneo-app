/**
 * The gift voucher and account credit rules in the app (UX spec §20.2 to §20.5), checked against
 * the web till's `voucher-math.ts` and `voucher-code.ts` behaviour.
 */
import {
  codeInputProblem,
  formatVoucherCode,
  isPlausibleVoucherCode,
  isResneoVoucherCode,
  normaliseVoucherCode,
  tidyCodeInput,
} from '@/lib/pos/voucher-code';
import {
  appliedStoredValue,
  creditLocked,
  issuedVouchers,
  refundableOf,
  sendAtIso,
  sendDateBounds,
  sendDateProblem,
  storedValueAmountProblem,
  storedValueCap,
  storedValueDefault,
  storedValueRefundNote,
  todayInZone,
  voucherAmountProblem,
  voucherBlock,
  voucherDelivery,
  voucherLastDay,
  voucherLineRefundState,
  voucherSellLine,
  voucherStatusCopyId,
} from '@/lib/pos/voucher-math';
import { makeLine, makePayment, makeSale } from '@/lib/pos/test-sale';

const LIMITS = { preset_pence: [2500, 5000], custom_allowed: true, min_pence: 1000, max_pence: 50000 };

describe('voucher codes', () => {
  it('accepts any case, spaces and dashes, and groups a ResNeo code in fours', () => {
    expect(normaliseVoucherCode(' 7k4q-m2xd 9hpa ')).toBe('7K4QM2XD9HPA');
    expect(isResneoVoucherCode('7k4q-m2xd-9hpa')).toBe(true);
    expect(formatVoucherCode('7k4qm2xd9hpa')).toBe('7K4Q-M2XD-9HPA');
    expect(tidyCodeInput('7k4qm2')).toBe('7K4Q-M2');
  });

  it('knows the alphabet has no 0, O, 1 or I', () => {
    expect(isResneoVoucherCode('0K4QM2XD9HPA')).toBe(false);
    expect(isResneoVoucherCode('IK4QM2XD9HPA')).toBe(false);
  });

  it("takes a venue's own code of 4 to 32 letters and numbers, and stops anything else before sending", () => {
    expect(isPlausibleVoucherCode('PAPER123')).toBe(true);
    expect(codeInputProblem('')).toBe('empty');
    expect(codeInputProblem('12')).toBe('invalid');
    expect(codeInputProblem('AB$%')).toBe('invalid');
    expect(codeInputProblem('A'.repeat(33))).toBe('invalid');
    expect(codeInputProblem('7K4Q-M2XD-9HPA')).toBeNull();
    expect(tidyCodeInput('A'.repeat(14))).toBe('A'.repeat(14));
  });
});

describe('selling a voucher', () => {
  it('checks the value in the order the server does', () => {
    expect(voucherAmountProblem(LIMITS, null)).toBe('empty');
    expect(voucherAmountProblem(LIMITS, 500)).toBe('tooLow');
    expect(voucherAmountProblem(LIMITS, 60000)).toBe('tooHigh');
    expect(voucherAmountProblem(LIMITS, 3000)).toBeNull();
    expect(voucherAmountProblem({ ...LIMITS, custom_allowed: false }, 3000)).toBe('notOffered');
    expect(voucherAmountProblem({ ...LIMITS, custom_allowed: false }, 5000)).toBeNull();
  });

  it('sends on a day from tomorrow to a year ahead, at 8am in the venue zone', () => {
    expect(sendDateBounds('2026-12-24')).toEqual({ min: '2026-12-25', max: '2027-12-24' });
    expect(sendDateProblem('2026-12-24', '2026-12-24')).toBe('outOfRange');
    expect(sendDateProblem('2026-12-25', '2026-12-24')).toBeNull();
    expect(sendDateProblem('', '2026-12-24')).toBe('empty');
    // GMT in winter, BST in summer.
    expect(sendAtIso('2026-12-25', 'Europe/London')).toBe('2026-12-25T08:00:00.000Z');
    expect(sendAtIso('2027-07-01', 'Europe/London')).toBe('2027-07-01T07:00:00.000Z');
  });

  it("reads today in the venue's zone", () => {
    // 23:30 UTC on 30 June is already 1 July in London.
    expect(todayInZone('Europe/London', new Date('2027-06-30T23:30:00Z'))).toBe('2027-07-01');
  });

  const draft = {
    valuePence: 5000,
    who: 'gift' as const,
    recipientName: ' Jo ',
    recipientEmail: 'jo@example.com',
    message: 'Happy birthday',
    delivery: 'emailLater' as const,
    sendDate: '2026-12-25',
    buyerEmail: '',
  };
  const ctx = { limits: LIMITS, todayYmd: '2026-12-01', timeZone: 'Europe/London', clientName: 'Alex', clientEmail: 'alex@example.com' };

  it('builds a gift line with the recipient, the message and the send date, never a code', () => {
    const out = voucherSellLine(draft, ctx);
    expect(out.ready).toBe(true);
    expect(out.line).toEqual({
      kind: 'gift_card',
      value_pence: 5000,
      buyer_name: 'Alex',
      recipient_name: 'Jo',
      message: 'Happy birthday',
      recipient_email: 'jo@example.com',
      buyer_email: 'alex@example.com',
      send_at: '2026-12-25T08:00:00.000Z',
    });
    expect(JSON.stringify(out.line)).not.toMatch(/code/);
  });

  it('needs a name for a gift and an address to email it', () => {
    expect(voucherSellLine({ ...draft, recipientName: ' ' }, ctx).ready).toBe(false);
    expect(voucherSellLine({ ...draft, recipientEmail: 'not-an-address' }, ctx).ready).toBe(false);
    expect(voucherSellLine({ ...draft, message: 'x'.repeat(301) }, ctx).ready).toBe(false);
  });

  it("emails a walk-in buyer's own voucher to the address typed for them", () => {
    const walkIn = { ...ctx, clientName: null, clientEmail: null };
    const buyer = { ...draft, who: 'buyer' as const, delivery: 'emailNow' as const, recipientName: '', recipientEmail: '' };
    const missing = voucherSellLine(buyer, walkIn);
    expect(missing.needsBuyerEmail).toBe(true);
    expect(missing.ready).toBe(false);
    const typed = voucherSellLine({ ...buyer, buyerEmail: 'sam@example.com' }, walkIn);
    expect(typed.ready).toBe(true);
    expect(typed.line).toEqual({ kind: 'gift_card', value_pence: 5000, buyer_email: 'sam@example.com' });
  });

  it('hands a printed voucher over with no address at all', () => {
    const out = voucherSellLine({ ...draft, who: 'buyer', delivery: 'print' }, { ...ctx, clientEmail: null });
    expect(out.ready).toBe(true);
    expect(out.line).toEqual({ kind: 'gift_card', value_pence: 5000, buyer_name: 'Alex' });
  });

  it('says how a line goes out', () => {
    expect(voucherDelivery(null)).toBe('print');
    expect(voucherDelivery({ recipient_email: 'a@b.co' })).toBe('now');
    expect(voucherDelivery({ recipient_email: 'a@b.co', send_at: '2026-12-25T08:00:00Z' })).toBe('later');
  });
});

describe('paying with a voucher or credit', () => {
  const voucherLine = makeLine({ id: 'v', line_type: 'gift_card', reporting_group: 'other', total_pence: 2500, unit_price_pence: 2500 });

  it('can pay the balance less the voucher lines on the sale', () => {
    const sale = makeSale({ lines: [makeLine(), voucherLine], balance_due_pence: 6500 });
    expect(storedValueCap(sale)).toEqual({ capPence: 4000, heldPence: 2500 });
    expect(storedValueDefault(5000, 4000)).toBe(4000);
    expect(storedValueDefault(1500, 4000)).toBe(1500);
  });

  it('checks the amount against what is on it and what can be paid this way', () => {
    expect(storedValueAmountProblem(null, 5000, 4000)).toBe('empty');
    expect(storedValueAmountProblem(0, 5000, 4000)).toBe('zero');
    expect(storedValueAmountProblem(6000, 5000, 4000)).toBe('overAvailable');
    expect(storedValueAmountProblem(4500, 5000, 4000)).toBe('overCap');
    expect(storedValueAmountProblem(4000, 5000, 4000)).toBeNull();
  });

  it('names the states a found voucher cannot be used in', () => {
    expect(voucherBlock('active')).toBeNull();
    expect(voucherBlock('used_up')).toBe('usedUp');
    expect(voucherBlock('cancelled')).toBe('cancelled');
    expect(voucherBlock('frozen')).toBe('frozen');
    expect(voucherBlock('expired')).toBe('expired');
    expect(voucherStatusCopyId('frozen')).toBe('vch.status.frozen');
    expect(voucherStatusCopyId('active')).toBe('vch.status.active');
  });

  it('locks the client while credit is used and not refunded', () => {
    const credit = makePayment({ method: 'account_credit', is_money: false, amount_pence: 1000, refundable_pence: 0 });
    expect(creditLocked(makeSale({ payments: [credit] }))).toBe(true);
    expect(creditLocked(makeSale({ payments: [{ ...credit, refunded_pence: 1000 }] }))).toBe(false);
    expect(appliedStoredValue([credit], 'account_credit')).toBe(1000);
  });

  it('gives "ending" the last good day, a second before the voucher stops', () => {
    expect(voucherLastDay('2027-01-01T00:00:00Z', 'Europe/London')).toBe('31 December 2026');
    expect(voucherLastDay(null, 'Europe/London')).toBeNull();
  });
});

describe('refunds', () => {
  it('works out what a voucher or credit payment can give back, as the sale leaves it at zero', () => {
    const gift = makePayment({ method: 'gift_card', is_money: false, amount_pence: 3000, refunded_pence: 500, refundable_pence: 0 });
    expect(refundableOf(gift)).toBe(2500);
    expect(refundableOf(makePayment({ method: 'deposit_applied', is_money: false, refundable_pence: 0 }))).toBe(0);
  });

  it('sends a voucher that has run out to credit, which needs a client', () => {
    const now = Date.parse('2027-02-01T00:00:00Z');
    const live = makePayment({
      method: 'gift_card',
      is_money: false,
      voucher: { account_id: 'a', code_last4: '9HPA', status: 'active', expires_at: '2027-06-01T00:00:00Z' },
    });
    const gone = { ...live, voucher: { ...live.voucher!, expires_at: '2027-01-01T00:00:00Z' } };
    expect(storedValueRefundNote(live, false, now)).toEqual({ note: null, blocked: false });
    expect(storedValueRefundNote(gone, true, now)).toEqual({ note: 'voucherExpired', blocked: false });
    expect(storedValueRefundNote(gone, false, now)).toEqual({ note: 'needsClient', blocked: true });
    expect(storedValueRefundNote(makePayment(), false, now)).toBeNull();
  });

  it('refunds a voucher line only while something is left, and only an admin once part is used', () => {
    expect(voucherLineRefundState({ balance_pence: 5000 }, 5000, false)).toEqual({ state: 'ok', balancePence: 5000 });
    expect(voucherLineRefundState({ balance_pence: 2000 }, 5000, false)).toEqual({ state: 'adminOnly', balancePence: 2000 });
    expect(voucherLineRefundState({ balance_pence: 2000 }, 5000, true)).toEqual({ state: 'ok', balancePence: 2000 });
    expect(voucherLineRefundState({ balance_pence: 0 }, 5000, true)).toEqual({ state: 'usedUp', balancePence: 0 });
    expect(voucherLineRefundState(null, 5000, true).state).toBe('unknown');
  });

  it('lists the vouchers a completed sale made', () => {
    const made = makeLine({
      id: 'v1',
      line_type: 'gift_card',
      voucher: {
        account_id: 'acc-1',
        code_last4: '9HPA',
        recipient_name: null,
        recipient_email: null,
        message: null,
        send_at: null,
        buyer_name: null,
        buyer_email: null,
        status: 'active',
        balance_pence: 5000,
      },
    });
    const notYet = makeLine({ id: 'v2', line_type: 'gift_card', voucher: { ...made.voucher!, account_id: null } });
    expect(issuedVouchers(makeSale({ lines: [makeLine(), made, notYet] })).map((l) => l.id)).toEqual(['v1']);
  });
});
