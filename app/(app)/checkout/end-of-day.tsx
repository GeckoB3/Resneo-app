import { Stack } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AmountRow, money, Notice, posStyles, usePosT } from '@/components/pos/parts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { businessDateLabel, shiftYmd, tillMethodLabel, varianceWords } from '@/lib/pos/till-math';
import { timeOfDay } from '@/lib/retail/stock-words';
import { usePosEnabled } from '@/lib/queries/usePos';
import { useEndOfDay } from '@/lib/queries/useTill';
import { spacing } from '@/theme/index';

/**
 * End of day for the venue in the app (POS app step 3, UX spec §7.6, §13.5): every till with the
 * shop and the other money sources, for admins and staff with `see_expected_cash` (the route refuses
 * anyone else with its own sentence). A day picker (`eod.date`); the tiles; each till counted
 * against expected; deposits and fees; tips by person; refunds; online orders waiting; and cash
 * outside a till session with `eod.cashOutside.help`. The evening email switch stays on the web.
 */
export default function EndOfDayScreen() {
  const t = usePosT();
  const posEnabled = usePosEnabled();
  const [date, setDate] = useState<string | null>(null);
  const eod = useEndOfDay(date);
  const header = <Stack.Screen options={{ headerShown: true, title: t('till.tab.eod') }} />;

  if (!posEnabled) {
    return (
      <Screen>
        {header}
        <EmptyState title={t('till.off.title')} message={t('till.off.body', { venue: 'your venue' })} />
      </Screen>
    );
  }
  if (eod.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <ListSkeleton />
      </Screen>
    );
  }
  if (eod.isError || !eod.data) {
    return (
      <Screen>
        {header}
        <ErrorState message={posErrorMessage(eod.error, t('app.till.eod.error'))} onRetry={() => void eod.refetch()} />
      </Screen>
    );
  }
  const data = eod.data;
  const s = data.summary;
  const shown = s.date || data.today;
  const timeZone = data.timezone;

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={eod.isRefetching} onRefresh={() => void eod.refetch()} />}>
        <View style={posStyles.stack}>
          <Text variant="label">{t('eod.date')}</Text>
          <View style={posStyles.row}>
            <Button label={t('app.till.eod.prev')} size="sm" variant="secondary" onPress={() => setDate(shiftYmd(shown, -1))} />
            <Text variant="subheading" style={styles.centre}>
              {businessDateLabel(shown)}
            </Text>
            <Button
              label={t('app.till.eod.next')}
              size="sm"
              variant="secondary"
              disabled={shown >= data.today}
              onPress={() => setDate(shiftYmd(shown, 1))}
            />
          </View>
        </View>

        <View style={styles.tiles}>
          <StatTile label={t('eod.tile.takings')} value={money(s.totals.net_pence)} style={styles.tile} />
          <StatTile label={t('eod.tile.card')} value={money(s.totals.card_pence)} style={styles.tile} />
        </View>
        <View style={styles.tiles}>
          <StatTile label={t('eod.tile.cash')} value={money(s.totals.cash_pence)} style={styles.tile} />
          <StatTile label={t('eod.tile.other')} value={money(s.totals.other_pence)} style={styles.tile} />
        </View>

        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('eod.tills')}</Text>
            {s.tills.length === 0 ? (
              <Text variant="bodySmall" tone="muted">
                {t('app.till.eod.none')}
              </Text>
            ) : (
              s.tills.map((till) => (
                <View key={till.session_id} style={styles.line}>
                  <View style={posStyles.row}>
                    <Text variant="bodyMedium" style={styles.flex}>
                      {till.till_name}
                    </Text>
                    <Badge label={till.status === 'open' ? t('session.chip.open') : t('session.chip.closed')} tone={till.status === 'open' ? 'warning' : 'neutral'} />
                  </View>
                  {till.status === 'open' || till.counted_cash_pence == null ? (
                    <Text variant="bodySmall" tone="muted">
                      {t('app.till.eod.tillOpen', { till: till.till_name })}
                    </Text>
                  ) : (
                    <Text variant="bodySmall">
                      {till.expected_cash_pence != null
                        ? t('app.till.eod.tillRowExpected', {
                            counted: money(till.counted_cash_pence),
                            expected: money(till.expected_cash_pence),
                            difference: varianceWords(till.variance_pence ?? 0, t, money),
                          })
                        : t('app.till.eod.tillRow', {
                            counted: money(till.counted_cash_pence),
                            difference: varianceWords(till.variance_pence ?? 0, t, money),
                          })}
                    </Text>
                  )}
                  {till.variance_reason ? (
                    <Text variant="caption" tone="muted">
                      {`${t('z.reason')}: ${till.variance_reason}`}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </Card>

        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('z.byMethod')}</Text>
            {s.by_method.length === 0 ? (
              <Text variant="bodySmall" tone="muted">
                {t('app.till.eod.none')}
              </Text>
            ) : (
              s.by_method.map((m) => <AmountRow key={`${m.method}-${m.name ?? ''}`} label={tillMethodLabel(m.method, m.name)} amount={money(m.net_pence)} />)
            )}
          </View>
        </Card>

        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('eod.deposits')}</Text>
            <Text variant="bodySmall">
              {t('app.till.eod.depositsRow', { deposits: money(s.deposits.deposits_pence), fees: money(s.deposits.fees_pence) })}
            </Text>
          </View>
        </Card>

        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('eod.tips')}</Text>
            {s.tips.length === 0 ? (
              <Text variant="bodySmall" tone="muted">
                {t('app.till.eod.none')}
              </Text>
            ) : (
              s.tips.map((p) => <AmountRow key={`${p.calendar_id ?? p.staff_id ?? p.name}`} label={p.name} amount={money(p.amount_pence)} />)
            )}
          </View>
        </Card>

        <Card>
          <View style={posStyles.stack}>
            <Text variant="label">{t('eod.refunds')}</Text>
            {s.refunds.length === 0 ? (
              <Text variant="bodySmall" tone="muted">
                {t('app.till.eod.none')}
              </Text>
            ) : (
              s.refunds.map((r) => (
                <AmountRow key={`${r.method}-${r.name ?? ''}`} label={`${tillMethodLabel(r.method, r.name)} (${r.count})`} amount={money(-r.amount_pence)} />
              ))
            )}
          </View>
        </Card>

        {s.orders_waiting > 0 ? <AmountRow label={t('eod.ordersWaiting')} amount={String(s.orders_waiting)} strong /> : null}

        {s.cash_outside.total_pence > 0 ? (
          <Card>
            <View style={posStyles.stack}>
              <AmountRow label={t('eod.cashOutside')} amount={money(s.cash_outside.total_pence)} strong />
              <Notice tone="warning">{t('eod.cashOutside.help')}</Notice>
              {s.cash_outside.rows.map((r) => (
                <Text key={r.id} variant="caption" tone="muted">
                  {t('app.till.eod.cashRow', {
                    amount: money(r.amount_pence),
                    time: timeOfDay(r.occurred_at, timeZone),
                    staffName: r.handled_by_name ?? 'your team',
                  })}
                </Text>
              ))}
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  flex: { flex: 1 },
  centre: { flex: 1, textAlign: 'center' },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1 },
  line: { gap: spacing.xxs },
});
