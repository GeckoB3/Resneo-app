/**
 * The pure parts of Reports' POS tabs, against the web's own helpers (src/lib/reports/pos-reports.ts,
 * src/app/dashboard/reports/report-format.ts, pos-report-ui.tsx, VouchersSection.tsx,
 * VoucherSheet.tsx and VoucherImportDialog.tsx).
 */
import {
  csvHeaderRow,
  customRangeProblem,
  filenameFromDisposition,
  formatMoney,
  formatMoneyExact,
  formatReportDate,
  guessColumns,
  hasProductSections,
  isDisputeHold,
  marginPercentLabel,
  movementWords,
  periodLabel,
  rangeQuery,
  refundReasonLabel,
  sellThroughPercent,
  shortChartLabel,
  stockRowName,
  takingsMethodLabel,
  takingsPersonLabel,
  tipRecipientLabel,
  vatRateLabel,
  voucherCount,
  voucherLastDayYmd,
  voucherReportPeriod,
} from '@/lib/reports/pos-report-format';
import type { VoucherMovement } from '@/types/pos-reports';

describe('range and grain', () => {
  it('sends the query the web sends', () => {
    expect(rangeQuery({ kind: 'preset', preset: 'this-week' }, 'day')).toBe('grain=day&preset=this-week');
    expect(rangeQuery({ kind: 'custom', from: '2026-10-01', to: '2026-10-09' }, 'month')).toBe('grain=month&from=2026-10-01&to=2026-10-09');
  });

  it('refuses an inverted range and one over 400 days, in the web words', () => {
    expect(customRangeProblem('2026-10-09', '2026-10-01')).toBe('The end date must not be before the start date.');
    expect(customRangeProblem('2025-01-01', '2026-10-01')).toBe('Choose a range of 400 days or less.');
    expect(customRangeProblem('2026-01-01', '2026-02-04')).toBeNull();
    // 400 days exactly is allowed.
    expect(customRangeProblem('2026-01-01', '2027-02-04')).toBeNull();
  });
});

describe('period labels', () => {
  it('sizes the label to the grain', () => {
    expect(periodLabel('2026-10-05', '2026-10-05', 'day')).toBe('Mon 5 Oct');
    expect(periodLabel('2026-10-01', '2026-10-31', 'month')).toBe('October 2026');
    expect(periodLabel('2026-10-05', '2026-10-11', 'week')).toBe('5 Oct to 11 Oct 2026');
    expect(periodLabel('2025-12-29', '2026-01-04', 'week')).toBe('29 Dec 2025 to 4 Jan 2026');
    expect(periodLabel('2026-10-09', '2026-10-09', 'week')).toBe('9 Oct 2026');
  });

  it('labels a chart axis and a report date', () => {
    expect(shortChartLabel('2026-10-05', 'day')).toBe('5 Oct');
    expect(shortChartLabel('2026-10-01', 'month')).toBe('Oct 26');
    expect(formatReportDate('2026-10-08')).toBe('8 Oct 2026');
    expect(formatReportDate('2026-10-08T10:00:00Z')).toBe('8 Oct 2026');
    expect(formatReportDate(null)).toBe('');
  });
});

describe('money in the venue currency', () => {
  it('formats as the web formatMoney and formatMoneyExact do', () => {
    expect(formatMoney(1250, 'GBP')).toBe('£12.50');
    expect(formatMoney(1200, 'GBP')).toBe('£12');
    expect(formatMoney(-340, 'GBP')).toBe('-£3.40');
    expect(formatMoney(123456700, 'EUR')).toBe('€1,234,567');
    expect(formatMoneyExact(1200, 'GBP')).toBe('£12.00');
    expect(formatMoneyExact(-5, 'eur')).toBe('-€0.05');
  });
});

describe('labels', () => {
  it('names methods, people, refunds and tips as the web does', () => {
    expect(takingsMethodLabel('external', 'Treatwell')).toBe('Treatwell');
    expect(takingsMethodLabel('external', null)).toBe('Other payment type');
    expect(takingsMethodLabel('card_online', null)).toBe('Card online (deposits, shop and pay links)');
    expect(takingsPersonLabel(null, null)).toBe('Online, no team member');
    expect(takingsPersonLabel(' ', 's1')).toBe('Team member');
    expect(refundReasonLabel('')).toBe('No reason recorded');
    expect(tipRecipientLabel('Sam', 'owner_share')).toBe("Owner's share");
    expect(tipRecipientLabel('Sam', 'card_charge_deduction')).toBe('Card charge deduction');
  });

  it('labels VAT rates', () => {
    expect(vatRateLabel('S', 2000)).toBe('20%');
    expect(vatRateLabel('R', 1350)).toBe('13.5%');
    expect(vatRateLabel('E', 0)).toBe('Exempt');
    expect(vatRateLabel('O', 0)).toBe('Outside the scope of VAT');
  });

  it('labels the product figures', () => {
    expect(marginPercentLabel(4340)).toBe('43.4%');
    expect(marginPercentLabel(null)).toBe('Not known');
    expect(stockRowName({ product_name: 'Bond oil', option_name: '100 ml' })).toBe('Bond oil, 100 ml');
    expect(sellThroughPercent(3, 8)).toBe(37.5);
    expect(sellThroughPercent(3, 0)).toBeNull();
    expect(hasProductSections(undefined)).toBe(false);
    expect(hasProductSections({ totals: { quantity: 0, refunds_pence: 0 }, stock: { tracked: 2 } })).toBe(true);
  });
});

