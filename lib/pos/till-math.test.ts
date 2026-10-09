/**
 * Till sessions' pure parts (POS app step 3, UX spec §7): the notes and coins grid, which till a
 * cash payment opens, the blind close's words and banking, the X and Z report sections and tips
 * paid out.
 */
import { posCopyFor } from '@/lib/pos/copy';
import {
  bankingAddsUp,
  businessDateLabel,
  defaultBanking,
  denominationLabel,
  denominationsFromDraft,
  GBP_DENOMINATIONS,
  isLeftOpen,
  reportWhen,
  shiftYmd,
  tillForCash,
  tillMethodLabel,
  tillReportFilename,
  tillReportSections,
  tillsInOrder,
  tipPayouts,
  varianceWords,
} from '@/lib/pos/till-math';
import type { PosTillReport, PosTillSession, PosTillState } from '@/types/pos';

const t = posCopyFor('client');
const money = (p: number) => `${p < 0 ? '-' : ''}£${(Math.abs(p) / 100).toFixed(2)}`;

function session(over: Partial<PosTillSession> = {}): PosTillSession {
  return {
    id: 's1',
    till_id: 't1',
    status: 'open',
    business_date: '2026-10-09',
    opened_at: '2026-10-09T07:52:00Z',
    opened_by_name: 'Jess',
    opening_float_pence: 10000,
    closed_at: null,
    closed_by_name: null,
    count_attempts: 0,
    counted_cash_pence: null,
    variance_pence: null,
    variance_reason: null,
    cash_to_bank_pence: null,
    float_left_pence: null,
    version: 1,
    ...over,
  };
}

function till(id: string, over: Partial<PosTillState> = {}): PosTillState {
  return { id, name: `Till ${id}`, is_active: true, session: null, last_float_left_pence: null, ...over };
}

describe('the notes and coins grid', () => {
  it('names notes and coins as the copy deck does', () => {
    expect(denominationLabel(GBP_DENOMINATIONS[0]!, t)).toBe('£50 notes');
    expect(denominationLabel(GBP_DENOMINATIONS.find((d) => d.pence === 50)!, t)).toBe('50p coins');
  });

  it('adds up counts and bagged coin, and sends only what was counted', () => {
    expect(denominationsFromDraft({ '5000': '2', '1000': '3', '2': '4', bagged: '12.50' })).toEqual({
      body: { '5000': 2, '1000': 3, '2': 4, bagged: 1250 },
      totalPence: 10000 + 3000 + 8 + 1250,
    });
    expect(denominationsFromDraft({ '500': '0', '200': '' })).toEqual({ body: {}, totalPence: 0 });
  });

  it('refuses a count that is not a whole number', () => {
    expect(denominationsFromDraft({ '5000': '1.5' })).toBeNull();
    expect(denominationsFromDraft({ bagged: 'lots' })).toBeNull();
  });
});

describe('which till a cash payment opens', () => {
  const cash = {
    enabled: true,
    blind_close: true,
    variance_reason_threshold_pence: 500,
    default_float_pence: 10000,
    legacy_cash_till_id: null,
  };

  it("prefers the sale's own till, then the venue's till for app cash, then the only till", () => {
    const tills = [till('a'), till('b')];
    expect(tillForCash({ tills, cash }, 'b')?.id).toBe('b');
    expect(tillForCash({ tills, cash: { ...cash, legacy_cash_till_id: 'a' } }, null)?.id).toBe('a');
    expect(tillForCash({ tills: [till('a'), till('b', { is_active: false })], cash }, null)?.id).toBe('a');
  });

  it('asks the person to choose when it cannot tell', () => {
    expect(tillForCash({ tills: [till('a'), till('b')], cash }, null)).toBeNull();
  });

  it('puts open tills first and spots one left open from an earlier day', () => {
    const open = till('b', { session: session({ business_date: '2026-10-08' }) });
    expect(tillsInOrder([till('a'), open]).map((x) => x.id)).toEqual(['b', 'a']);
    expect(isLeftOpen(open, '2026-10-09')).toBe(true);
    expect(isLeftOpen(till('a'), '2026-10-09')).toBe(false);
  });
});

describe('closing the till', () => {
  it('says whether the count balances, is over or short', () => {
    expect(varianceWords(0, t, money)).toBe('It balances.');
    expect(varianceWords(150, t, money)).toBe('£1.50 over');
    expect(varianceWords(-150, t, money)).toBe('£1.50 short');
  });

  it('leaves the usual float and banks the rest, never more float than was counted', () => {
    expect(defaultBanking(18000, 10000)).toEqual({ bankPence: 8000, floatPence: 10000 });
    expect(defaultBanking(4000, 10000)).toEqual({ bankPence: 0, floatPence: 4000 });
    expect(bankingAddsUp(18000, 8000, 10000)).toBe(true);
    expect(bankingAddsUp(18000, 8000, 9000)).toBe(false);
    expect(bankingAddsUp(18000, null, 10000)).toBe(false);
  });
});

