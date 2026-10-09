import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  FigureList,
  KpiTiles,
  PosRangeCard,
  PosReportCard,
  ReportLoadError,
  ReportTable,
  reportStyles,
  useReportDownload,
  useReportNotice,
  type Column,
} from '@/components/reports/pos/PosReportUi';
import { SalesProductCards } from '@/components/reports/pos/SalesProductCards';
import { SvgBarChart } from '@/components/reports/SvgBarChart';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { reportsCopy, type ReportsCopyId } from '@/lib/pos/reports-copy';
import { posReportPaths, useSalesRange } from '@/lib/queries/usePosReports';
import {
  discountReasonLabel,
  formatMoney,
  hasProductSections,
  LINE_TYPE_LABELS,
  periodLabel,
  rangeQuery,
  REPORTING_GROUP_LABELS,
  shortChartLabel,
} from '@/lib/reports/pos-report-format';
import { useTheme } from '@/theme/useTheme';
import type { SalesPersonRow } from '@/types/pos';
import type { PosRangeChoice, ReportGrain } from '@/types/pos-reports';

/**
 * The Sales tab (web `SalesSection.tsx`, UX spec §11.2): what was sold, on the day each sale was
 * paid, from completed sales. Totals with discounts, deposits applied and VAT, by period (chart and
 * table), services and products (and by kind of item), by service, by category, services and
 * products by team member, the product cards (margin, by product, brand, category, stock), and
 * discounts by reason and person. Each card's CSV comes from the server.
 */
