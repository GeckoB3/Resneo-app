import { StyleSheet, View } from 'react-native';

import { PosReportCard, ReportLoadError, ReportTable, useReportDownload, type Column } from '@/components/reports/pos/PosReportUi';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { reportsCopy } from '@/lib/pos/reports-copy';
import { posReportPaths, useCashUps } from '@/lib/queries/usePosReports';
import { formatMoney, formatReportDate, rangeQuery } from '@/lib/reports/pos-report-format';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CashUpRow, PosRangeChoice, ReportGrain } from '@/types/pos-reports';

/**
 * Cash-up history on the Takings tab (web `CashUpsSection.tsx`, UX spec §11.1 `rep.t.cashups`,
 * `rep.t.cashOutside`): each till closed in the range with its count, difference and reason, and
 * the cash older app builds took while no till session was open. Shows only once the venue has
 * closed a till or has such cash. The expected figure appears only for people with
 * `see_expected_cash`, which the server decides.
 */
export function CashUpsCard({ choice, grain, canExport }: { choice: PosRangeChoice; grain: ReportGrain; canExport: boolean }) {
  const { colors } = useTheme();
  const q = useCashUps(choice, grain);
  const download = useReportDownload();
  const data = q.data;
  const money = (pence: number) => formatMoney(pence, data?.currency);
  const sessions = Array.isArray(data?.sessions) ? data!.sessions : [];
  const outside = data?.outside && Array.isArray(data.outside.rows) ? data.outside : { total_pence: 0, count: 0, rows: [] };
  if (data && sessions.length === 0 && outside.count === 0) return null;

  const columns: Column<CashUpRow>[] = [
    { label: reportsCopy('rep.day'), value: (r) => formatReportDate(r.business_date), width: 120 },
    { label: reportsCopy('cu.till'), value: (r) => r.till_name, width: 120 },
    { label: reportsCopy('cu.closedBy'), value: (r) => r.closed_by_name ?? '', width: 130 },
    ...(data?.can_see_expected ? [{ label: reportsCopy('cu.expected'), value: (r: CashUpRow) => money(r.expected_cash_pence ?? 0), numeric: true }] : []),
    { label: reportsCopy('cu.counted'), value: (r) => money(r.counted_cash_pence), numeric: true },
    { label: reportsCopy('cu.difference'), value: (r) => money(r.variance_pence), numeric: true },
    { label: reportsCopy('rep.reason'), value: (r) => r.variance_reason ?? '', width: 180 },
  ];

  return (
    <PosReportCard
      title={reportsCopy('cu.title')}
      onExport={
        canExport ? () => void download(`${posReportPaths.cashUps(rangeQuery(choice, grain))}&format=csv`, reportsCopy('csv.cashUps')) : undefined
      }>
      {q.isError ? (
        <ReportLoadError message={posErrorMessage(q.error, reportsCopy('rep.error'))} onRetry={() => void q.refetch()} />
      ) : q.isLoading || !data ? (
        <DetailSkeleton />
      ) : (
        <>
          <ReportTable caption={reportsCopy('cu.title')} rows={sessions} rowKey={(r) => r.id} columns={columns} />
          {sessions.length > 0 && data.totals ? (
            <Text variant="bodySmall" tone="secondary">
              {reportsCopy('cu.totals', {
                over: money(data.totals.over_pence),
                short: money(Math.abs(data.totals.short_pence)),
                net: money(data.totals.variance_pence),
              })}
            </Text>
          ) : null}
          {outside.count > 0 ? (
            <View style={[styles.outside, { borderTopColor: colors.border }]}>
              <Text variant="label">{reportsCopy('cu.outside.title', { amount: money(outside.total_pence) })}</Text>
              <Text variant="caption" tone="muted">
                {reportsCopy('cu.outside.help')}
              </Text>
              <ReportTable
                caption={reportsCopy('cu.outside.title', { amount: money(outside.total_pence) })}
                rows={outside.rows}
                rowKey={(r) => r.id}
                columns={[
                  { label: reportsCopy('rep.day'), value: (r) => formatReportDate(r.business_date), width: 120 },
                  { label: reportsCopy('cu.outside.takenBy'), value: (r) => r.handled_by_name ?? '', width: 140 },
                  { label: reportsCopy('rep.amount'), value: (r) => money(r.amount_pence), numeric: true },
                ]}
              />
            </View>
          ) : null}
        </>
      )}
    </PosReportCard>
  );
}

const styles = StyleSheet.create({
  outside: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm, gap: spacing.xs },
});
