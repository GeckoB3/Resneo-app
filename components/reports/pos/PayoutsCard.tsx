import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { usePosT } from '@/components/pos/parts';
import { PosReportCard, ReportLoadError, ReportTable } from '@/components/reports/pos/PosReportUi';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { posErrorMessage } from '@/lib/pos/api';
import { payoutStatusCopyId } from '@/lib/pos/card-methods';
import { reportsCopy } from '@/lib/pos/reports-copy';
import { usePayoutDetailRange, usePayoutsRange } from '@/lib/queries/usePosReports';
import { formatMoney, formatReportDate } from '@/lib/reports/pos-report-format';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosPayoutStatus } from '@/types/pos';
import type { PosRangeChoice, ReportGrain } from '@/types/pos-reports';

/**
 * Payouts and fees on the Takings tab (web `PayoutsSection.tsx`, UX spec §11.1 `rep.t.payouts`;
 * plan §4.10, P2-8). Admins only (the caller shows it to admins, and the route refuses anyone
 * else): each payout Stripe is sending to the bank, when it arrives, the amount, Stripe's fees and
 * its status, opening to the payments, refunds and fees it covered. Read-only; there is no CSV on
 * the web either. Instant payouts are v1.x.
 */

const STATUS_TONE: Record<PosPayoutStatus, BadgeTone> = {
  paid: 'success',
  on_its_way: 'brand',
  pending: 'neutral',
  failed: 'danger',
  cancelled: 'neutral',
};

export function PayoutsCard({ choice, grain }: { choice: PosRangeChoice; grain: ReportGrain }) {
  const t = usePosT();
  const q = usePayoutsRange(choice, grain);
  const [open, setOpen] = useState<string | null>(null);
  if (q.error instanceof ApiError && q.error.status === 403) return null;
  const data = q.data;
  const money = (pence: number) => formatMoney(pence, data?.currency);

  return (
    <PosReportCard title={t('rep.t.payouts')}>
      <Text variant="bodySmall" tone="secondary">
        {t('rep.payout.intro')}
      </Text>
      {q.isError ? (
        <ReportLoadError message={posErrorMessage(q.error, reportsCopy('rep.error'))} onRetry={() => void q.refetch()} />
      ) : q.isLoading || !data ? (
        <DetailSkeleton />
      ) : !data.connected ? (
        <Text variant="bodySmall" tone="secondary">
          {t('rep.payout.notConnected')}
        </Text>
      ) : (
        <>
          <ReportTable
            caption={t('rep.t.payouts')}
            rows={data.payouts}
            rowKey={(r) => r.id}
            columns={[
              { label: t('rep.payout.arrives'), value: (r) => formatReportDate(r.arrival_date), width: 120 },
              { label: t('rep.payout.amount'), value: (r) => money(r.amount_pence), numeric: true },
              {
                label: t('rep.payout.fees'),
                value: (r) => (r.fees_pence == null ? t('rep.payout.feesNotListed') : money(r.fees_pence)),
                numeric: true,
              },
              {
                label: t('rep.payout.status'),
                value: (r) => <Badge label={t(payoutStatusCopyId(r.status))} tone={STATUS_TONE[r.status] ?? 'neutral'} />,
                width: 120,
              },
              {
                label: reportsCopy('po.covered'),
                value: (r) => (
                  <Button
                    label={open === r.id ? t('rep.payout.hide') : t('rep.payout.show')}
                    size="sm"
                    variant="secondary"
                    accessibilityState={{ expanded: open === r.id }}
                    onPress={() => setOpen((o) => (o === r.id ? null : r.id))}
                  />
                ),
                width: 170,
              },
            ]}
          />
          {data.truncated ? (
            <Text variant="caption" tone="muted">
              {t('rep.payout.truncated')}
            </Text>
          ) : null}
          {open ? (
            <PayoutDetail key={open} choice={choice} grain={grain} payoutId={open} currency={data.currency} onClose={() => setOpen(null)} />
          ) : null}
        </>
      )}
    </PosReportCard>
  );
}

function PayoutDetail({
  choice,
  grain,
  payoutId,
  currency,
  onClose,
}: {
  choice: PosRangeChoice;
  grain: ReportGrain;
  payoutId: string;
  currency: string;
  onClose: () => void;
}) {
  const t = usePosT();
  const { colors } = useTheme();
  const q = usePayoutDetailRange(choice, grain, payoutId);
  const d = q.data;
  const money = (pence: number) => formatMoney(pence, d?.currency ?? currency);
  return (
    <View style={[styles.detail, { borderTopColor: colors.border }]}>
      <View style={styles.detailHead}>
        <Text variant="label" style={styles.flex}>
          {d
            ? reportsCopy('po.coveredAmount', { amount: money(d.payout.amount_pence), date: formatReportDate(d.payout.arrival_date) })
            : t('rep.payout.covered')}
        </Text>
        <Button label={reportsCopy('rep.close')} size="sm" variant="secondary" onPress={onClose} />
      </View>
      {q.isError ? (
        <ReportLoadError message={posErrorMessage(q.error, reportsCopy('rep.error'))} onRetry={() => void q.refetch()} />
      ) : q.isLoading || !d ? (
        <DetailSkeleton />
      ) : !d.payout.automatic ? (
        <Text variant="bodySmall" tone="secondary">
          {t('rep.payout.manual')}
        </Text>
      ) : (
        <ReportTable
          caption={t('rep.payout.covered')}
          rows={d.items}
          rowKey={(r) => r.id}
          columns={[
            { label: reportsCopy('rep.date'), value: (r) => formatReportDate(r.created_at.slice(0, 10)), width: 120 },
            {
              label: reportsCopy('po.for'),
              value: (r) => (r.card_last4 ? reportsCopy('po.cardEnding', { label: r.label, last4: r.card_last4 }) : r.label),
              width: 200,
            },
            { label: t('rep.payout.amount'), value: (r) => money(r.gross_pence), numeric: true },
            { label: t('rep.payout.fees'), value: (r) => money(r.fee_pence), numeric: true },
            { label: t('rep.payout.paidOut'), value: (r) => money(r.net_pence), numeric: true },
          ]}
          footer={[
            reportsCopy('rep.total'),
            '',
            money(d.items.reduce((s, r) => s + r.gross_pence, 0)),
            money(d.items.reduce((s, r) => s + r.fee_pence, 0)),
            money(d.items.reduce((s, r) => s + r.net_pence, 0)),
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  detail: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm, gap: spacing.sm },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
