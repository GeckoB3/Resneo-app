import { format, parseISO } from 'date-fns';
import { type Href, Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AttentionCard, EmptyCard, RowLink, SaleRowCard, SectionTitle, TodayFiguresCard } from '@/components/pos/CheckoutHome';
import { money, Notice, posStyles, usePosT } from '@/components/pos/parts';
import { CheckoutLanding } from '@/components/pos/switches/CheckoutLanding';
import { saleHref, useOpenCheckout } from '@/components/pos/useOpenCheckout';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError, apiErrorCode } from '@/lib/api/client';
import { canPos } from '@/lib/pos/pos-enabled';
import { queueChips } from '@/lib/pos/sale-math';
import { businessDateLabel, isLeftOpen, tillsInOrder } from '@/lib/pos/till-math';
import { todayInZone } from '@/lib/pos/voucher-math';
import { useMyCommission, usePosAlerts, usePosBootstrap, usePosEnabled, usePosQueue, usePosSaleList } from '@/lib/queries/usePos';
import { useSalesRange, useTakingsRange } from '@/lib/queries/usePosReports';
import { useTillSessions } from '@/lib/queries/useTill';
import { spacing } from '@/theme/index';
import type { PosMinePeriod, PosQueueRow } from '@/types/pos';
import type { PosRangeChoice } from '@/types/pos-reports';

/**
 * Checkout home in the app (POS app step 1, UX spec §13.3 "Checkout home"), laid out to fit the
 * person (Part 2 mock-up 5, approved 2026-10-11):
 * - "New sale" first.
 * - The business's day for admins and team members with `view_reports` (owner's decision): net
 *   takings, the number of sales and tips today, from the Takings and Sales reports Reports reads.
 * - "Needs your attention" for admins (`GET /api/venue/pos/alerts`), hidden when there is nothing.
 * - The till at a glance, while the venue counts cash in till sessions.
 * - Who is ready to pay, saying how clients get there, then open sales as a list, with every sale
 *   one tap away on All sales.
 * - The person's own sales and tips last: with its periods for a team member, today's for an admin,
 *   and not at all in a one-person business, where the day's figures are already theirs.
 * Reached from the Checkout tile in More. With the venue's `pos_enabled` off it is the landing
 * (POS Part 5, `CheckoutLanding`): switching on for an admin of an offered venue, the paused and
 * not-available states, and at a venue never offered it today's `till.off`; none of it asks a
 * Checkout route.
 */

const TODAY: PosRangeChoice = { kind: 'preset', preset: 'today' };

function timeOf(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'HH:mm');
  } catch {
    return '';
  }
}

