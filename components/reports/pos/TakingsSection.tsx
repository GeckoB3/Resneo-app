import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CashUpsCard } from '@/components/reports/pos/CashUpsCard';
import { PayoutsCard } from '@/components/reports/pos/PayoutsCard';
import { WholeVenueNote } from '@/components/reports/ReportCalendarFilter';
import {
  FigureList,
  KpiTiles,
  MoneyTable,
  PosRangeLine,
  PosReportCard,
  ReportInfoLine,
  ReportLoadError,
  ReportTable,
  reportStyles,
  useReportDownload,
} from '@/components/reports/pos/PosReportUi';
import { SvgBarChart } from '@/components/reports/SvgBarChart';
import { Button } from '@/components/ui/Button';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { reportsCopy, type ReportsCopyId } from '@/lib/pos/reports-copy';
import { useTakingsRange, posReportPaths } from '@/lib/queries/usePosReports';
import {
  disputeStatusLabel,
  formatMoneyExact,
  formatReportDate,
  periodLabel,
  periodsSoFar,
  rangeQuery,
  refundReasonLabel,
  refundSourceLabel,
  shortChartLabel,
  takingsMethodLabel,
  takingsPersonLabel,
  takingsSourceLabel,
  tipRecipientLabel,
  vatRateLabel,
} from '@/lib/reports/pos-report-format';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { TakingsAmounts } from '@/types/pos';
import type { PosRangeChoice, ReportGrain } from '@/types/pos-reports';

/** A takings row's money as a table row's (`MoneyTable`). */
function moneyOf(r: Pick<TakingsAmounts, 'payments_pence' | 'refunds_pence' | 'net_pence' | 'tips_pence'>) {
  return { inPence: r.payments_pence, outPence: r.refunds_pence, netPence: r.net_pence, tipsPence: r.tips_pence };
}

/**
 * The Takings tab (web `TakingsSection.tsx`, UX spec §11.1): money in and out on the day it moved,
 * from the money journal. Totals, by method, by source, by period (chart and table), by who took
 * it, refunds and reasons, disputes, tips by person with the monthly tip records, VAT by rate with
 * deposits and fees listed apart, cash-ups and (admins) payouts and fees. Each card's CSV comes
 * from the server and opens the share sheet; the buttons show only to people who may export.
 *
 * It leads with the numbers (Part 2 mock-up 3): the range on one line, the four figures, what the
 * report counts, then the tables, with In, Out and Net in columns and each row's tips under it.
 *
 * Shown only where Reports has the server's word that the venue has Takings (pos-access `visible`),
 * which with Checkout off is a venue with past sales, so its reads run then too (`reportsVisible`).
 *
 * Always the whole venue (web 90ff4d17): the money journal is never split by calendar, one payment
 * often covering several people's work, so the Reports calendar filter is never sent here, nor to
 * the tip records, cash-ups or payouts. With a calendar chosen the tab says so, and the picker is
 * greyed out, as on the web.
 */
