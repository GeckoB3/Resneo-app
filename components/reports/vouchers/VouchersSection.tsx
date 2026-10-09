import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { KpiTiles, PosReportCard, ReportLoadError, reportStyles, useReportDownload } from '@/components/reports/pos/PosReportUi';
import { AddExistingVoucherSheet } from '@/components/reports/vouchers/AddExistingVoucherSheet';
import { AllVouchersCard } from '@/components/reports/vouchers/AllVouchersCard';
import { VoucherImportSheet } from '@/components/reports/vouchers/VoucherImportSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { reportsCopy } from '@/lib/pos/reports-copy';
import { formatDay, todayInZone } from '@/lib/pos/voucher-math';
import { posReportPaths, useVoucherReport } from '@/lib/queries/usePosReports';
import { formatMoney, num, voucherCount, voucherReportPeriod, type VoucherRange } from '@/lib/reports/pos-report-format';
import { spacing } from '@/theme/index';

/**
 * The Vouchers tab (web `VouchersSection.tsx`, UX spec §20.11; admins while gift vouchers are on):
 * what was sold, used, expired and refunded in a period of its own (this month, last month or
 * chosen dates), what is still to be spent on any date (the venue's liability, "as at"), vouchers
 * added from before ResNeo, account credit beside them, and every voucher in a searchable list.
 * Totals are summed in SQL (`report_vouchers`); the CSV comes from the server, last four characters
 * only. Adding an existing voucher and importing a file start here, as on the web.
 */
export function VouchersSection({ canExport, timeZone, currency }: { canExport: boolean; timeZone: string; currency: string }) {
  const today = todayInZone(timeZone);
  const [range, setRange] = useState<VoucherRange>({ kind: 'this-month' });
  const [draft, setDraft] = useState<{ from: string; to: string }>({ from: today, to: today });
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

  return (
    <View style={reportStyles.stack}>
      <Card style={styles.card}>
        <Text variant="label">{reportsCopy('tab.vouchers')}</Text>
        <Text variant="bodySmall" tone="secondary">
          {reportsCopy('rep.v.help')}
        </Text>
        <Text variant="overline" tone="muted">
          {reportsCopy('rng.range')}
        </Text>
        <View style={styles.chips}>
          {(['this-month', 'last-month'] as const).map((kind) => (
            <Chip
              key={kind}
              label={reportsCopy(kind === 'this-month' ? 'preset.this-month' : 'preset.last-month')}
              selected={range.kind === kind}
              onPress={() => setRange({ kind })}
            />
          ))}
          <Chip
            label={reportsCopy('rng.choose')}
            selected={range.kind === 'custom'}
            onPress={() => {
              setDraft(period);
              setRange({ kind: 'custom', from: period.from, to: period.to });
            }}
          />
        </View>
        {range.kind === 'custom' ? (
          <View style={styles.custom}>
            <View style={styles.field}>
              <Text variant="caption" tone="muted">
                {reportsCopy('rng.from')}
              </Text>
              <DatePickerField
                value={draft.from}
                onChange={(from) => setDraft((d) => ({ ...d, from }))}
                accessibilityLabel={`${reportsCopy('tab.vouchers')} ${reportsCopy('rng.from')}`}
              />
            </View>
            <View style={styles.field}>
              <Text variant="caption" tone="muted">
                {reportsCopy('rng.to')}
              </Text>
              <DatePickerField
                value={draft.to}
                onChange={(to) => setDraft((d) => ({ ...d, to }))}
                accessibilityLabel={`${reportsCopy('tab.vouchers')} ${reportsCopy('rng.to')}`}
              />
            </View>
            <Button
              label={reportsCopy('rng.apply')}
              size="sm"
              disabled={!draft.from || !draft.to || draft.to < draft.from}
              onPress={() => setRange({ kind: 'custom', from: draft.from, to: draft.to })}
            />
          </View>
        ) : null}
        <View style={styles.field}>
          <Text variant="caption" tone="muted">
            {reportsCopy('rep.v.outstanding')}
          </Text>
          <DatePickerField value={asAtDay} onChange={setAsAt} accessibilityLabel={reportsCopy('rep.v.outstanding')} />
        </View>
        <View style={styles.chips}>
          <Button label={reportsCopy('vadd.open')} variant="secondary" size="sm" onPress={() => setSheet('add')} />
          <Button label={reportsCopy('vimp.open')} variant="secondary" size="sm" onPress={() => setSheet('import')} />
        </View>
      </Card>

      {q.isError ? <ReportLoadError message={posErrorMessage(q.error, reportsCopy('rep.error'))} onRetry={() => void q.refetch()} /> : null}
      {!data && q.isLoading ? <DetailSkeleton /> : null}

      {data ? (
        <View style={[reportStyles.stack, q.isFetching ? styles.busy : null]} accessibilityState={{ busy: q.isFetching }}>
          <PosReportCard
            title={reportsCopy('rep.v.title', { from: formatDay(data.report.from, timeZone), to: formatDay(data.report.to, timeZone) })}
            onExport={
              canExport
                ? () =>
                    void download(`${posReportPaths.voucherReport(exportQuery)}&format=csv`, reportsCopy('rep.v.list'), {
                      fallbackFilename: `gift-vouchers-${asAtDay}.csv`,
                    })
                : undefined
            }>
            <KpiTiles
              items={[
                { label: reportsCopy('rep.v.sold'), value: money(num(v.sold_pence)), caption: voucherCount(num(v.sold_count)) },
                { label: reportsCopy('rep.v.redeemed'), value: money(num(v.redeemed_pence) - num(v.reversed_pence)) },
                { label: reportsCopy('rep.v.expired'), value: money(num(v.expired_pence)), caption: reportsCopy('rep.v.expired.help') },
                { label: reportsCopy('rep.v.refunded'), value: money(num(v.refunded_pence)) },
                {
                  label: reportsCopy('rep.v.outstanding'),
                  value: money(num(v.outstanding_as_at_pence)),
                  caption: reportsCopy('rep.v.asAt', { date: formatDay(data.report.as_at, timeZone) }),
                },
              ]}
            />
          </PosReportCard>

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
                { label: reportsCopy('rep.v.given'), value: money(num(c.refunded_in_pence) + num(c.added_pence)) },
                { label: reportsCopy('rep.v.redeemed'), value: money(num(c.used_pence) - num(c.reversed_pence)) },
                {
                  label: reportsCopy('rep.v.outstanding'),
                  value: money(num(c.outstanding_as_at_pence)),
                  caption: reportsCopy('rep.v.asAt', { date: formatDay(data.report.as_at, timeZone) }),
                },
              ]}
            />
          </PosReportCard>

          <AllVouchersCard asAt={data.report.as_at} timeZone={timeZone} currency={cur} money={money} />
        </View>
      ) : null}

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
  card: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  custom: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.sm },
  field: { gap: spacing.xs },
  busy: { opacity: 0.7 },
});