describe('X and Z reports', () => {
  const z: PosTillReport = {
    kind: 'z',
    status: 'closed',
    session_id: 's1',
    till_id: 't1',
    till_name: 'Front desk',
    business_date: '2026-09-25',
    opened_at: '2026-09-25T07:52:00Z',
    opened_by_name: 'Jess',
    as_at: '2026-09-25T17:07:00Z',
    closed_at: '2026-09-25T17:07:00Z',
    closed_by_name: 'Sam',
    sales_count: 38,
    by_method: [
      { method: 'card_reader', name: 'Front desk', amount_pence: 128450, count: 30 },
      { method: 'cash', name: null, amount_pence: 21200, count: 8 },
    ],
    taken_pence: 149650,
    refunds: [{ method: 'cash', name: null, amount_pence: 1200, count: 1 }],
    refunds_pence: 1200,
    discounts: { sales: 9, pence: 4620 },
    voids: { sales: 1, pence: 4500 },
    tips: { card_pence: 8800, cash_pence: 1500, paid_out_pence: 1500 },
    cash: {
      float_pence: 10000,
      sales_pence: 21200,
      tips_pence: 1500,
      legacy_pence: 2000,
      refunds_pence: 1200,
      paid_in_pence: 2000,
      paid_out_pence: 850,
      drops_pence: 15000,
      tips_paid_out_pence: 1500,
      expected_pence: 18150,
    },
    expected_cash_pence: 18150,
    counted_cash_pence: 18000,
    variance_pence: -150,
    variance_reason: 'change given wrongly',
    cash_to_bank_pence: 8000,
    float_left_pence: 10000,
  };
  const f = { t, money, when: (iso: string) => reportWhen(iso, 'Europe/London') };

  it("follows the spec's example, in the venue's time", () => {
    const sections = tillReportSections(z, f);
    expect(sections[0]!.lines.map((l) => [l.label, l.value])).toEqual([
      ['Opened', '25/09 08:52  by Jess'],
      ['Closed', '25/09 18:07  by Sam'],
      ['Sales', '38'],
    ]);
    expect(sections[1]!.heading).toBe('Takings by method');
    expect(sections[1]!.lines[0]!.label).toBe('Card reader: Front desk');
    const cash = sections.find((s) => s.heading === 'Cash')!;
    expect(cash.lines.map((l) => l.label)).toContain('Older app and desk deposits');
    expect(cash.lines.find((l) => l.label === 'Difference')!.value).toBe('-£1.50');
    expect(cash.lines.some((l) => l.label === 'Reason: change given wrongly')).toBe(true);
  });

  it('leaves out what the server took out for someone who may not see expected cash', () => {
    const x: PosTillReport = {
      ...z,
      kind: 'x',
      status: 'open',
      cash: null,
      expected_cash_pence: null,
      counted_cash_pence: null,
      tips: { card_pence: 8800, cash_pence: null, paid_out_pence: 0 },
    };
    const sections = tillReportSections(x, f);
    expect(sections.find((s) => s.heading === 'Cash')).toBeUndefined();
    expect(sections.find((s) => s.heading === 'Tips')!.lines.map((l) => l.label)).toEqual(['On cards']);
  });

  it('names the PDF as the web does', () => {
    expect(tillReportFilename(z)).toBe('z-report-front-desk-2026-09-25.pdf');
    expect(tillMethodLabel('external', 'Bank transfer')).toBe('Other: Bank transfer');
  });
});

describe('tips paid out', () => {
  it('pays the people ticked, never more than they are owed', () => {
    const rows = [
      { calendar_id: 'c1', staff_id: null, picked: true, amountPence: 1200, unpaid_pence: 1500 },
      { calendar_id: null, staff_id: 's2', picked: true, amountPence: 300, unpaid_pence: 300 },
      { calendar_id: 'c3', staff_id: null, picked: false, amountPence: 900, unpaid_pence: 900 },
    ];
    expect(tipPayouts(rows)).toEqual({
      payouts: [
        { calendar_id: 'c1', amount_pence: 1200 },
        { staff_id: 's2', amount_pence: 300 },
      ],
      totalPence: 1500,
      valid: true,
    });
    expect(tipPayouts([{ ...rows[0]!, amountPence: 2000 }]).valid).toBe(false);
    expect(tipPayouts([rows[2]!]).valid).toBe(false);
  });
});

describe('days', () => {
  it('moves a business date and reads it', () => {
    expect(shiftYmd('2026-10-01', -1)).toBe('2026-09-30');
    expect(businessDateLabel('2026-10-09')).toBe('Fri 9 Oct');
  });
});
