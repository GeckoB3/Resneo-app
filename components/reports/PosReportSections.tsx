import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { money, usePosT } from '@/components/pos/parts';
import { CardHeader, StatRow } from '@/components/reports/ReportCardParts';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ErrorState } from '@/components/ui/ErrorState';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { payoutStatusCopyId } from '@/lib/pos/card-methods';
import { usePayoutDetail, usePayouts, useSalesReport, useTakingsReport } from '@/lib/queries/usePos';
import { spacing } from '@/theme/index';
import type { PosReportPreset } from '@/types/pos';

/**
 * Reports' Takings and Sales tabs in the app (POS plan P7-4, UX spec §11.1, §11.2, §13.3). Shown
 * only where `GET /api/venue/reports/pos-access` says the venue has them and this login may read
 * them; every other venue keeps the four-option control. Each tab carries its own date presets,
 * as Revenue and New bookings do. Payouts and fees (admins only) joined with app step 2 (P7-9);
 * cash-ups join with app step 3.
 */

const PRESETS: { value: PosReportPreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this-week', label: 'This week' },
  { value: 'last-week', label: 'Last week' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
];

const METHOD_LABELS: Record<string, string> = {
  card_reader: 'Card reader',
  card_app: 'Card in the app',
  card_online: 'Card online (deposits, shop and pay links)',
  saved_card: 'Card on file',
  cash: 'Cash',
};

const SOURCE_LABELS: Record<string, string> = {
  checkout: 'Checkout',
  deposits: 'Online deposits',
  fees: 'No-show and late cancellation fees',
  shop: 'Online shop orders',
  classes: 'Class passes and memberships',
  disputes: 'Disputes',
  other: 'Other',
};

export function takingsMethodLabel(method: string, externalTypeName: string | null): string {
  if (method === 'external') return externalTypeName?.trim() || 'Other payment type';
  return METHOD_LABELS[method] ?? method;
}

function PresetRow({ value, onChange }: { value: PosReportPreset; onChange: (p: PosReportPreset) => void }) {
  return (
    <View style={styles.chips}>
      {PRESETS.map((p) => (
        <Chip key={p.value} label={p.label} selected={value === p.value} onPress={() => onChange(p.value)} />
      ))}
    </View>
  );
}

function rangeText(from?: string, to?: string): string {
  if (!from || !to) return '';
  return from === to ? from : `${from} to ${to}`;
}

export function TakingsSection() {
  const [preset, setPreset] = useState<PosReportPreset>('today');
  const q = useTakingsReport(preset);
  const d = q.data;
  return (
    <View style={styles.stack}>
      <PresetRow value={preset} onChange={setPreset} />
      <Text variant="caption" tone="muted">
        {"Money in and out, on the day it moved. A deposit paid online on Monday for Friday's appointment counts on Monday."}
      </Text>
      {q.isLoading ? (
        <DetailSkeleton />
      ) : q.isError || !d ? (
        <ErrorState
          message={q.error instanceof ApiError ? q.error.message : "We couldn't load this report."}
          onRetry={() => void q.refetch()}
        />
      ) : (
        <>
          <Text variant="caption" tone="muted">
            {rangeText(d.from, d.to)}
          </Text>
          <Card>
            <CardHeader title="Takings" />
            <StatRow label="Payments in" value={money(d.totals.payments_pence)} />
            <StatRow label="Refunds out" value={money(d.totals.refunds_pence)} />
            <StatRow label="Net takings" value={money(d.totals.net_pence)} accent="emerald" />
            <StatRow label="Tips" value={money(d.totals.tips_pence)} />
            {d.estimated?.note ? (
              <Text variant="caption" tone="muted">
                {d.estimated.note}
              </Text>
            ) : null}
          </Card>
          {d.by_method.length ? (
            <Card>
              <CardHeader title="By payment method" />
              {d.by_method.map((m) => (
                <StatRow
                  key={`${m.method}-${m.external_type_name ?? ''}`}
                  label={takingsMethodLabel(m.method, m.external_type_name)}
                  value={money(m.net_pence)}
                />
              ))}
            </Card>
          ) : null}
          {d.by_source.length ? (
            <Card>
              <CardHeader title="By where it came from" />
              {d.by_source.map((s) => (
                <StatRow key={s.source} label={SOURCE_LABELS[s.source] ?? s.source} value={money(s.net_pence)} />
              ))}
            </Card>
          ) : null}
          {d.by_person.length ? (
            <Card>
              <CardHeader title="By who took the payment" />
              {d.by_person.map((p) => (
                <StatRow
                  key={p.staff_id ?? p.name ?? 'online'}
                  label={p.name?.trim() || (p.staff_id ? 'Team member' : 'Online, no team member')}
                  value={money(p.net_pence)}
                />
              ))}
            </Card>
          ) : null}
          {d.refunds.length ? (
            <Card>
              <CardHeader title="Refunds and reasons" />
              {d.refunds.map((r, i) => (
                <StatRow
                  key={`${r.source_type}-${r.reason}-${i}`}
                  label={`${r.reason?.trim() || 'No reason recorded'} (${r.refund_count})`}
                  value={money(r.amount_pence + r.tip_pence)}
                />
              ))}
            </Card>
          ) : null}
          {d.tips?.by_recipient.length ? (
            <Card>
              <CardHeader title="Tips by person" />
              {d.tips.by_recipient.map((r) => (
                <StatRow key={`${r.calendar_id ?? ''}-${r.staff_id ?? ''}-${r.allocation_kind}`} label={r.name} value={money(r.net_pence)} />
              ))}
            </Card>
          ) : null}
          {d.totals.row_count === 0 ? <Text tone="muted">Nothing to show for this period.</Text> : null}
        </>
      )}
      <PayoutsSection preset={preset} />
    </View>
  );
}

/**
 * Payouts and fees on the Takings tab (POS plan P2-8 and P7-9; UX spec §11.1 `rep.t.payouts`,
 * §13.4): each payout Stripe is sending to the bank, when it arrives, the amount, Stripe's fees and
 * its status, opening to the payments, refunds and fees it covered. Read-only, admins only (the
 * route refuses anyone else with 403, and then nothing shows). Instant payouts are v1.x.
 */
export function PayoutsSection({ preset }: { preset: PosReportPreset }) {
  const t = usePosT();
  const q = usePayouts(preset);
  const [open, setOpen] = useState<string | null>(null);
  if (q.error instanceof ApiError && q.error.status === 403) return null;
  const d = q.data;
  return (
    <Card>
      <CardHeader title={t('rep.t.payouts')} />
      <Text variant="caption" tone="muted">
        {t('rep.payout.intro')}
      </Text>
      {q.isLoading ? (
        <DetailSkeleton />
      ) : q.isError || !d ? (
        <ErrorState
          message={q.error instanceof ApiError ? q.error.message : "We couldn't load this report."}
          onRetry={() => void q.refetch()}
        />
      ) : !d.connected ? (
        <Text tone="muted">{t('rep.payout.notConnected')}</Text>
      ) : d.payouts.length === 0 ? (
        <Text tone="muted">{t('rep.payout.none')}</Text>
      ) : (
        <View style={styles.stack}>
          {d.payouts.map((p) => (
            <View key={p.id} style={styles.payout}>
              <Pressable
                onPress={() => setOpen((o) => (o === p.id ? null : p.id))}
                accessibilityRole="button"
                accessibilityState={{ expanded: open === p.id }}
                accessibilityLabel={`${t('rep.payout.arrives')} ${p.arrival_date}, ${money(p.amount_pence)}, ${t(payoutStatusCopyId(p.status))}`}>
                <StatRow label={`${t('rep.payout.arrives')} ${p.arrival_date}`} value={money(p.amount_pence)} />
                <StatRow
                  label={t('rep.payout.fees')}
                  value={p.fees_pence == null ? t('rep.payout.feesNotListed') : money(p.fees_pence)}
                />
                <StatRow label={t('rep.payout.status')} value={t(payoutStatusCopyId(p.status))} />
                <Text variant="caption" tone="muted">
                  {open === p.id ? t('rep.payout.hide') : t('rep.payout.show')}
                </Text>
              </Pressable>
              {open === p.id ? <PayoutDetail preset={preset} payoutId={p.id} /> : null}
            </View>
          ))}
          {d.truncated ? (
            <Text variant="caption" tone="muted">
              {t('rep.payout.truncated')}
            </Text>
          ) : null}
        </View>
      )}
    </Card>
  );
}

function PayoutDetail({ preset, payoutId }: { preset: PosReportPreset; payoutId: string }) {
  const t = usePosT();
  const q = usePayoutDetail(preset, payoutId);
  if (q.isLoading) return <DetailSkeleton />;
  if (q.isError || !q.data) {
    return (
      <ErrorState
        message={q.error instanceof ApiError ? q.error.message : "We couldn't load this report."}
        onRetry={() => void q.refetch()}
      />
    );
  }
  const d = q.data;
  if (!d.payout.automatic) return <Text tone="muted">{t('rep.payout.manual')}</Text>;
  return (
    <View style={styles.detail}>
      <Text variant="label">{t('rep.payout.covered')}</Text>
      {d.items.map((r) => (
        <StatRow
          key={r.id}
          label={`${r.created_at.slice(0, 10)} ${r.card_last4 ? `${r.label}, card ending ${r.card_last4}` : r.label}`}
          value={`${money(r.gross_pence)} (${t('rep.payout.fees')} ${money(r.fee_pence)})`}
        />
      ))}
      <StatRow label={t('rep.payout.paidOut')} value={money(d.items.reduce((sum, r) => sum + r.net_pence, 0))} />
    </View>
  );
}

export function SalesSection() {
  const t = usePosT();
  const [preset, setPreset] = useState<PosReportPreset>('today');
  const q = useSalesReport(preset);
  const d = q.data;
  return (
    <View style={styles.stack}>
      <PresetRow value={preset} onChange={setPreset} />
      <Text variant="caption" tone="muted">
        What you sold, on the day each sale was paid. Deposits paid earlier count as part of the sale, not as new money.
      </Text>
      {q.isLoading ? (
        <DetailSkeleton />
      ) : q.isError || !d ? (
        <ErrorState
          message={q.error instanceof ApiError ? q.error.message : "We couldn't load this report."}
          onRetry={() => void q.refetch()}
        />
      ) : (
        <>
          <Text variant="caption" tone="muted">
            {rangeText(d.from, d.to)}
          </Text>
          <Card>
            <CardHeader title="Sales" />
            <StatRow label="Sales" value={money(d.totals.sales_pence)} accent="emerald" />
            <StatRow label="Number of sales" value={String(d.totals.sales_count)} />
            <StatRow label="Average sale" value={money(d.totals.average_sale_pence)} />
            <StatRow label="Retail per visit" value={money(d.totals.retail_per_visit_pence)} />
            <StatRow label={t('totals.discounts')} value={money(d.totals.discount_pence)} />
            <StatRow label="Refunds" value={money(d.totals.refunds_pence)} />
          </Card>
          <Card>
            <CardHeader title="Services and products" />
            <StatRow label="Services" value={money(d.totals.services_pence)} />
            <StatRow label="Products" value={money(d.totals.retail_pence)} />
          </Card>
          {d.by_service.length ? (
            <Card>
              <CardHeader title="By service" />
              {d.by_service.slice(0, 20).map((s) => (
                <StatRow key={s.key} label={`${s.name} (${s.quantity})`} value={money(s.sales_pence)} />
              ))}
            </Card>
          ) : null}
          {d.by_performer.length ? (
            <Card>
              <CardHeader title="Services by team member" />
              {d.by_performer.map((p) => (
                <StatRow key={`${p.calendar_id ?? ''}-${p.staff_id ?? ''}`} label={p.name} value={money(p.total_pence)} />
              ))}
              <Text variant="caption" tone="muted">
                Where a line was shared, each person gets their share.
              </Text>
            </Card>
          ) : null}
          {d.discounts_by_reason.length ? (
            <Card>
              <CardHeader title="Discounts by reason" />
              {d.discounts_by_reason.map((r) => (
                <StatRow key={r.reason} label={`${r.reason} (${r.discount_count})`} value={money(r.amount_pence)} />
              ))}
            </Card>
          ) : null}
          {d.totals.sales_count === 0 ? <Text tone="muted">Nothing to show for this period.</Text> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  payout: { gap: spacing.xs },
  detail: { gap: spacing.xs, paddingLeft: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
