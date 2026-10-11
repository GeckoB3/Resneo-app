import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { KpiTiles, PosRangeLine, PosReportCard, ReportInfoLine, ReportLoadError, reportStyles, useReportDownload } from '@/components/reports/pos/PosReportUi';
import { AddExistingVoucherSheet } from '@/components/reports/vouchers/AddExistingVoucherSheet';
import { AllVouchersCard } from '@/components/reports/vouchers/AllVouchersCard';
import { VoucherImportSheet } from '@/components/reports/vouchers/VoucherImportSheet';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { reportsCopy } from '@/lib/pos/reports-copy';
import { formatDay, todayInZone } from '@/lib/pos/voucher-math';
import { posReportPaths, useVoucherReport } from '@/lib/queries/usePosReports';
import { formatMoney, num, voucherCount, voucherReportPeriod, type VoucherRange } from '@/lib/reports/pos-report-format';
import { spacing } from '@/theme/index';
import type { PosReportPreset } from '@/types/pos';
import type { PosRangeChoice } from '@/types/pos-reports';

/** This tab's periods: this month (to today) and last month, as the web's Vouchers tab. */
const VOUCHER_PRESETS: PosReportPreset[] = ['this-month', 'last-month'];

function voucherPreset(preset: PosReportPreset): 'this-month' | 'last-month' {
  return preset === 'last-month' ? 'last-month' : 'this-month';
}

/**
 * The Vouchers tab (web `VouchersSection.tsx`, UX spec §20.11; admins while gift vouchers are on):
 * what was sold, used, expired and refunded in a period of its own (this month, last month or
 * chosen dates), what is still to be spent on any date (the venue's liability, "as at"), vouchers
 * added from before ResNeo, account credit beside them, and every voucher in a searchable list.
 * Totals are summed in SQL (`report_vouchers`); the CSV comes from the server, last four characters
 * only. Adding an existing voucher and importing a file start here, as on the web.
 *
 * It leads with the numbers (Part 2 mock-up 3): the range on one line, the five figures, the
 * "still to be spent" date, what the report counts, then the cards, with adding and importing last.
 */
