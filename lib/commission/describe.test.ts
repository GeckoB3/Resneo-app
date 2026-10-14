/**
 * The Commission splits page in words (web `src/lib/commission/describe.test.ts`, case for case):
 * what each calendar earns, what each split shares, and the house rules on the copy deck.
 */
import {
  businessSummary,
  exceptionsSentence,
  isLiveSplit,
  nextChangeSentence,
  personShare,
  personShareSentence,
  shareWhat,
  splitSentence,
  splitTermsSentence,
  teamSummary,
  termsDetail,
} from '@/lib/commission/describe';
import { SPLITS_COPY } from '@/lib/commission/splits-copy';
import { ownRateOn, personKeyOf, shareOf } from '@/lib/commission/team-share';
import type { CommissionRate, SplitTermsView, SplitView } from '@/types/commission-splits';

const TODAY = '2026-10-14';
const JESS = { calendar_id: 'cal-jess', staff_id: null };
const KIM = { calendar_id: 'cal-kim', staff_id: null };
const day = (ymd: string) => ymd;

let nextId = 0;
function rate(over: Partial<CommissionRate>): CommissionRate {
  nextId += 1;
  return {
    id: `r-${nextId}`,
    item_type: 'service',
    category_id: null,
    category_name: null,
    calendar_id: null,
    staff_id: null,
    person_name: null,
    rate_bps: 500,
    effective_from: '2026-01-01',
    created_by_name: null,
    created_at: '2026-01-01T09:00:00Z',
    ...over,
  };
}

const RATES: CommissionRate[] = [
  rate({ rate_bps: 500 }),
  rate({ item_type: 'product', rate_bps: 2000 }),
  rate({ category_id: 'colour', category_name: 'Colour', rate_bps: 800 }),
  rate({ calendar_id: 'cal-jess', rate_bps: 4000, effective_from: '2026-09-01' }),
  rate({ calendar_id: 'cal-jess', category_id: 'colour', category_name: 'Colour', rate_bps: 5000, effective_from: '2026-09-01' }),
  rate({ calendar_id: 'cal-jess', rate_bps: 4500, effective_from: '2026-11-01' }),
];

describe('personShare', () => {
  it('uses their own rate where they have one, and yours otherwise', () => {
    const jess = personShare(RATES, JESS, TODAY);
    expect(jess.service).toMatchObject({ bps: 4000, own: true, next: { date: '2026-11-01', bps: 4500 } });
    expect(jess.product).toMatchObject({ bps: 2000, own: false, next: null });
    expect(jess.anyOwn).toBe(true);
    const kim = personShare(RATES, KIM, TODAY);
    expect(kim.service).toMatchObject({ bps: 500, own: false });
    expect(kim.anyOwn).toBe(false);
  });

  it('lists the categories that earn something else, as SQL ranks them', () => {
    // Jess's own Colour rate beats hers; your Colour rate would not apply over her own service rate.
    expect(personShare(RATES, JESS, TODAY).exceptions).toEqual([{ category_id: 'colour', name: 'Colour', item_type: 'service', bps: 5000 }]);
    // Kim has no own rate, so your Colour rate shows.
    expect(personShare(RATES, KIM, TODAY).exceptions).toEqual([{ category_id: 'colour', name: 'Colour', item_type: 'service', bps: 800 }]);
    const withoutOwnCategory = RATES.filter((r) => !(r.calendar_id === 'cal-jess' && r.category_id));
    expect(personShare(withoutOwnCategory, JESS, TODAY).exceptions).toEqual([]);
  });

  it('is 0% everywhere with no rates', () => {
    const none = personShare([], JESS, TODAY);
    expect([none.service.bps, none.product.bps, none.voucher.bps]).toEqual([0, 0, 0]);
  });
});