export default function CheckoutHomeScreen() {
  const t = usePosT();
  const router = useRouter();
  const posEnabled = usePosEnabled();
  const boot = usePosBootstrap();
  const { open, openingKey } = useOpenCheckout();

  const isAdmin = boot.data?.role === 'admin';
  // Admins are sent every capability as true, so this is admins and anyone with view_reports.
  const showFigures = canPos(boot.data, 'view_reports');
  const queue = usePosQueue(null);
  const openSales = usePosSaleList({ status: 'open' });
  const takings = useTakingsRange(TODAY, 'day', { enabled: showFigures });
  const salesToday = useSalesRange(TODAY, 'day', { enabled: showFigures });
  const alerts = usePosAlerts({ enabled: isAdmin });

  const header = <Stack.Screen options={{ headerShown: true, title: t('till.title') }} />;

  if (!posEnabled) {
    // Checkout is off: the landing (POS Part 5), whose states include today's "not available".
    return <CheckoutLanding />;
  }
  if (boot.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <ListSkeleton />
      </Screen>
    );
  }
  if (boot.isError || !boot.data) {
    const off = boot.error instanceof ApiError && apiErrorCode(boot.error) === 'feature_disabled';
    return (
      <Screen>
        {header}
        {off ? (
          <EmptyState title={t('till.off.title')} message={t('till.off.body', { venue: 'your venue' })} />
        ) : (
          <ErrorState
            title={t('till.error.title')}
            message={boot.error instanceof ApiError ? boot.error.message : t('till.error.body')}
            onRetry={() => void boot.refetch()}
          />
        )}
      </Screen>
    );
  }

  const canStart = canPos(boot.data, 'create_sale');
  // One person serving (one calendar, or one login): every sale is already theirs.
  const onePerson = (boot.data.operators ?? []).length <= 1;
  const queueRows = queue.data?.bookings ?? [];
  const openRows = openSales.data?.sales ?? [];
  const venueToday = todayInZone(boot.data.venue?.timezone ?? 'Europe/London');

  const refresh = () => {
    void queue.refetch();
    void openSales.refetch();
    if (showFigures) {
      void takings.refetch();
      void salesToday.refetch();
    }
    if (isAdmin) void alerts.refetch();
  };

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={queue.isRefetching || openSales.isRefetching} onRefresh={refresh} />}
        keyboardShouldPersistTaps="handled">
        {canStart ? (
          <Button label={t('till.newSale')} size="lg" fullWidth loading={openingKey === 'blank'} onPress={() => void open('blank')} />
        ) : null}

        {showFigures ? (
          <TodayFiguresCard
            dateYmd={takings.data?.from ?? salesToday.data?.from ?? venueToday}
            netPence={takings.data?.totals.net_pence ?? null}
            salesCount={salesToday.data?.totals.sales_count ?? null}
            tipsPence={takings.data?.totals.tips_pence ?? null}
            error={takings.isError || salesToday.isError}
            onRetry={() => {
              void takings.refetch();
              void salesToday.refetch();
            }}
          />
        ) : null}

        {isAdmin ? <AttentionCard alerts={alerts.data?.alerts} /> : null}

        {boot.data.settings?.cash_management_enabled === true ? <TillCard /> : null}

        <SectionTitle title={t('till.tab.queue')} count={queueRows.length} />
        {queue.isLoading ? (
          <ListSkeleton rows={2} />
        ) : queue.isError ? (
          <ErrorState message={t('queue.error')} onRetry={() => void queue.refetch()} />
        ) : queueRows.length === 0 ? (
          <EmptyCard title={t('queue.empty.title')} body={t('app.queue.explain')} />
        ) : (
          <>
            {/* How clients get here, so a quiet queue never looks broken. */}
            <Text variant="bodySmall" tone="muted">
              {t('app.queue.explain')}
            </Text>
            {queueRows.map((row) => (
              <QueueCard
                key={row.booking_id}
                row={row}
                canStart={canStart}
                opening={openingKey === row.booking_id}
                onCheckout={() =>
                  row.open_sale_id ? router.push(saleHref(row.open_sale_id)) : void open({ bookingId: row.booking_id })
                }
              />
            ))}
          </>
        )}

        <SectionTitle title={t('till.tab.open')} count={openRows.length} />
        {openSales.isLoading ? (
          <ListSkeleton rows={2} />
        ) : openSales.isError ? (
          <ErrorState
            message={openSales.error instanceof ApiError ? openSales.error.message : t('common.networkError')}
            onRetry={() => void openSales.refetch()}
          />
        ) : openRows.length === 0 ? (
          <EmptyCard title={t('sales.empty.title')} body={t('sales.empty.body')} />
        ) : (
          openRows.map((row) => <SaleRowCard key={row.id} row={row} onPress={() => router.push(saleHref(row.id))} />)
        )}

        <RowLink label={t('till.tab.all')} onPress={() => router.push('/checkout/all-sales' as Href)} />

        {onePerson ? null : <MySalesCard periods={!isAdmin} />}
      </ScrollView>
    </Screen>
  );
}

