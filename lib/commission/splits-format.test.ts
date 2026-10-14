/**
 * Commission splits in words (web `SPLITS_COPY`): the house rules on the deck, a split's direction,
 * its terms in one line, its status badges, why it ended, its earlier versions, statement periods,
 * and the share check the forms use.
 */
import { commissionRangeQuery, isReadOnlySplit, previewQuery, staleSettingsFrom } from '@/lib/commission/api';
import { SPLITS_COPY, splitsT } from '@/lib/commission/splits-copy';
import {
  calendarAt,
  checkPercent,
  directionLine,
  endedLines,
  historyLine,
  lowerFirst,
  nextDay,
  periodText,
  reportRatesText,
  splitBadges,
  statementStatus,
  termsSummary,
  termsSummaryFrom,
} from '@/lib/commission/splits-format';
import { ApiError } from '@/lib/api/client';
import type { SplitTermsView, SplitView } from '@/types/commission-splits';

function terms(over: Partial<SplitTermsView> = {}): SplitTermsView {
  return {
    id: 't-1',
    version: 1,
    effective_from: '2026-11-01',
    services_rate_bps: 4000,
    products_rate_bps: null,
    vat_basis: 'net_ex_vat',
    status: 'accepted',
    proposed_by_you: true,
    proposed_at: '2026-10-14T09:00:00Z',
    decided_at: '2026-10-14T10:00:00Z',
    ...over,
  };
}

function split(over: Partial<SplitView> = {}): SplitView {
  return {
    id: 's-1',
    status: 'active',
    label: 'rent',
    settlement_period: 'monthly',
    role: 'payee',
    payer: { venue_id: 'v-sam', name: 'Sam Cuts' },
    payee: { venue_id: 'v-bloom', name: 'Bloom' },
    partner: { venue_id: 'v-sam', name: 'Sam Cuts' },
    calendar: { id: 'cal-sam', name: 'Sam' },
    proposed_by_you: true,
    created_at: '2026-10-01T09:00:00Z',
    terms: terms(),
    pending: null,
    history: [terms()],
    ended_on: null,
    end_reason: null,
    ended_by_you: null,
    can: { respond: false, withdraw: false, propose_change: true, end: true },
    ...over,
  };
}

describe('the copy deck', () => {
  it('has no em-dash and fills its placeholders', () => {
    for (const [id, text] of Object.entries(SPLITS_COPY)) expect([id, text.includes(String.fromCharCode(0x2014))]).toEqual([id, false]);
    expect(splitsT('biz.youPay', { partner: 'Bloom' })).toBe('You pay Bloom');
    expect(splitsT('form.send')).toBe('Send to {partner}');
  });
});

describe('a split in words', () => {
  it('says who pays whom, and whose calendar it is', () => {
    expect(directionLine(split())).toBe('Sam Cuts pays you');
    expect(directionLine(split({ role: 'payer', partner: { venue_id: 'v-bloom', name: 'Bloom' } }))).toBe('You pay Bloom');
    expect(calendarAt(split())).toBe('Sam at Sam Cuts');
  });

  it('reads the shares as the web does', () => {
    expect(termsSummary(terms())).toBe('40% of services');
    expect(termsSummary(terms({ services_rate_bps: 1250, products_rate_bps: 1000 }))).toBe('12.5% of services and 10% of products');
    expect(termsSummaryFrom(terms())).toBe('40% of services from 1 November 2026');
    expect(reportRatesText([{ effective_from: '2026-10-01', services_rate_bps: 4000, products_rate_bps: null }])).toBe('40% of services');
    expect(
      reportRatesText([
        { effective_from: '2026-10-01', services_rate_bps: 4000, products_rate_bps: null },
        { effective_from: '2026-10-15', services_rate_bps: 3500, products_rate_bps: 500 },
      ]),
    ).toBe('40% of services from 1 October 2026; 35% of services and 5% of products from 15 October 2026');
  });

  it('lists an earlier version with its basis and what became of it', () => {
    expect(historyLine(terms({ version: 2, vat_basis: 'net_inc_vat', status: 'declined' }))).toBe(
      'Version 2: 40% of services, including VAT, from 1 November 2026 (declined)',
    );
    expect(lowerFirst('VAT basis')).toBe('VAT basis');
  });
});

