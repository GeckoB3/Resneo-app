/**
 * The comparison rules, mirroring the web's `src/lib/reports/report-comparison.test.ts` case for
 * case, so a change reads the same in the app as on the web (re-ported 2026-10-13, when "Previous
 * period" began lining up with weeks and months).
 */
import {
  COMPARISON_BASIS_LABELS,
  comparisonRange,
  describeChange,
  parseComparisonBasis,
} from '@/lib/reports/report-comparison';

describe('comparisonRange', () => {
  it('is the days just before, as many as the range has, for an ordinary range', () => {
    expect(comparisonRange('2026-10-08', '2026-10-08', 'previous')).toEqual({ from: '2026-10-07', to: '2026-10-07' });
    // 14 Sep 2026 is a Monday, but 30 days is not whole weeks.
    expect(comparisonRange('2026-09-14', '2026-10-13', 'previous')).toEqual({ from: '2026-08-15', to: '2026-09-13' });
    expect(comparisonRange('2026-03-03', '2026-03-09', 'previous')).toEqual({ from: '2026-02-24', to: '2026-03-02' });
  });

  it('lines a week up with the same days of the week before', () => {
    // Monday and Tuesday so far, against last Monday and Tuesday, not the weekend before.
    expect(comparisonRange('2026-10-12', '2026-10-13', 'previous')).toEqual({ from: '2026-10-05', to: '2026-10-06' });
    expect(comparisonRange('2026-10-05', '2026-10-11', 'previous')).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(comparisonRange('2026-09-28', '2026-10-11', 'previous')).toEqual({ from: '2026-09-14', to: '2026-09-27' });
  });

  it('lines a month up with the same days of the month before', () => {
    expect(comparisonRange('2026-10-01', '2026-10-13', 'previous')).toEqual({ from: '2026-09-01', to: '2026-09-13' });
    expect(comparisonRange('2026-10-01', '2026-10-31', 'previous')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(comparisonRange('2026-09-01', '2026-09-30', 'previous')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(comparisonRange('2026-03-01', '2026-03-31', 'previous')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(comparisonRange('2026-03-01', '2026-03-30', 'previous')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(comparisonRange('2026-01-01', '2026-03-31', 'previous')).toEqual({ from: '2025-10-01', to: '2025-12-31' });
  });

  it('is the same dates a year earlier, 29 February becoming the 28th', () => {
    expect(comparisonRange('2026-10-01', '2026-10-31', 'last_year')).toEqual({ from: '2025-10-01', to: '2025-10-31' });
    expect(comparisonRange('2028-02-29', '2028-03-01', 'last_year')).toEqual({ from: '2027-02-28', to: '2027-03-01' });
  });

  it('reads anything but last_year as the previous period', () => {
    expect(parseComparisonBasis('last_year')).toBe('last_year');
    expect(parseComparisonBasis(null)).toBe('previous');
    expect(parseComparisonBasis('nonsense')).toBe('previous');
  });

  it("names the two choices in the web's words", () => {
    expect(COMPARISON_BASIS_LABELS).toEqual({ previous: 'Previous period', last_year: 'Same dates last year' });
  });
});

describe('describeChange', () => {
  it('gives counts and money as a percentage, good when up', () => {
    expect(describeChange(112, 100, 'count')).toEqual({ label: '+12%', tone: 'good' });
    expect(describeChange(90, 100, 'money')).toEqual({ label: '-10%', tone: 'bad' });
    expect(describeChange(5, 0, 'count')).toEqual({ label: 'Up from 0', tone: 'good' });
    expect(describeChange(0, 0, 'count')).toEqual({ label: 'No change', tone: 'neutral' });
    expect(describeChange(1001, 1000, 'count')).toEqual({ label: 'Up under 1%', tone: 'good' });
    expect(describeChange(999, 1000, 'count')).toEqual({ label: 'Down under 1%', tone: 'bad' });
  });

  it('gives rates in points, and a rise is bad where lower is better', () => {
    expect(describeChange(12.5, 10, 'rate', false)).toEqual({ label: '+2.5 pts', tone: 'bad' });
    expect(describeChange(8, 10, 'rate', false)).toEqual({ label: '-2.0 pts', tone: 'good' });
    expect(describeChange(10, 10, 'rate')).toEqual({ label: 'No change', tone: 'neutral' });
    expect(describeChange(11.5, 10, 'rate')).toEqual({ label: '+1.5 pts', tone: 'good' });
  });

  it('says nothing without both figures', () => {
    expect(describeChange(5, null, 'count')).toBeNull();
    expect(describeChange(undefined, 5, 'count')).toBeNull();
    expect(describeChange(Number.NaN, 5, 'count')).toBeNull();
  });
});
