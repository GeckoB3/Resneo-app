import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { usePosT } from '@/components/pos/parts';
import { PosReportCard, ReportLoadError } from '@/components/reports/pos/PosReportUi';
import { ReportVoucherStatus, VoucherDetailSheet } from '@/components/reports/vouchers/VoucherDetailSheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { SearchBar } from '@/components/ui/SearchBar';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { reportsCopy } from '@/lib/pos/reports-copy';
import { formatDay } from '@/lib/pos/voucher-math';
import { useVoucherList } from '@/lib/queries/usePosReports';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * "All vouchers" on the Vouchers tab (web `AllVouchersCard.tsx`, UX spec §20.11 `rep.v.list`):
 * every voucher with what is left on it on the chosen date, newest first, searchable by its last
 * four characters or a name and filtered by status. Each row opens the voucher sheet. Read from
 * GET /api/venue/pos/vouchers/report?format=list, 25 more at a time.
 */

const PAGE = 25;
const STATUSES: { value: string; id: 'vch.status.active' | 'vch.status.usedUp' | 'vch.status.expired' | 'vch.status.frozen' | 'vch.status.cancelled' }[] = [
  { value: 'active', id: 'vch.status.active' },
  { value: 'used_up', id: 'vch.status.usedUp' },
  { value: 'expired', id: 'vch.status.expired' },
  { value: 'frozen', id: 'vch.status.frozen' },
  { value: 'cancelled', id: 'vch.status.cancelled' },
];

export function AllVouchersCard({
  asAt,
  timeZone,
  currency,
  money,
}: {
  asAt: string;
  timeZone: string;
  currency: string;
  money: (pence: number) => string;
}) {
  const t = usePosT();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [needle, setNeedle] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);

  // Searching waits for a pause in typing, and starts again from the first page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setNeedle(search.trim());
      setShown(PAGE);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const q = useVoucherList({ asAt, limit: shown, q: needle || null, status });
  const data = q.data;

  return (
    <PosReportCard title={reportsCopy('rep.v.list')}>
      <SearchBar
        value={search}
        onChangeText={setSearch}
        onClear={() => setSearch('')}
        placeholder={reportsCopy('rep.v.search')}
        accessibilityLabel={reportsCopy('rep.v.searchLabel')}
      />
      <View style={styles.chips}>
        <Chip
          label={reportsCopy('rep.v.all')}
          selected={status === null}
          onPress={() => {
            setStatus(null);
            setShown(PAGE);
          }}
        />
        {STATUSES.map((s) => (
          <Chip
            key={s.value}
            label={t(s.id)}
            selected={status === s.value}
            onPress={() => {
              setStatus(s.value);
              setShown(PAGE);
            }}
          />
        ))}
      </View>

      {q.isError ? <ReportLoadError message={posErrorMessage(q.error, reportsCopy('rep.error'))} onRetry={() => void q.refetch()} /> : null}
      {!data && q.isLoading ? (
        <Text variant="bodySmall" tone="muted">
          {reportsCopy('rep.v.loading')}
        </Text>
      ) : null}
      {data && data.vouchers.length === 0 ? (
        <Text variant="bodySmall" tone="muted">
          {reportsCopy('rep.empty')}
        </Text>
      ) : null}

      {data && data.vouchers.length > 0 ? (
        <View style={[styles.list, { borderColor: colors.border }]}>
          {data.vouchers.map((v) => {
            const meta = [
              v.recipient_name ? reportsCopy('rep.v.for', { name: v.recipient_name }) : null,
              v.buyer_name ? reportsCopy('rep.v.boughtBy', { name: v.buyer_name }) : null,
              v.issued_at ? reportsCopy('rep.v.issued', { date: formatDay(v.issued_at.slice(0, 10), timeZone) }) : null,
            ]
              .filter(Boolean)
              .join(' · ');
            const ending = reportsCopy('rep.v.ending', { last4: v.code_last4 ?? '????' });
            return (
              <Pressable
                key={v.id}
                accessibilityRole="button"
                accessibilityLabel={`${ending}, ${reportsCopy('rep.v.balanceOf', { balance: money(v.balance_pence), initial: money(v.initial_pence) })}`}
                onPress={() => setOpen(v.id)}
                style={({ pressed }) => [styles.item, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
                <View style={styles.flex}>
                  <Text variant="bodyMedium">{ending}</Text>
                  {meta ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {meta}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.right}>
                  <Text variant="bodySmall" style={styles.figure}>
                    {reportsCopy('rep.v.balanceOf', { balance: money(v.balance_pence), initial: money(v.initial_pence) })}
                  </Text>
                  <ReportVoucherStatus status={v.status} />
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {data && data.total > data.vouchers.length ? (
        <View style={styles.more}>
          <Text variant="caption" tone="muted">
            {reportsCopy('rep.v.showing', { shown: data.vouchers.length, total: data.total })}
          </Text>
          <Button label={reportsCopy('rep.v.more')} variant="secondary" size="sm" onPress={() => setShown((n) => n + PAGE)} />
        </View>
      ) : null}

      <VoucherDetailSheet voucherId={open} canManage timeZone={timeZone} currency={currency} onClose={() => setOpen(null)} />
    </PosReportCard>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  list: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
  right: { alignItems: 'flex-end', gap: spacing.xs },
  figure: { fontVariant: ['tabular-nums'] },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