export function TakingsSection({ canExport, isAdmin, today }: { canExport: boolean; isAdmin: boolean; today: string }) {
  const { colors } = useTheme();
  const [choice, setChoice] = useState<PosRangeChoice>({ kind: 'preset', preset: 'this-week' });
  const [grain, setGrain] = useState<ReportGrain>('day');
  const q = useTakingsRange(choice, grain, { reportsVisible: true });
  const data = q.data;
  const money = (pence: number) => formatMoneyExact(pence, data?.currency);
  const download = useReportDownload();
  const exportable = canExport && (data?.can_export ?? true);
  const query = rangeQuery(choice, grain);
  const csv = (card: string, label: ReportsCopyId) =>
    exportable ? () => void download(`${posReportPaths.takings(query)}&format=csv&card=${card}`, reportsCopy(label)) : undefined;

  const periods = useMemo(() => periodsSoFar(data?.by_period ?? [], today), [data, today]);
  const chart = useMemo(
    () =>
      periods.map((p) => ({
        key: p.period_start,
        label: shortChartLabel(p.period_start, data!.grain),
        value: p.payments_pence,
        subValue: `${periodLabel(p.period_start, p.period_end, data!.grain)}. ${reportsCopy('tk.refundsOut')} ${formatMoneyExact(Math.abs(p.refunds_pence), data!.currency)}`,
      })),
    [data, periods],
  );

  return (
    <View style={reportStyles.stack}>
      <PosRangeLine
        report={reportsCopy('tab.takings')}
        choice={choice}
        onChoice={setChoice}
        grain={grain}
        onGrain={setGrain}
        today={today}
        loading={q.isFetching}
        currentRange={data ? { from: data.from, to: data.to } : null}
      />

      {/* The whole venue's, whichever calendar is chosen for the other tabs. */}
      <WholeVenueNote variant="tab" />

      {q.isError ? <ReportLoadError message={posErrorMessage(q.error, reportsCopy('rep.error'))} onRetry={() => void q.refetch()} /> : null}
      {!data && q.isLoading ? <DetailSkeleton /> : null}

      {data ? (
        <View style={[reportStyles.stack, q.isFetching ? styles.busy : null]} accessibilityState={{ busy: q.isFetching }}>
          {data.estimated?.note ? (
            <View style={[styles.estimated, { borderColor: colors.warning, backgroundColor: colors.warningSurface }]}>
              <Text variant="bodySmall">{data.estimated.note}</Text>
            </View>
          ) : null}

          {/* The four figures first, in the web's colours (mock-up 3, note 2). */}
          <KpiTiles
            items={[
              { label: reportsCopy('tk.paymentsIn'), value: money(data.totals.payments_pence), tone: 'emerald' },
              { label: reportsCopy('tk.refundsOut'), value: money(data.totals.refunds_pence), tone: 'amber' },
              {
                label: reportsCopy('tk.net'),
                value: money(data.totals.net_pence),
                tone: 'brand',
                caption: data.totals.disputes_pence !== 0 ? reportsCopy('tk.disputesSub', { amount: money(data.totals.disputes_pence) }) : undefined,
                // Net takings leave tips out, where End of day counts them in (web QA W1-10).
                caption2: data.totals.tips_pence !== 0 ? reportsCopy('tk.withTips', { amount: money(data.totals.net_with_tips_pence) }) : undefined,
              },
              { label: reportsCopy('tk.tips'), value: money(data.totals.tips_pence), tone: 'slate' },
            ]}
          />
          <ReportInfoLine text={reportsCopy('tk.help')} exportTitle={reportsCopy('csv.takings')} onExport={csv('totals', 'csv.takings')} />

          <PosReportCard title={reportsCopy('tk.byMethod')} onExport={csv('by_method', 'csv.takings.byMethod')}>
            <MoneyTable
              caption={reportsCopy('csv.takings.byMethod')}
              nameHeader={reportsCopy('tk.method')}
              money={money}
              rows={data.by_method.map((r) => ({
                key: `${r.method}:${r.external_type_name ?? ''}`,
                name: takingsMethodLabel(r.method, r.external_type_name),
                ...moneyOf(r),
              }))}
              total={{ key: '__total', name: reportsCopy('rep.total'), ...moneyOf(data.totals) }}
            />
          </PosReportCard>

          <PosReportCard title={reportsCopy('tk.bySource')} onExport={csv('by_source', 'csv.takings.bySource')}>
            <MoneyTable
              caption={reportsCopy('tk.bySource')}
              nameHeader={reportsCopy('tk.source')}
              money={money}
              rows={data.by_source.map((r) => ({ key: r.source, name: takingsSourceLabel(r.source), ...moneyOf(r) }))}
            />
          </PosReportCard>

          <PosReportCard title={reportsCopy(`grain.title.${grain}` as ReportsCopyId)} onExport={csv('by_period', 'csv.takings.byPeriod')}>
            {data.totals.row_count === 0 ? (
              <Text variant="bodySmall" tone="muted">
                {reportsCopy('rep.empty')}
              </Text>
            ) : (
              <>
                <SvgBarChart data={chart} color={colors.brand} formatValue={money} labelWidth={72} />
                <MoneyTable
                  caption={reportsCopy('csv.takings.byPeriod')}
                  nameHeader={reportsCopy('rep.period')}
                  money={money}
                  rows={periods.map((r) => ({
                    key: r.period_start,
                    name: periodLabel(r.period_start, r.period_end, data.grain),
                    ...moneyOf(r),
                  }))}
                />
              </>
            )}
          </PosReportCard>

          <PosReportCard title={reportsCopy('tk.byPerson')} onExport={csv('by_person', 'csv.takings.byPerson')}>
            <MoneyTable
              caption={reportsCopy('tk.byPerson')}
              nameHeader={reportsCopy('rep.teamMember')}
              money={money}
              rows={data.by_person.map((r, i) => ({ key: r.staff_id ?? `none-${i}`, name: takingsPersonLabel(r.name, r.staff_id), ...moneyOf(r) }))}
            />
          </PosReportCard>

          <PosReportCard title={reportsCopy('tk.refundsTitle')} onExport={csv('refunds', 'csv.refunds')}>
            <ReportTable
              caption={reportsCopy('tk.refundsTitle')}
              rows={data.refunds}
              rowKey={(r, i) => `${r.source_type}:${r.reason}:${i}`}
              columns={[
                { label: reportsCopy('tk.refund'), value: (r) => refundSourceLabel(r.source_type) },
                { label: reportsCopy('rep.reason'), value: (r) => refundReasonLabel(r.reason), width: 180 },
                { label: reportsCopy('rep.refunds'), value: (r) => r.refund_count, numeric: true, width: 80 },
                { label: reportsCopy('rep.amount'), value: (r) => money(r.amount_pence), numeric: true },
                { label: reportsCopy('tk.tipsRefunded'), value: (r) => money(r.tip_pence), numeric: true },
              ]}
            />
          </PosReportCard>

          <PosReportCard title={reportsCopy('tk.disputes')} onExport={csv('disputes', 'csv.disputes')}>
            <ReportTable
              caption={reportsCopy('tk.disputes')}
              rows={data.disputes ?? []}
              rowKey={(r) => r.id}
              columns={[
                { label: reportsCopy('tk.opened'), value: (r) => formatReportDate(r.opened_at), width: 120 },
                { label: reportsCopy('tk.status'), value: (r) => disputeStatusLabel(r.status) },
                { label: reportsCopy('tk.disputed'), value: (r) => money(r.amount_pence), numeric: true },
                { label: reportsCopy('tk.moved'), value: (r) => money(r.movement_pence), numeric: true, width: 150 },
                { label: reportsCopy('tk.evidenceDue'), value: (r) => (r.evidence_due_by ? formatReportDate(r.evidence_due_by) : ''), width: 130 },
              ]}
            />
          </PosReportCard>

          <PosReportCard title={reportsCopy('tk.tipsByPerson')} onExport={csv('tips', 'csv.tips')}>
            <ReportTable
              caption={reportsCopy('tk.tipsByPerson')}
              rows={data.tips?.by_recipient ?? []}
              rowKey={(r, i) => `${r.calendar_id ?? ''}:${r.staff_id ?? ''}:${r.allocation_kind}:${i}`}
              columns={[
                { label: reportsCopy('rep.teamMember'), value: (r) => tipRecipientLabel(r.name, r.allocation_kind), width: 180 },
                { label: reportsCopy('tk.tipsReceived'), value: (r) => money(r.net_pence), numeric: true },
                { label: reportsCopy('tk.paidOut'), value: (r) => money(r.paid_pence), numeric: true },
                { label: reportsCopy('tk.stillToPay'), value: (r) => money(r.due_pence), numeric: true },
              ]}
              footer={
                data.tips
                  ? [reportsCopy('rep.total'), money(data.tips.totals.net_pence), money(data.tips.totals.paid_pence), money(data.tips.totals.due_pence)]
                  : undefined
              }
            />
            {exportable ? (
              <View style={[styles.tipRecords, { borderTopColor: colors.border }]}>
                <Text variant="caption" tone="muted">
                  {reportsCopy('tk.tipRecords.help')}
                </Text>
                <Button
                  label={reportsCopy('tk.tipRecords.button')}
                  variant="secondary"
                  size="sm"
                  onPress={() => void download(`${posReportPaths.tips(query)}&format=csv&kind=monthly`, reportsCopy('csv.tipRecords'))}
                />
              </View>
            ) : null}
          </PosReportCard>

          {data.vat ? (
            <PosReportCard title={reportsCopy('tk.vat')} onExport={csv('vat', 'csv.vat')}>
              <Text variant="bodySmall" tone="secondary">
                {reportsCopy('tk.vat.help')}
              </Text>
              <ReportTable
                caption={reportsCopy('tk.vat')}
                rows={data.vat.by_rate}
                rowKey={(r) => `${r.tax_code}:${r.tax_rate_bps}`}
                columns={[
                  { label: reportsCopy('tk.vat.rate'), value: (r) => vatRateLabel(r.tax_code, r.tax_rate_bps), width: 150 },
                  { label: reportsCopy('rep.sales'), value: (r) => money(r.sales_pence), numeric: true },
                  { label: reportsCopy('tk.vat.salesVat'), value: (r) => money(r.sales_vat_pence), numeric: true },
                  { label: reportsCopy('rep.refunds'), value: (r) => money(-r.refunds_pence), numeric: true },
                  { label: reportsCopy('tk.vat.refundsVat'), value: (r) => money(-r.refunds_vat_pence), numeric: true, width: 120 },
                  { label: reportsCopy('tk.vat.net'), value: (r) => money(r.net_vat_pence), numeric: true },
                ]}
                footer={[
                  reportsCopy('rep.total'),
                  money(data.vat.totals.sales_pence),
                  money(data.vat.totals.sales_vat_pence),
                  money(-data.vat.totals.refunds_pence),
                  money(-data.vat.totals.refunds_vat_pence),
                  money(data.vat.totals.net_vat_pence),
                ]}
              />
              <FigureList
                items={[
                  [reportsCopy('tk.vat.depositsTaken'), money(data.vat.deposits_and_fees.deposits_taken_pence)],
                  [reportsCopy('tk.vat.depositsRefunded'), money(data.vat.deposits_and_fees.deposits_refunded_pence)],
                  [reportsCopy('tk.vat.depositsKept'), money(data.vat.deposits_and_fees.deposits_kept_on_cancellation_pence)],
                  [reportsCopy('tk.vat.feesCharged'), money(data.vat.deposits_and_fees.fees_charged_pence)],
                  [reportsCopy('tk.vat.feesRefunded'), money(data.vat.deposits_and_fees.fees_refunded_pence)],
                ]}
              />
            </PosReportCard>
          ) : null}

          <CashUpsCard choice={choice} grain={grain} canExport={exportable} />

          {isAdmin ? <PayoutsCard choice={choice} grain={grain} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  busy: { opacity: 0.7 },
  estimated: { borderWidth: 1, borderRadius: 12, padding: spacing.md },
  tipRecords: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm, gap: spacing.sm },
});