export function VouchersSection({ canExport, timeZone, currency }: { canExport: boolean; timeZone: string; currency: string }) {
  const today = todayInZone(timeZone);
  const [range, setRange] = useState<VoucherRange>({ kind: 'this-month' });
  const [asAt, setAsAt] = useState('');
  const [sheet, setSheet] = useState<'add' | 'import' | null>(null);
  const period = useMemo(() => voucherReportPeriod(range, today), [range, today]);
  const asAtDay = asAt || period.to;
  const q = useVoucherReport(period, asAtDay);
  const download = useReportDownload();
  const data = q.data;
  const cur = data?.currency ?? currency;
  const money = (pence: number) => formatMoney(pence, cur);
  const v = data?.report.vouchers ?? {};
  const c = data?.report.credit ?? {};
  const exportQuery = new URLSearchParams({ from: period.from, to: period.to, as_at: asAtDay }).toString();

  const choice: PosRangeChoice =
    range.kind === 'custom' ? { kind: 'custom', from: range.from, to: range.to } : { kind: 'preset', preset: range.kind };
  const exportVouchers = canExport
    ? () =>
        void download(`${posReportPaths.voucherReport(exportQuery)}&format=csv`, reportsCopy('rep.v.list'), {
          fallbackFilename: `gift-vouchers-${asAtDay}.csv`,
        })
    : undefined;

  return (
    <View style={reportStyles.stack}>
      {/* The range on one line, as the other POS tabs (Part 2 mock-up 3): this tab's own periods. */}
      <PosRangeLine
        report={reportsCopy('tab.vouchers')}
        choice={choice}
        onChoice={(next) =>
          setRange(next.kind === 'custom' ? { kind: 'custom', from: next.from, to: next.to } : { kind: voucherPreset(next.preset) })
        }
        presets={VOUCHER_PRESETS}
        rangeFor={(preset) => voucherReportPeriod({ kind: voucherPreset(preset) }, today)}
        rangeProblem={(from, to) => (to < from ? reportsCopy('rng.endBeforeStart') : null)}
        today={today}
        loading={q.isFetching}
        currentRange={period}
      />

      {q.isError ? <ReportLoadError message={posErrorMessage(q.error, reportsCopy('rep.error'))} onRetry={() => void q.refetch()} /> : null}
      {!data && q.isLoading ? <DetailSkeleton /> : null}

      {data ? (
        <View style={[reportStyles.stack, q.isFetching ? styles.busy : null]} accessibilityState={{ busy: q.isFetching }}>
          <KpiTiles
            items={[
              { label: reportsCopy('rep.v.sold'), value: money(num(v.sold_pence)), caption: voucherCount(num(v.sold_count)), tone: 'emerald' },
              { label: reportsCopy('rep.v.redeemed'), value: money(num(v.redeemed_pence) - num(v.reversed_pence)), tone: 'brand' },
              { label: reportsCopy('rep.v.expired'), value: money(num(v.expired_pence)), caption: reportsCopy('rep.v.expired.help'), tone: 'amber' },
              { label: reportsCopy('rep.v.refunded'), value: money(num(v.refunded_pence)), tone: 'slate' },
              {
                label: reportsCopy('rep.v.outstanding'),
                value: money(num(v.outstanding_as_at_pence)),
                caption: reportsCopy('rep.v.asAt', { date: formatDay(data.report.as_at, timeZone) }),
                tone: 'brand',
              },
            ]}
          />
          <View style={styles.field}>
            <Text variant="caption" tone="muted">
              {reportsCopy('rep.v.outstanding')}
            </Text>
            <DatePickerField value={asAtDay} onChange={setAsAt} accessibilityLabel={reportsCopy('rep.v.outstanding')} />
          </View>
          <ReportInfoLine text={reportsCopy('rep.v.help')} exportTitle={reportsCopy('tab.vouchers')} onExport={exportVouchers} />

          <PosReportCard title={reportsCopy('rep.v.existing')}>
            {num(v.existing_count) === 0 ? (
              <Text variant="bodySmall" tone="muted">
                {reportsCopy('rep.empty')}
              </Text>
            ) : (
              <Text variant="bodySmall">
                <Text variant="heading">{money(num(v.existing_pence))}</Text>
                {`  (${voucherCount(num(v.existing_count))})`}
              </Text>
            )}
          </PosReportCard>

          <PosReportCard title={reportsCopy('rep.v.credit')}>
            <KpiTiles
              items={[
                { label: reportsCopy('rep.v.given'), value: money(num(c.refunded_in_pence) + num(c.added_pence)), tone: 'emerald' },
                { label: reportsCopy('rep.v.redeemed'), value: money(num(c.used_pence) - num(c.reversed_pence)), tone: 'brand' },
                {
                  label: reportsCopy('rep.v.outstanding'),
                  value: money(num(c.outstanding_as_at_pence)),
                  caption: reportsCopy('rep.v.asAt', { date: formatDay(data.report.as_at, timeZone) }),
                  tone: 'slate',
                },
              ]}
            />
          </PosReportCard>

          <AllVouchersCard asAt={data.report.as_at} timeZone={timeZone} currency={cur} money={money} />
        </View>
      ) : null}

      {/* Bringing in vouchers sold before ResNeo, after the figures. */}
      <View style={styles.chips}>
        <Button label={reportsCopy('vadd.open')} variant="secondary" size="sm" onPress={() => setSheet('add')} />
        <Button label={reportsCopy('vimp.open')} variant="secondary" size="sm" onPress={() => setSheet('import')} />
      </View>

      {sheet === 'add' ? (
        <AddExistingVoucherSheet
          visible
          timeZone={timeZone}
          currency={cur}
          onClose={() => {
            setSheet(null);
            void q.refetch();
          }}
        />
      ) : null}
      {sheet === 'import' ? <VoucherImportSheet visible currency={cur} onClose={() => setSheet(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  field: { gap: spacing.xs },
  busy: { opacity: 0.7 },
});