function QueueCard({
  row,
  canStart,
  opening,
  onCheckout,
}: {
  row: PosQueueRow;
  canStart: boolean;
  opening: boolean;
  onCheckout: () => void;
}) {
  const t = usePosT();
  const status =
    row.status === 'started' ? t('queue.status.started') : row.status === 'completed' ? t('queue.status.completed') : t('queue.status.arrived');
  const services = row.services
    .map((s) => (s.calendar_name ? `${s.name} with ${s.calendar_name}` : s.name))
    .join(', ');
  return (
    <Card>
      <View style={posStyles.stack}>
        <View style={styles.rowTop}>
          <View style={styles.flex}>
            <Text variant="label">{row.client_name ?? t('sales.walkIn')}</Text>
            <Text variant="caption" tone="muted">
              {[row.start_time?.slice(0, 5), services].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Badge label={status} tone="accent" />
        </View>
        <View style={styles.chips}>
          {queueChips(row).map((chip) => (
            <Badge
              key={chip.id}
              label={t(chip.id, { amount: chip.amountPence !== undefined ? money(chip.amountPence) : '', saleNo: chip.saleNo ?? '' })}
              tone={chip.tone}
            />
          ))}
        </View>
        <View style={styles.rowTop}>
          <Text variant="bodyMedium" style={styles.flex}>
            {row.price_unknown ? '' : t('queue.due', { amount: money(row.balance_due_pence) })}
          </Text>
          {canStart || row.open_sale_id ? (
            <Button label={t('queue.checkout')} size="sm" loading={opening} onPress={onCheckout} />
          ) : null}
        </View>
      </View>
    </Card>
  );
}

/**
 * The till at a glance (UX spec §7.1, §2.2 `home.till.*`, §13.5), only while the venue counts cash in
 * till sessions: each till open or closed, a till left open from an earlier day, and the way into
 * the Till screen, where the till is opened, cash goes in and out and the day is closed.
 */
function TillCard() {
  const t = usePosT();
  const router = useRouter();
  const tills = useTillSessions();
  const data = tills.data;
  if (!data?.cash.enabled) return null;
  const ordered = tillsInOrder(data.tills);
  return (
    <Card onPress={() => router.push('/checkout/till' as Href)} accessibilityRole="button" accessibilityLabel={t('app.till.title')}>
      <View style={posStyles.stack}>
        <View style={styles.rowTop}>
          <Text variant="label" style={styles.flex}>
            {t('till.tab.till')}
          </Text>
          {ordered.some((x) => x.session) ? (
            <Badge label={t('session.chip.open')} tone="success" />
          ) : (
            <Badge label={t('session.chip.closed')} />
          )}
        </View>
        {ordered.map((till) => (
          <Text key={till.id} variant="bodySmall" tone={isLeftOpen(till, data.today) ? 'danger' : 'muted'}>
            {till.session
              ? isLeftOpen(till, data.today)
                ? t('home.till.leftOpen', { till: till.name, date: businessDateLabel(till.session.business_date) })
                : t('home.till.open', { till: till.name, time: timeOf(till.session.opened_at) })
              : t('home.till.closed', { till: till.name })}
          </Text>
        ))}
        <Button label={t('app.till.open')} size="sm" variant="secondary" onPress={() => router.push('/checkout/till' as Href)} />
      </View>
    </Card>
  );
}

/**
 * "Your sales and tips" (`app.mine.*`, UX spec §13.3, §22.3): this person's own figures only, from
 * the commission report's `mine=1`, with their commission so far when they hold
 * `see_own_commission`. A team member chooses today, this week or this month; an admin sees today's,
 * under the business's day at the top, without commission (as on the web: the venue is who pays it).
 * A server before Pass LC answers nothing, and the card is not shown.
 */
function MySalesCard({ periods }: { periods: boolean }) {
  const t = usePosT();
  const [chosen, setChosen] = useState<PosMinePeriod>('today');
  const period: PosMinePeriod = periods ? chosen : 'today';
  const mine = useMyCommission(period);
  if (mine.data === null) return null;
  const data = mine.data;
  const figures = data && data.mine.period === period ? data.mine : null;
  const showCommission = periods && Boolean(data?.can.see_commission) && figures?.commission_pence != null;
  const nothing = figures && figures.sales_pence === 0 && figures.tips_pence === 0 && !(figures.commission_pence ?? 0);
  return (
    <Card>
      <View style={posStyles.stack}>
        <Text variant="overline" tone="muted" accessibilityRole="header">
          {periods ? t('app.mine.title') : t('app.home.mineToday')}
        </Text>
        {periods ? (
          <Segmented
            options={[
              { value: 'today', label: t('app.mine.today') },
              { value: 'week', label: t('app.mine.week') },
              { value: 'month', label: t('comm.mine.period.month') },
            ]}
            value={chosen}
            onChange={setChosen}
          />
        ) : null}
        {mine.isError ? (
          <Notice tone="warning" action={{ label: t('common.tryAgain'), onPress: () => void mine.refetch() }}>
            {t('app.mine.error')}
          </Notice>
        ) : !figures ? (
          <Text variant="bodySmall" tone="muted">
            {t('app.loading')}
          </Text>
        ) : nothing ? (
          <Text variant="bodySmall" tone="muted">
            {t('app.mine.none')}
          </Text>
        ) : (
          <View style={styles.mine}>
            <Text variant="bodyMedium">{t('app.mine.sales', { amount: money(figures.sales_pence) })}</Text>
            <Text variant="bodyMedium">{t('app.mine.tips', { amount: money(figures.tips_pence) })}</Text>
            {showCommission ? (
              <>
                <Text variant="bodyMedium">{t('comm.mine.commission', { amount: money(figures.commission_pence ?? 0) })}</Text>
                <Text variant="caption" tone="muted">
                  {t('comm.mine.note', { venue: data?.venue.name || 'your venue' })}
                </Text>
              </>
            ) : null}
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  mine: { gap: spacing.xxs },
});