describe('vouchers', () => {
  it('works out the tab period in the venue zone', () => {
    expect(voucherReportPeriod({ kind: 'this-month' }, '2026-10-09')).toEqual({ from: '2026-10-01', to: '2026-10-09' });
    expect(voucherReportPeriod({ kind: 'last-month' }, '2026-03-09')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(voucherReportPeriod({ kind: 'custom', from: '2026-01-01', to: '2026-01-31' }, '2026-10-09')).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });

  it('counts vouchers and reads the last good day', () => {
    expect(voucherCount(1)).toBe('1 voucher');
    expect(voucherCount(3)).toBe('3 vouchers');
    // Expiry at the start of the next London day (BST) is the 31st.
    expect(voucherLastDayYmd('2026-08-31T23:00:00Z', 'Europe/London')).toBe('2026-08-31');
    expect(voucherLastDayYmd(null, 'Europe/London')).toBeNull();
  });

  it("words each movement, the newest extension naming today's use-by date", () => {
    const m = (kind: string, over: Partial<VoucherMovement> = {}): VoucherMovement => ({
      id: kind,
      kind,
      delta_pence: 0,
      sale_id: null,
      sale_number: 12,
      staff_name: 'Sam',
      reason: 'Goodwill',
      business_date: '2026-10-01',
      created_at: '2026-10-01T10:00:00Z',
      ...over,
    });
    const ctx = { lastDay: '31 December 2026', newestExtendId: 'extend' };
    expect(movementWords(m('redeem'), ctx)).toBe('Used on Sale 12');
    expect(movementWords(m('extend'), ctx)).toBe('Extended to 31 December 2026');
    expect(movementWords(m('extend', { id: 'old' }), ctx)).toBe('Goodwill');
    expect(movementWords(m('extend'), { lastDay: null, newestExtendId: 'extend' })).toBe('No expiry date');
    expect(movementWords(m('adjust'), ctx)).toBe('Changed by Sam: Goodwill');
    expect(movementWords(m('cancel'), ctx)).toBe('Cancelled: Goodwill');
  });

  it('tells a dispute hold from a hold put on by hand', () => {
    expect(isDisputeHold('frozen', 'Payment disputed (du_123)')).toBe(true);
    expect(isDisputeHold('frozen', 'Lost voucher')).toBe(false);
    expect(isDisputeHold('active', 'Payment disputed (du_123)')).toBe(false);
  });
});

describe('voucher import', () => {
  it('reads the header row, quoted cells included', () => {
    expect(csvHeaderRow('﻿Code,Amount left,"Holder\'s name","A, B"\r\nX,1,Sam,y\r\n')).toEqual([
      'Code',
      'Amount left',
      "Holder's name",
      'A, B',
    ]);
    expect(csvHeaderRow('\n\n,,\nCode,Value\n')).toEqual(['Code', 'Value']);
    expect(csvHeaderRow('')).toEqual([]);
  });

  it('guesses each column once, email before name', () => {
    expect(guessColumns(['Code', 'Amount left', 'Use by', "Holder's name", "Holder's email", 'Note'])).toEqual({
      code: 'Code',
      balance: 'Amount left',
      expiry: 'Use by',
      holder_name: "Holder's name",
      holder_email: "Holder's email",
      note: 'Note',
    });
  });
});

describe('downloads', () => {
  it('keeps the server filename, and never a path', () => {
    expect(filenameFromDisposition('attachment; filename="takings-by-method-2026-10-01-2026-10-07.csv"', 'x.csv')).toBe(
      'takings-by-method-2026-10-01-2026-10-07.csv',
    );
    expect(filenameFromDisposition('attachment; filename="../evil.csv"', 'x.csv')).toBe('x.csv');
    expect(filenameFromDisposition(null, 'x.csv')).toBe('x.csv');
  });
});