describe('status badges', () => {
  const today = '2026-10-14';

  it('asks for an answer, or waits for the other business, while proposed', () => {
    const pending = terms({ status: 'proposed', proposed_by_you: false });
    expect(splitBadges(split({ status: 'proposed', terms: null, pending, proposed_by_you: false }), today)).toEqual([
      { text: 'Needs your answer', tone: 'warning' },
    ]);
    expect(splitBadges(split({ status: 'proposed', terms: null, pending: { ...pending, proposed_by_you: true } }), today)).toEqual([
      { text: 'Waiting for Sam Cuts', tone: 'neutral' },
    ]);
  });

  it('is Active, with new terms waiting beside it, then Ends after its last day, then Ended', () => {
    expect(splitBadges(split(), today)).toEqual([{ text: 'Active', tone: 'success' }]);
    expect(splitBadges(split({ pending: terms({ id: 't-2', status: 'proposed', proposed_by_you: false }) }), today)).toEqual([
      { text: 'Active', tone: 'success' },
      { text: 'Needs your answer', tone: 'warning' },
    ]);
    expect(splitBadges(split({ ended_on: '2026-10-31' }), today)).toEqual([{ text: 'Ends after 31 October 2026', tone: 'warning' }]);
    expect(splitBadges(split({ status: 'ended', ended_on: '2026-10-01' }), today)).toEqual([{ text: 'Ended', tone: 'neutral' }]);
    expect(splitBadges(split({ status: 'declined' }), today)[0]!.text).toBe('Declined');
    expect(splitBadges(split({ status: 'withdrawn' }), today)[0]!.text).toBe('Withdrawn');
  });

  it('says when an ended split last counted, and when the link ended it', () => {
    expect(endedLines(split(), today)).toEqual([]);
    expect(endedLines(split({ status: 'ended', ended_on: '2026-10-01', end_reason: 'link_ended' }), today)).toEqual([
      'The last day it counted was 1 October 2026.',
      'It ended because the link or collective no longer allows it.',
    ]);
    expect(isReadOnlySplit(split({ end_reason: 'link_ended' }))).toBe(true);
    expect(isReadOnlySplit(split({ end_reason: 'ended' }))).toBe(false);
  });
});

describe('statements', () => {
  it('names the period and its status', () => {
    expect(periodText({ start: '2026-10-01', end: '2026-10-31' })).toBe('1 October 2026 to 31 October 2026');
    const period = { start: '2026-10-01', end: '2026-10-31', services_pence: 0, products_pence: 0, owed_pence: 0, settlement: null };
    expect(statementStatus({ ...period, status: 'outstanding' })).toEqual({ text: 'Outstanding', tone: 'warning' });
    expect(statementStatus({ ...period, status: 'current' }).text).toBe('In progress');
    expect(statementStatus({ ...period, status: 'nothing_owed' }).text).toBe('Nothing owed');
    expect(nextDay('2026-10-31')).toBe('2026-11-01');
  });
});

describe('the share check', () => {
  it('takes 0 to 100 with up to two places, a comma as the point', () => {
    expect(checkPercent('40')).toEqual({ ok: true, value: 40 });
    expect(checkPercent(' 12,5 ')).toEqual({ ok: true, value: 12.5 });
    expect(checkPercent('0')).toEqual({ ok: true, value: 0 });
    expect(checkPercent('')).toEqual({ ok: false, message: 'Enter a percentage from 0 to 100.' });
    expect(checkPercent('101')).toEqual({ ok: false, message: 'Enter a percentage from 0 to 100.' });
    expect(checkPercent('ten')).toEqual({ ok: false, message: 'Enter a percentage from 0 to 100.' });
    expect(checkPercent('12.345')).toEqual({ ok: false, message: 'Use up to two decimal places.' });
  });
});

describe('the wire', () => {
  it('asks for a range by preset or dates, and the preview in the contract order', () => {
    expect(commissionRangeQuery({ kind: 'preset', preset: 'last-month' })).toBe('preset=last-month');
    expect(commissionRangeQuery({ kind: 'custom', from: '2026-09-01', to: '2026-09-30' }, 'cal 1')).toBe(
      'from=2026-09-01&to=2026-09-30&calendar_id=cal%201',
    );
    expect(
      previewQuery({ calendar_id: 'c', other_venue_id: 'v', services_rate_percent: 40, products_rate_percent: 5, vat_basis: 'net_inc_vat' }),
    ).toBe('calendar_id=c&other_venue_id=v&services_rate_percent=40&products_rate_percent=5&vat_basis=net_inc_vat');
  });

  it('reads the fresh settings a 412 carries', () => {
    const fresh = { rates: [], people: [] };
    expect(staleSettingsFrom(new ApiError('Stale', 412, { error: 'Stale', code: 'STALE_RESOURCE', settings: fresh }))).toBe(fresh);
    expect(staleSettingsFrom(new ApiError('Stale', 412, { error: 'Stale', code: 'STALE_RESOURCE' }))).toBeNull();
    expect(staleSettingsFrom(new ApiError('No', 400, { error: 'No', settings: fresh }))).toBeNull();
  });
});