describe('sentences', () => {
  it('says what a person earns, leaving out what is 0%', () => {
    expect(shareWhat(500, 2000)).toBe('5% of services and 20% of products');
    expect(shareWhat(500, 0)).toBe('5% of services');
    expect(shareWhat(0, 2000, 150)).toBe('20% of products and 1.5% of gift vouchers');
    expect(shareWhat(0, 0, 0)).toBeNull();
    expect(personShareSentence('Jess', personShare(RATES, JESS, TODAY), 'their_share')).toBe(
      'You pay Jess 40% of services and 20% of products, as their share.',
    );
    expect(personShareSentence('Jess', personShare([], JESS, TODAY), 'commission')).toBe("You don't pay Jess a share yet.");
    const colourOnly = [rate({ calendar_id: 'cal-jess', category_id: 'colour', category_name: 'Colour', rate_bps: 1000 })];
    expect(personShareSentence('Jess', personShare(colourOnly, JESS, TODAY), 'commission')).toBe('You pay Jess only on some categories, as commission.');
    expect(exceptionsSentence(personShare(colourOnly, JESS, TODAY))).toBe('Different for Colour (10%).');
    expect(exceptionsSentence(personShare(RATES, JESS, TODAY))).toBe('Different for Colour (50%).');
    expect(nextChangeSentence(personShare(RATES, JESS, TODAY), day)).toBe('From 2026-11-01: 45% of services.');
  });

  it('describes a business split from your side', () => {
    const t = { services_rate_bps: 4000, products_rate_bps: 1000, vat_basis: 'net_ex_vat', effective_from: '2026-11-02' } as SplitTermsView;
    const s = { role: 'payee', partner: { venue_id: 'v', name: 'Sam Cuts' }, label: 'rent', settlement_period: 'weekly' } as SplitView;
    expect(splitTermsSentence(s, t)).toBe('Sam Cuts pays you 40% of services and 10% of products, as rent.');
    expect(splitTermsSentence({ ...s, role: 'payer', label: 'fee' }, t)).toBe('You pay Sam Cuts 40% of services and 10% of products, as a fee.');
    expect(termsDetail(s, t, day)).toBe('Worked out before VAT, from 2026-11-02. Settle up weekly.');
    expect(splitSentence({ ...s, terms: null, pending: t, history: [t] } as SplitView)).toBe(
      'Proposed: Sam Cuts pays you 40% of services and 10% of products, as rent.',
    );
    expect(splitSentence({ ...s, terms: t, pending: null, history: [t] } as SplitView)).toBe('Sam Cuts pays you 40% of services and 10% of products, as rent.');
  });

  it('sums up a form before it saves', () => {
    expect(teamSummary({ name: 'Jess', login: false, date: '14 October 2026', serviceBps: 4000, productBps: 1000, label: 'commission' })).toBe(
      'From 14 October 2026, you pay Jess 40% of services and 10% of products on their calendar, as commission.',
    );
    expect(teamSummary({ name: 'Desk', login: true, date: '14 October 2026', serviceBps: 0, productBps: 300, label: 'commission' })).toBe(
      'From 14 October 2026, you pay Desk 3% of products from their sales at Checkout, as commission.',
    );
    expect(teamSummary({ name: 'Jess', login: false, date: '14 October 2026', serviceBps: 0, productBps: 0, label: 'commission' })).toBe(
      'From 14 October 2026, you pay Jess nothing.',
    );
    expect(
      businessSummary({
        role: 'payee',
        partner: 'Sam Cuts',
        calendar: 'Sam',
        date: '2 November 2026',
        servicesBps: 4000,
        productsBps: null,
        basis: 'net_ex_vat',
        label: 'rent',
        period: 'weekly',
      }),
    ).toBe(
      "From 2 November 2026, Sam Cuts pays you 40% of services on Sam's calendar, worked out before VAT. It counts as rent and you settle up weekly. Nothing counts until Sam Cuts accepts.",
    );
  });

  it('keeps live splits on the calendars and the rest in the past', () => {
    expect(isLiveSplit({ status: 'proposed', ended_on: null }, TODAY)).toBe(true);
    expect(isLiveSplit({ status: 'active', ended_on: null }, TODAY)).toBe(true);
    expect(isLiveSplit({ status: 'ended', ended_on: TODAY }, TODAY)).toBe(true);
    expect(isLiveSplit({ status: 'ended', ended_on: '2026-10-13' }, TODAY)).toBe(false);
    expect(isLiveSplit({ status: 'declined', ended_on: null }, TODAY)).toBe(false);
    expect(isLiveSplit({ status: 'withdrawn', ended_on: null }, TODAY)).toBe(false);
  });
});

describe('the copy deck', () => {
  it('has no em-dashes and no unfilled double spaces', () => {
    for (const [id, text] of Object.entries(SPLITS_COPY)) {
      expect([id, text.includes(String.fromCharCode(0x2014))]).toEqual([id, false]);
      expect([id, /  /.test(text)]).toEqual([id, false]);
    }
  });
});

// (app) The pieces of the web's team-share.ts and rate-resolver.ts the app copies.
describe('one person', () => {
  it("reads their own rate on a date, a stop as none, and a same-day correction as the newer row", () => {
    const rows = [
      rate({ calendar_id: 'cal-jess', rate_bps: 4000, effective_from: '2026-09-01' }),
      rate({ calendar_id: 'cal-jess', rate_bps: 4200, effective_from: '2026-09-01', created_at: '2026-09-01T12:00:00Z' }),
      rate({ calendar_id: 'cal-jess', rate_bps: null, effective_from: '2026-12-01' }),
    ];
    expect(ownRateOn(rows, 'service', JESS, '2026-08-31')).toBeNull();
    expect(ownRateOn(rows, 'service', JESS, TODAY)).toBe(4200);
    expect(ownRateOn(rows, 'service', JESS, '2026-12-01')).toBeNull();
    expect(ownRateOn(rows, 'service', KIM, TODAY)).toBeNull();
  });

  it('keys a calendar and a login, and works out a share to the penny', () => {
    expect(personKeyOf(JESS)).toBe('c:cal-jess');
    expect(personKeyOf({ calendar_id: null, staff_id: 'staff-desk' })).toBe('s:staff-desk');
    expect(shareOf(10_000, 3000)).toBe(3000);
    expect(shareOf(999, 1250)).toBe(125);
  });
});