export function SalesSection({ canExport, today }: { canExport: boolean; today: string }) {
  const { colors } = useTheme();
  const [choice, setChoice] = useState<PosRangeChoice>({ kind: 'preset', preset: 'this-week' });
  const [grain, setGrain] = useState<ReportGrain>('day');
  const q = useSalesRange(choice, grain);
  const data = q.data;
  const money = (pence: number) => formatMoney(pence, data?.currency);
  const notice = useReportNotice();
  const download = useReportDownload();
  const exportable = canExport && (data?.can_export ?? true);
  const query = rangeQuery(choice, grain);
  const csv = (card: string, label: ReportsCopyId) =>
    exportable ? () => void download(`${posReportPaths.sales(query)}&format=csv&card=${card}`, reportsCopy(label)) : undefined;

  const chart = useMemo(
    () =>
      (data?.by_period ?? []).map((p) => ({
        key: p.period_start,
        label: shortChartLabel(p.period_start, data!.grain),
        value: p.sales_pence,
        subValue: periodLabel(p.period_start, p.period_end, data!.grain),
      })),
    [data],
  );

  const personColumns: Column<SalesPersonRow>[] = [
    { label: reportsCopy('rep.teamMember'), value: (r) => r.name, width: 170 },
    { label: reportsCopy('sl.services'), value: (r) => money(r.services_pence), numeric: true },
    { label: reportsCopy('sl.products'), value: (r) => money(r.retail_pence), numeric: true },
    { label: reportsCopy('sl.other'), value: (r) => money(r.other_pence), numeric: true },
    { label: reportsCopy('rep.total'), value: (r) => money(r.total_pence), numeric: true },
    { label: reportsCopy('rep.refunds'), value: (r) => money(r.refunds_pence), numeric: true },
  ];
  const personKey = (r: SalesPersonRow, i: number) => `${r.calendar_id ?? ''}:${r.staff_id ?? ''}:${i}`;
  const shareNote = (
    <Text variant="bodySmall" tone="secondary">
      {reportsCopy('sl.shareNote')}
    </Text>
  );

  return (
    <View style={reportStyles.stack}>
      <PosRangeCard
        title={reportsCopy('tab.sales')}
        help={reportsCopy('sl.help')}
        choice={choice}
        onChoice={setChoice}
        grain={grain}
        onGrain={setGrain}
        loading={q.isFetching}
        currentRange={data ? { from: data.from, to: data.to } : null}
        today={today}
        onNotice={notice}
      />

      {q.isError ? <ReportLoadError message={posErrorMessage(q.error, reportsCopy('rep.error'))} onRetry={() => void q.refetch()} /> : null}
      {!data && q.isLoading ? <DetailSkeleton /> : null}

      {data ? (
        <View style={[reportStyles.stack, q.isFetching ? styles.busy : null]} accessibilityState={{ busy: q.isFetching }}>
          <PosReportCard title={reportsCopy('sl.title', { range: periodLabel(data.from, data.to, 'week') })} onExport={csv('totals', 'csv.sales')}>
            <KpiTiles
              items={[
                {
                  label: reportsCopy('rep.sales'),
                  value: money(data.totals.sales_pence),
                  caption: data.totals.refunds_pence > 0 ? reportsCopy('sl.refundsSub', { amount: money(-data.totals.refunds_pence) }) : undefined,
                },
                { label: reportsCopy('sl.count'), value: String(data.totals.sales_count) },
                { label: reportsCopy('sl.average'), value: money(data.totals.average_sale_pence) },
                {
                  label: reportsCopy('sl.retailPerVisit'),
                  value: money(data.totals.retail_per_visit_pence),
                  caption: data.totals.visit_count === 1 ? reportsCopy('sl.visit') : reportsCopy('sl.visits', { count: data.totals.visit_count }),
                },
              ]}
            />
            <FigureList
              items={[
                [reportsCopy('sl.discountsGiven'), money(data.totals.discount_pence)],
                [reportsCopy('sl.applied'), money(data.totals.applied_pence)],
                [reportsCopy('sl.vatIncluded'), money(data.totals.tax_pence)],
              ]}
            />
          </PosReportCard>

          <PosReportCard title={reportsCopy(`grain.title.${grain}` as ReportsCopyId)} onExport={csv('by_period', 'csv.sales.byPeriod')}>
            {data.totals.sales_count === 0 && data.totals.refund_count === 0 ? (
              <Text variant="bodySmall" tone="muted">
                {reportsCopy('rep.empty')}
              </Text>
            ) : (
              <>
                <SvgBarChart data={chart} color={colors.brand} formatValue={money} labelWidth={72} />
                <ReportTable
                  caption={reportsCopy('csv.sales.byPeriod')}
                  rows={data.by_period}
                  rowKey={(r) => r.period_start}
                  columns={[
                    { label: reportsCopy('rep.period'), value: (r) => periodLabel(r.period_start, r.period_end, data.grain) },
                    { label: reportsCopy('rep.sales'), value: (r) => r.sales_count, numeric: true, width: 80 },
                    { label: reportsCopy('sl.value'), value: (r) => money(r.sales_pence), numeric: true },
                    { label: reportsCopy('rep.discounts'), value: (r) => money(r.discount_pence), numeric: true },
                    { label: reportsCopy('rep.refunds'), value: (r) => money(r.refunds_pence), numeric: true },
                  ]}
                />
              </>
            )}
          </PosReportCard>

          <PosReportCard title={reportsCopy('sl.servicesAndProducts')} onExport={csv('by_type', 'csv.sales.byType')}>
            <ReportTable
              caption={reportsCopy('sl.servicesAndProducts')}
              rows={data.by_reporting_group}
              rowKey={(r) => r.key}
              columns={[
                { label: reportsCopy('sl.type'), value: (r) => REPORTING_GROUP_LABELS[r.key] ?? r.key, width: 130 },
                { label: reportsCopy('rep.quantity'), value: (r) => r.quantity, numeric: true, width: 84 },
                { label: reportsCopy('rep.discounts'), value: (r) => money(r.discount_pence), numeric: true },
                { label: reportsCopy('rep.sales'), value: (r) => money(r.sales_pence), numeric: true },
                { label: reportsCopy('rep.refunds'), value: (r) => money(r.refunds_pence), numeric: true },
              ]}
            />
            {data.by_line_type.length > 1 ? (
              <ReportTable
                caption={reportsCopy('sl.kind')}
                rows={data.by_line_type}
                rowKey={(r) => r.key}
                columns={[
                  { label: reportsCopy('sl.kind'), value: (r) => LINE_TYPE_LABELS[r.key] ?? r.key, width: 130 },
                  { label: reportsCopy('rep.quantity'), value: (r) => r.quantity, numeric: true, width: 84 },
                  { label: reportsCopy('rep.sales'), value: (r) => money(r.sales_pence), numeric: true },
                  { label: reportsCopy('rep.refunds'), value: (r) => money(r.refunds_pence), numeric: true },
                ]}
              />
            ) : null}
          </PosReportCard>

          <PosReportCard title={reportsCopy('sl.byService')} onExport={csv('by_service', 'csv.sales.byService')}>
            <ReportTable
              caption={reportsCopy('csv.sales.byService')}
              rows={data.by_service}
              rowKey={(r) => r.key}
              columns={[
                { label: reportsCopy('sl.service'), value: (r) => r.name, width: 180 },
                { label: reportsCopy('rep.quantity'), value: (r) => r.quantity, numeric: true, width: 84 },
                { label: reportsCopy('rep.discounts'), value: (r) => money(r.discount_pence), numeric: true },
                { label: reportsCopy('rep.sales'), value: (r) => money(r.sales_pence), numeric: true },
                { label: reportsCopy('rep.refunds'), value: (r) => money(r.refunds_pence), numeric: true },
              ]}
            />
          </PosReportCard>

          <PosReportCard title={reportsCopy('sl.byCategory')} onExport={csv('by_category', 'csv.sales.byCategory')}>
            <ReportTable
              caption={reportsCopy('csv.sales.byCategory')}
              rows={data.by_category}
              rowKey={(r) => r.category_id ?? 'none'}
              columns={[
                { label: reportsCopy('rep.category'), value: (r) => r.name ?? reportsCopy('rep.noCategory'), width: 170 },
                { label: reportsCopy('rep.quantity'), value: (r) => r.quantity, numeric: true, width: 84 },
                { label: reportsCopy('rep.sales'), value: (r) => money(r.sales_pence), numeric: true },
                { label: reportsCopy('rep.refunds'), value: (r) => money(r.refunds_pence), numeric: true },
              ]}
            />
          </PosReportCard>

          <PosReportCard title={reportsCopy('sl.byPerformer')} onExport={csv('by_performer', 'csv.sales.byPerformer')}>
            {shareNote}
            <ReportTable caption={reportsCopy('sl.byPerformer')} rows={data.by_performer} rowKey={personKey} columns={personColumns} />
          </PosReportCard>

          <PosReportCard title={reportsCopy('sl.bySeller')} onExport={csv('by_seller', 'csv.sales.bySeller')}>
            {shareNote}
            <ReportTable caption={reportsCopy('sl.bySeller')} rows={data.by_seller} rowKey={personKey} columns={personColumns} />
          </PosReportCard>

          {data.products && hasProductSections(data.products) ? <SalesProductCards products={data.products} money={money} csv={csv} /> : null}

          <PosReportCard title={reportsCopy('sl.discountsTitle')} onExport={csv('discounts', 'csv.sales.discounts')}>
            <ReportTable
              caption={reportsCopy('sl.discountsByReason')}
              rows={data.discounts_by_reason}
              rowKey={(r) => r.reason}
              columns={[
                { label: reportsCopy('rep.reason'), value: (r) => discountReasonLabel(r.reason), width: 180 },
                { label: reportsCopy('rep.discounts'), value: (r) => r.discount_count, numeric: true, width: 90 },
                { label: reportsCopy('rep.amount'), value: (r) => money(r.amount_pence), numeric: true },
              ]}
            />
            <ReportTable
              caption={reportsCopy('sl.discountsByPerson')}
              rows={data.discounts_by_person ?? []}
              rowKey={(r, i) => r.staff_id ?? `none-${i}`}
              columns={[
                { label: reportsCopy('rep.teamMember'), value: (r) => r.name?.trim() || reportsCopy('rep.teamMember'), width: 180 },
                { label: reportsCopy('rep.discounts'), value: (r) => r.discount_count, numeric: true, width: 90 },
                { label: reportsCopy('rep.amount'), value: (r) => money(r.amount_pence), numeric: true },
              ]}
            />
          </PosReportCard>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  busy: { opacity: 0.7 },
});
