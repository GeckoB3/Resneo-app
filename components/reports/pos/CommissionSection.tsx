import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PosRangeCard, PosReportCard, ReportLoadError, ReportTable, reportStyles, useReportDownload, useReportNotice } from '@/components/reports/pos/PosReportUi';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { reportsCopy } from '@/lib/pos/reports-copy';
import { posReportPaths, useCommissionLines, useCommissionReport } from '@/lib/queries/usePosReports';
import { formatLongDay, formatMoney, rangeQuery } from '@/lib/reports/pos-report-format';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CommissionPersonRow, PosRangeChoice, ReportGrain } from '@/types/pos-reports';

/**
 * The Commission tab (web `CommissionSection.tsx`, UX spec §22.2; admins): one row per person
 * (services, products and vouchers base and commission, the total, and tips beside it for
 * reference), a totals row, a person's lines on a tap (each opening its sale), "Changed since you
 * exported it" after a credit correction, and the CSV (summary or every line) through the share
 * sheet. Reads GET /api/venue/pos/commission/report. A team member's own figures are on Checkout's
 * "My sales" (`useMyCommission`), as on the web.
 */
export function CommissionSection({ today }: { today: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const [choice, setChoice] = useState<PosRangeChoice>({ kind: 'preset', preset: 'this-month' });
  const [grain, setGrain] = useState<ReportGrain>('day');
  const [person, setPerson] = useState<CommissionPersonRow | null>(null);
  const q = useCommissionReport(choice, grain);
  const data = q.data;
  const drill = useCommissionLines(choice, grain, person?.person_key ?? null);
  const money = (pence: number) => formatMoney(pence, data?.currency);
  const notice = useReportNotice();
  const download = useReportDownload();
  const query = rangeQuery(choice, grain);
  const changedPersons = new Set(data?.changed?.persons ?? []);
  const changedLines = new Set(data?.changed?.lines ?? []);
  const saleNo = (n: number) => `${data?.receipt_prefix ?? ''}${n}`;
  const exportCsv = (kind: 'summary' | 'lines') =>
    void download(`${posReportPaths.commission(query)}&format=csv&kind=${kind}`, reportsCopy('tab.commission')).then(() => void q.refetch());

  return (
    <View style={reportStyles.stack}>
      <PosRangeCard
        title={reportsCopy('tab.commission')}
        help={`${reportsCopy('rep.c.help')} ${reportsCopy('rep.c.onlyTill')}`}
        choice={choice}
        onChoice={(c) => {
          setPerson(null);
          setChoice(c);
        }}
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
          {!data.has_rates ? (
            <View accessibilityRole="text" style={[styles.note, { borderColor: colors.info, backgroundColor: colors.infoSurface }]}>
              <Text variant="bodySmall">{reportsCopy('rep.c.noRates')}</Text>
            </View>
          ) : null}

          <PosReportCard title={reportsCopy('rep.c.table')} onExport={data.can_export ? () => exportCsv('summary') : undefined}>
            <ReportTable
              caption={reportsCopy('rep.c.table')}
              rows={data.rows}
              rowKey={(r) => r.person_key}
              columns={[
                {
                  label: reportsCopy('rep.c.col.person'),
                  width: 180,
                  value: (r) => (
                    <View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={reportsCopy('rep.c.lines', { staffName: r.person_name })}
                        onPress={() => setPerson(r)}
                        hitSlop={8}>
                        <Text variant="bodyMedium" tone="brand" style={styles.link}>
                          {r.person_name}
                        </Text>
                      </Pressable>
                      {changedPersons.has(r.person_key) && data.changed ? (
                        <Text variant="caption" style={{ color: colors.warning }}>
                          {reportsCopy('rep.c.changed', { date: formatLongDay(data.changed.exported_at) })}
                        </Text>
                      ) : null}
                    </View>
                  ),
                },
                { label: reportsCopy('rep.c.col.servicesBase'), value: (r) => money(r.service_base_pence), numeric: true, width: 112 },
                { label: reportsCopy('rep.c.col.servicesComm'), value: (r) => money(r.service_commission_pence), numeric: true, width: 120 },
                { label: reportsCopy('rep.c.col.productsBase'), value: (r) => money(r.product_base_pence), numeric: true, width: 112 },
                { label: reportsCopy('rep.c.col.productsComm'), value: (r) => money(r.product_commission_pence), numeric: true, width: 120 },
                { label: reportsCopy('rep.c.col.vouchersBase'), value: (r) => money(r.voucher_base_pence), numeric: true, width: 112 },
                { label: reportsCopy('rep.c.col.vouchersComm'), value: (r) => money(r.voucher_commission_pence), numeric: true, width: 120 },
                { label: reportsCopy('rep.c.col.total'), value: (r) => money(r.total_commission_pence), numeric: true, width: 120 },
                { label: reportsCopy('rep.c.col.tips'), value: (r) => money(r.tips_pence), numeric: true, width: 120 },
              ]}
              footer={[
                reportsCopy('rep.total'),
                money(data.totals.service_base_pence),
                money(data.totals.service_commission_pence),
                money(data.totals.product_base_pence),
                money(data.totals.product_commission_pence),
                money(data.totals.voucher_base_pence),
                money(data.totals.voucher_commission_pence),
                money(data.totals.total_commission_pence),
                money(data.totals.tips_pence),
              ]}
            />
            <Text variant="caption" tone="muted">
              {reportsCopy('rep.c.tipsNote')}
            </Text>
            {data.can_export ? (
              <Pressable accessibilityRole="button" onPress={() => exportCsv('lines')} hitSlop={8}>
                <Text variant="label" tone="brand">
                  {reportsCopy('rep.c.exportLines', { lines: reportsCopy('rep.c.lines', { staffName: reportsCopy('rep.c.everyone') }) })}
                </Text>
              </Pressable>
            ) : null}
          </PosReportCard>

          {person ? (
            <PosReportCard title={reportsCopy('rep.c.lines', { staffName: person.person_name })}>
              {drill.data?.lines ? (
                <ReportTable
                  caption={reportsCopy('rep.c.lines', { staffName: person.person_name })}
                  rows={drill.data.lines}
                  rowKey={(l, i) => `${l.row_kind}:${l.refund_id ?? l.sale_id}:${l.line_id}:${i}`}
                  columns={[
                    { label: reportsCopy('rep.date'), value: (l) => formatLongDay(l.business_date), width: 140 },
                    {
                      label: reportsCopy('rep.c.sale'),
                      width: 170,
                      value: (l) => (
                        <View>
                          <Pressable
                            accessibilityRole="link"
                            onPress={() => router.push(`/checkout/${encodeURIComponent(l.sale_id)}` as Href)}
                            hitSlop={8}>
                            <Text variant="bodySmall" tone="brand" style={styles.link}>
                              {l.row_kind === 'refund'
                                ? reportsCopy('rep.c.refundRow', { saleNo: saleNo(l.sale_number) })
                                : reportsCopy('rep.c.line.sale', { saleNo: saleNo(l.sale_number) })}
                            </Text>
                          </Pressable>
                          {changedLines.has(l.line_id) ? (
                            <Text variant="caption" style={{ color: colors.warning }}>
                              {reportsCopy('rep.c.changed.line')}
                            </Text>
                          ) : null}
                        </View>
                      ),
                    },
                    { label: reportsCopy('rep.c.item'), value: (l) => l.item_name, width: 170 },
                    { label: reportsCopy('rep.c.share'), value: (l) => `${l.share_bps / 100}%`, numeric: true, width: 80 },
                    { label: reportsCopy('rep.c.base'), value: (l) => money(l.base_pence), numeric: true },
                    { label: reportsCopy('rep.c.rate'), value: (l) => `${l.rate_bps / 100}%`, numeric: true, width: 80 },
                    { label: reportsCopy('rep.c.commission'), value: (l) => money(l.commission_pence), numeric: true, width: 112 },
                  ]}
                />
              ) : drill.isError ? (
                <ReportLoadError message={posErrorMessage(drill.error, reportsCopy('rep.error'))} onRetry={() => void drill.refetch()} />
              ) : (
                <DetailSkeleton />
              )}
            </PosReportCard>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  busy: { opacity: 0.7 },
  note: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  link: { textDecorationLine: 'underline' },
});
